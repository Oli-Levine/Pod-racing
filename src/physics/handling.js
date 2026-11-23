import { CONFIG } from '../../config.js';
import { surface } from '../track/surfaces.js';

// ============================================================================
//  Planar handling: twin-engine thrust, yaw torque with inertia, surface grip,
//  slip speed loss, drag, top-speed curve, beginner assist.
// ============================================================================

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DEG = Math.PI / 180;

// Thrust efficiency vs speed along the thrust direction: 1 at rest, 0.5 at
// thrustFalloffSpeed, tailing off smoothly. Top speed emerges where thrust = drag.
export function efficiency(speedAlong, falloffMult = 1) {
  const H = CONFIG.handling;
  if (speedAlong <= 0) return 1;
  return 1 / (1 + Math.pow(speedAlong / (H.thrustFalloffSpeed * falloffMult), H.thrustFalloffSharpness));
}

// Engines spool toward the commanded thrust.
export function updateEngines(pod, input, dt) {
  const P = CONFIG.pod;
  const k = 1 - Math.exp(-dt / Math.max(1e-3, P.engineSpool));
  const tl = input.l < 0 ? input.l * P.reverseThrust : input.l;
  const tr = input.r < 0 ? input.r * P.reverseThrust : input.r;
  pod.engL += (tl - pod.engL) * k;
  pod.engR += (tr - pod.engR) * k;
}

export function applyHandling(pod, g, dt) {
  const P = CONFIG.pod, H = CONFIG.handling, A = CONFIG.air, AS = CONFIG.assist;
  const c = pod.contact;
  const surf = surface(g.surface);
  const fx = Math.sin(pod.yaw), fz = Math.cos(pod.yaw), rx = -fz, rz = fx;
  let vf = pod.vx * fx + pod.vz * fz;
  let vl = pod.vx * rx + pod.vz * rz;

  // ---- thrust (along the nose) --------------------------------------------
  const thrustScale = A.thrust + (1 - A.thrust) * c;
  const fl = pod.engL * P.thrust, fr = pod.engR * P.thrust;
  const fm = pod.falloffMult;
  const effL = efficiency(pod.engL >= 0 ? vf : -vf, fm), effR = efficiency(pod.engR >= 0 ? vf : -vf, fm);
  const aF = ((fl * effL + fr * effR) / P.mass) * thrustScale * pod.thrustMult;
  vf += aF * dt;
  pod.accelF = aF;

  // ---- yaw: differential thrust = torque, rotation has inertia --------------
  // (torque uses raw thrust: you can still rotate at top speed)
  const torqueScale = A.yawAuthority + (1 - A.yawAuthority) * c;
  const yawAcc = ((fr - fl) * P.engineArm / P.yawInertia) * torqueScale;
  const speed0 = Math.hypot(vf, vl);
  const slipDeg0 = speed0 > 2 ? Math.atan2(Math.abs(vl), Math.abs(vf)) / DEG : 0;
  const slide = clamp((slipDeg0 - H.slideStart) / H.slideStart, 0, 1); // 0 gripping .. 1 fully sliding
  const gripDamp = H.gripYawDamping * Math.min((speed0 / H.gripYawRefSpeed) ** 2, 1) * (1 - H.slideYawFreedom * slide) * c * surf.grip;
  const damp = H.yawDamping * c + A.yawDamping * (1 - c) + gripDamp;
  pod.yawRate += yawAcc * dt;
  pod.yawRate *= Math.exp(-damp * dt);
  if (pod.assist) {
    // pull yaw rate to the steady value for the current input, capped
    const target = clamp((AS.turnScale * yawAcc) / Math.max(damp, 0.5), -AS.maxYawRate, AS.maxYawRate);
    pod.yawRate += (target - pod.yawRate) * (1 - Math.exp(-AS.yawStabilise * dt));
  }
  pod.yaw += pod.yawRate * dt;

  // ---- lateral grip ----------------------------------------------------------
  // Grip removes sideways velocity up to a limit. Past slideStart the pod breaks
  // loose and only slideGrip of the limit is left.
  const sliding = slipDeg0 > H.slideStart;
  const maxLat = H.lateralGrip * surf.grip * c * (sliding ? H.slideGrip : 1);
  const want = -vl * (1 - Math.exp(-H.gripResponse * dt));
  vl += clamp(want, -maxLat * dt, maxLat * dt);

  if (pod.assist && c > 0) { // partial slip correction: swing velocity toward the nose
    const k = 1 - Math.exp(-AS.slipCorrect * c * dt);
    const removed = vl * k;
    vl -= removed;
    vf += Math.sign(vf || 1) * Math.abs(removed) * AS.slipCorrectKeep;
  }

  // ---- speed loss: slip, drag -----------------------------------------------------
  const speed = Math.hypot(vf, vl);
  const sinSlip = speed > 0.5 ? Math.abs(vl) / speed : 0;
  const loss = H.slipSpeedLoss * sinSlip * c + H.dragLinear + surf.drag * c + H.dragAero * speed;
  const keep = Math.exp(-loss * dt);
  vf *= keep; vl *= keep;

  pod.vx = fx * vf + rx * vl;
  pod.vz = fz * vf + rz * vl;
  pod.speed = Math.hypot(pod.vx, pod.vz);
  pod.slip = pod.speed > 2 ? Math.atan2(vl, Math.abs(vf)) : 0; // signed, + = sliding to the right
  pod.surface = g.surface;
}
