import { CONFIG } from '../../config.js';

// ============================================================================
//  Drift: while the drift button is held (on the ground, above minSpeed) pod.drift
//  blends 0 -> 1. handling.js loosens grip, slip loss and yaw damping by it,
//  hover.js lifts the pod and banks the body, the camera follows the slide.
//  In the air the drift amount is held, so you can land into a drift.
// ============================================================================

export function updateDrift(pod, input, dt) {
  const D = CONFIG.drift;
  const held = !!input.drift;
  if (pod.airborne) { pod.driftHeld = held; return; }
  const want = held && pod.contact > 0.5 && pod.speed >= D.minSpeed && !pod.locked && pod.penalty <= 0;
  const target = want ? 1 : 0;
  const tc = want ? D.blendIn : D.blendOut;
  pod.drift += (target - pod.drift) * (1 - Math.exp(-dt / Math.max(1e-3, tc)));
  if (pod.drift < 0.001) pod.drift = 0;
  if (want && !pod.drifting) pod.events.push({ type: 'driftStart' });
  pod.drifting = want;
  pod.driftHeld = held;
}
