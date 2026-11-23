import { CONFIG } from '../../config.js';

// ============================================================================
//  Heat, boost, vent, overheat, timed start. Runs before the engines each tick.
//  Writes the effective engine commands + thrust/top-speed multipliers onto the
//  pod; handling.js applies them.
// ============================================================================

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export const zoneOf = (heat) => (heat >= 1 ? 2 : heat >= CONFIG.heat.yellowStart ? 1 : 0);

export function initHeat(pod) {
  Object.assign(pod, {
    heat: 0, zone: 0, stall: 0, boost: 0, ventCd: 0, ventLockT: 0, kickLeft: 0, kickRate: 0,
    launchT: 0, flooded: false, locked: false, lastVentCount: 0,
    thrustMult: 1, falloffMult: 1, cmdL: 0, cmdR: 0,
  });
}

export function resetHeat(pod, ventCount = 0) {
  initHeat(pod);
  pod.lastVentCount = ventCount;
}

// input: { l, r, od, ventCount, keyboard?, gamepad? }
export function updateHeat(pod, input, dt) {
  const H = CONFIG.heat;
  const local = !!(input.keyboard || input.gamepad);

  // ---- vent press (edge: counter increased) ----
  if (input.ventCount < pod.lastVentCount) pod.lastVentCount = input.ventCount; // phone reconnected
  const pressed = input.ventCount > pod.lastVentCount;
  pod.lastVentCount = input.ventCount;
  pod.ventCd = Math.max(0, pod.ventCd - dt);
  pod.ventLockT = Math.max(0, pod.ventLockT - dt);
  if (pressed && pod.ventCd <= 0 && pod.stall <= 0 && !pod.locked) doVent(pod, local);

  // ---- commands ----
  let cl = input.l, cr = input.r;
  if (pod.ventLockT > 0) { const k = 1 - H.ventLocalCut; cl *= k; cr *= k; }
  const stalled = pod.stall > 0;
  if (stalled) cl = cr = 0;

  // ---- boost: both throttles in the overdrive band ----
  const wantBoost = !stalled && !pod.locked && input.od === 3 && cl > 0.9 && cr > 0.9;
  pod.boost += ((wantBoost ? 1 : 0) - pod.boost) * (1 - Math.exp(-dt / Math.max(1e-3, H.boostRamp)));
  if (pod.boost < 0.001) pod.boost = 0;

  // ---- heat ----
  const pos = (v) => Math.max(0, v), neg = (v) => Math.max(0, -v);
  const lvl = (pos(cl) + pos(cr) + H.reverseHeat * (neg(cl) + neg(cr))) / 2;
  if (stalled) {
    pod.heat = Math.max(H.restartHeat, pod.heat - ((1 - H.restartHeat) / H.stallTime) * dt);
    pod.stall -= dt;
    if (pod.stall <= 0) { pod.stall = 0; pod.events.push({ type: 'recover' }); }
  } else {
    const yellow = pod.heat >= H.yellowStart;
    const rate = pod.locked ? H.revHeatRate : H.gainThrust;
    const gain = rate * lvl * (1 + (H.boostHeatMult - 1) * pod.boost) * (yellow ? H.yellowGainMult : 1);
    const idle = clamp(1 - lvl / Math.max(1e-3, H.idleThrust), 0, 1);
    const air = pod.airborne ? CONFIG.air.cooling : 1;
    const cool = (H.coolBase + H.coolIdle * idle) * air;
    pod.heat = clamp(pod.heat + (gain - cool) * dt, 0, 1);
    if (pod.heat >= 1) {
      if (pod.locked) { pod.flooded = true; }
      else {
        pod.stall = H.stallTime; pod.boost = 0; pod.launchT = 0;
        pod.events.push({ type: 'overheat' });
      }
    }
  }
  if (pod.locked && pod.heat < 1) pod.flooded = false;
  pod.zone = zoneOf(pod.heat);

  // ---- multipliers for handling ----
  const yb = smooth((pod.heat - H.yellowStart) / 0.06) * (stalled ? 0 : 1);
  pod.launchT = Math.max(0, pod.launchT - dt);
  const lb = pod.launchT > 0 ? 1 : 0;
  pod.thrustMult = (1 + (H.yellowThrust - 1) * yb) * (1 + (H.boostThrust - 1) * pod.boost) * (lb ? H.launchThrust : 1);
  pod.falloffMult = (1 + (H.yellowTopSpeed - 1) * yb) * (1 + (H.boostTopSpeed - 1) * pod.boost) * (lb ? 1.1 : 1);
  pod.cmdL = cl; pod.cmdR = cr;
}

function doVent(pod, local) {
  const H = CONFIG.heat, h = pod.heat;
  let kind, dump, kick;
  if (h < H.yellowStart) { kind = 'green'; dump = H.ventGreenDump; kick = H.ventGreenKick; }
  else if (h >= H.perfectLow && h <= H.perfectHigh) { kind = 'perfect'; dump = H.perfectDump; kick = H.perfectKick; }
  else { kind = h < H.perfectLow ? 'early' : 'late'; dump = H.ventDump; kick = H.ventKick; }
  pod.heat = Math.max(0, h - dump);
  pod.kickLeft += kick; pod.kickRate = pod.kickLeft / Math.max(0.02, H.ventKickTime);
  pod.ventCd = H.ventCooldown;
  if (local) pod.ventLockT = H.ventLocalTime;
  pod.events.push({ type: 'vent', kind, heat: h, kick });
}

// Spread the vent / launch kick over a short time along the nose.
export function applyKick(pod, dt) {
  if (pod.kickLeft <= 0) return;
  const k = Math.min(pod.kickLeft, pod.kickRate * dt);
  pod.kickLeft -= k;
  pod.vx += Math.sin(pod.yaw) * k; pod.vz += Math.cos(pod.yaw) * k;
}

// Called at GO: evaluates the sweet spot.
export function launch(pod) {
  const H = CONFIG.heat;
  pod.locked = false;
  if (pod.flooded || pod.heat >= 1) {
    pod.flooded = false; pod.heat = 1; pod.stall = H.stallTime; pod.boost = 0;
    pod.events.push({ type: 'flood' });
  } else if (pod.heat >= H.startLow && pod.heat <= H.startHigh) {
    pod.launchT = H.launchTime; pod.kickLeft += H.launchKick; pod.kickRate = pod.kickLeft / 0.4;
    pod.events.push({ type: 'launch', heat: pod.heat });
  } else {
    pod.events.push({ type: 'slowstart', heat: pod.heat });
  }
}
