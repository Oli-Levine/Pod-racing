import { CONFIG } from '../../config.js';

// ============================================================================
//  Boost meter. Runs before the engines each tick.
//  Hold boost (A / X on the gamepad, Shift on the keyboard, both throttles in the
//  overdrive band on a phone) with the engines pushing forward: thrust and top speed go
//  up while the meter drains. Off boost the meter refills after a short delay.
//  Emptying the meter locks boost until it has refilled to `relockAt`.
//  Writes the effective engine commands + thrust/top-speed multipliers onto the
//  pod; handling.js applies them.
// ============================================================================

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function initBoost(pod) {
  Object.assign(pod, {
    boost: 0, boostMeter: CONFIG.boost.startMeter, boostLocked: false, boostIdle: 0,
    kickLeft: 0, kickRate: 0, locked: false,
    thrustMult: 1, falloffMult: 1, cmdL: 0, cmdR: 0,
  });
}

export function resetBoost(pod) {
  initBoost(pod);
}

// input: { l, r, od, keyboard?, gamepad? }
export function updateBoost(pod, input, dt) {
  const B = CONFIG.boost;

  // ---- commands ----
  let cl = input.l, cr = input.r;
  if (pod.penalty > 0) cl = cr = 0; // serving a reset penalty: engines cut
  pod.penalty = Math.max(0, pod.penalty - dt);

  // ---- boost: engines pushing forward (on average) + boost held ----
  const fwd = (Math.max(0, cl) + Math.max(0, cr)) / 2;
  const wantBoost = !pod.locked && pod.penalty <= 0 && input.od === 3 && fwd >= B.minThrottle;
  const boosting = wantBoost && !pod.boostLocked && pod.boostMeter > 0;
  if (boosting) {
    pod.boostMeter = Math.max(0, pod.boostMeter - B.drainRate * dt);
    pod.boostIdle = 0;
    if (pod.boostMeter <= 0) {
      pod.boostLocked = true;
      pod.events.push({ type: 'boostEmpty' });
    }
  } else {
    pod.boostIdle += dt;
    if (pod.boostIdle >= B.regenDelay) {
      const air = pod.airborne ? B.airRegenMult : 1;
      pod.boostMeter = Math.min(1, pod.boostMeter + B.regenRate * air * dt);
    }
    if (pod.boostLocked && pod.boostMeter >= B.relockAt) pod.boostLocked = false;
  }
  pod.boost += ((boosting ? 1 : 0) - pod.boost) * (1 - Math.exp(-dt / Math.max(1e-3, B.ramp)));
  if (pod.boost < 0.001) pod.boost = 0;

  // ---- multipliers for handling ----
  pod.thrustMult = 1 + (B.thrust - 1) * pod.boost;
  pod.falloffMult = 1 + (B.topSpeed - 1) * pod.boost;
  pod.cmdL = cl; pod.cmdR = cr;
}

// Spread a speed kick (slide payout) over a short time along the nose.
export function applyKick(pod, dt) {
  if (pod.kickLeft <= 0) return;
  const k = Math.min(pod.kickLeft, pod.kickRate * dt);
  pod.kickLeft -= k;
  pod.vx += Math.sin(pod.yaw) * k; pod.vz += Math.cos(pod.yaw) * k;
}
