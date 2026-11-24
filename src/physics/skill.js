import { CONFIG } from '../../config.js';

// ============================================================================
//  Skill extras: slide-charge and slipstream.
// ============================================================================
const DEG = 180 / Math.PI;

// ---- Slide-charge -------------------------------------------------------------------
// Called every tick after handling (pod.slip is fresh).
export function updateSlide(pod, dt) {
  const S = CONFIG.slide;
  const slipDeg = Math.abs(pod.slip) * DEG;
  // While drifting the band is wider (CONFIG.drift.chargeBandHigh) and the engines only need to
  // average minThrust, because steering into a drift cuts the inner engine.
  const drifting = pod.drift > 0.5;
  const bandHigh = drifting ? CONFIG.drift.chargeBandHigh : S.bandHigh;
  const thrustOk = drifting ? (pod.cmdL + pod.cmdR) / 2 >= S.minThrust : pod.cmdL >= S.minThrust && pod.cmdR >= S.minThrust;
  const ok = !pod.airborne && pod.contact > 0.7 && pod.speed >= S.minSpeed && !pod.locked && pod.penalty <= 0 && thrustOk;
  let state = 'idle';

  if (ok && slipDeg >= S.bandLow && slipDeg <= bandHigh) {
    pod.charge = Math.min(1, pod.charge + S.chargeRate * dt);
    pod.slideOverT = 0;
    state = 'charging';
  } else if (ok && slipDeg > bandHigh) {
    // over-rotated: the slide is sloppy, the charge drains away
    const before = pod.charge;
    pod.charge = Math.max(0, pod.charge - S.overDrain * dt);
    pod.slideOverT += dt;
    state = 'over';
    if (before > 0.25 && pod.charge === 0) pod.events.push({ type: 'slideLost' });
  } else if (ok && slipDeg <= S.releaseSlip && pod.charge > 0) {
    // straightened out: cash in
    if (pod.charge >= S.minCharge) {
      const kick = S.payoutKick * pod.charge;
      pod.kickLeft += kick; pod.kickRate = pod.kickLeft / Math.max(0.05, S.payoutTime);
      pod.events.push({ type: 'slideRelease', charge: pod.charge, kick });
    }
    pod.charge = 0;
  } else {
    // between the band and the release angle, lifting off, airborne...: charge fades
    pod.charge = Math.max(0, pod.charge - (ok ? S.decay * 0.4 : S.decay) * dt);
    if (ok && pod.charge > 0) state = 'holding';
  }
  pod.slideState = state;
}

// ---- Slipstream ----------------------------------------------------------------------
// Call once per tick BEFORE stepping the pods (uses last tick's positions).
export function updateSlipstream(pods, dt) {
  const W = CONFIG.slipstream;
  for (const p of pods) p.wakeFollowed = 0;
  for (const p of pods) {
    let best = 0, leader = null;
    if (!p.locked && p.penalty <= 0 && p.speed > 8) {
      const pf = Math.sin(p.yaw), pz = Math.cos(p.yaw);
      for (const q of pods) {
        if (q === p || q.speed < W.minSpeed || q.penalty > 0 || Math.abs(q.y - p.y) > 4) continue;
        const qf = Math.sin(q.yaw), qz = Math.cos(q.yaw);
        if (pf * qf + pz * qz < 0.6) continue;          // not heading the same way
        const dx = p.x - q.x, dz = p.z - q.z;
        const dist = -(dx * qf + dz * qz);              // how far p is BEHIND q along q's heading
        if (!(dist > 0)) continue;
        const lat = Math.abs(dx * -qz + dz * qf);
        if (dist < W.minRange || dist > W.range || lat > W.width) continue;
        const k = (1 - dist / W.range) * (1 - lat / W.width) * Math.min(1, q.speed / 40);
        if (k > best) { best = k; leader = q; }
      }
    }
    // strength builds and fades smoothly; looks strongest close and centred
    const target = Math.min(1, best * 1.6);
    const rate = target > p.slipstream ? 1 / W.buildTime : 1 / W.fadeTime;
    p.slipstream += Math.sign(target - p.slipstream) * Math.min(Math.abs(target - p.slipstream), rate * dt);
    p.dragMult = 1 - W.dragCut * p.slipstream;
    if (leader && p.slipstream > 0.15) leader.wakeFollowed = Math.max(leader.wakeFollowed, p.slipstream);
  }
}
