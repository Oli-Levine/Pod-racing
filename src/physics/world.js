import { CONFIG } from '../../config.js';
import { savePrev } from './pod.js';
import { updateEngines, applyHandling } from './handling.js';
import { updateHeat, applyKick } from './heat.js';
import { applyHover, resolveVertical, updateVisualTilt } from './hover.js';

// One fixed physics step for one pod.
// input: { l, r, od, vent, assist }  (l/r = -0.4..1 from the phone or keyboard)
export function stepPod(pod, input, track, dt) {
  savePrev(pod);
  pod.assist = !!input.assist;
  const g = track.groundWithSlope(pod.x, pod.z, pod.ground);
  updateHeat(pod, input, dt);
  updateEngines(pod, { l: pod.cmdL, r: pod.cmdR }, dt);
  applyHover(pod, g, dt);
  applyHandling(pod, g, dt);
  applyKick(pod, dt);
  if (pod.locked) { pod.vx = pod.vz = 0; pod.yawRate = 0; pod.speed = 0; } // held on the grid during the countdown
  pod.x += pod.vx * dt; pod.y += pod.vy * dt; pod.z += pod.vz * dt;
  const g2 = track.ground(pod.x, pod.z, pod.ground2 || (pod.ground2 = {}));
  g2.gx = g.gx; g2.gz = g.gz;
  resolveVertical(pod, g2, dt);
  updateVisualTilt(pod, g, dt);
  pod.onTrack = g2.onTrack;
  pod.progress = g2.progress;
  pod.outside = g2.outside;
}

export const PHYS_DT = () => 1 / CONFIG.physics.hz;
