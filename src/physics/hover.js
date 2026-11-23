import { CONFIG } from '../../config.js';

// ============================================================================
//  Hover: spring-damper ride height that follows the terrain, airborne state,
//  landing penalties, and the visual body tilt (pitch/roll/lean/wobble).
// ============================================================================

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DEG = Math.PI / 180;

// Vertical forces. Call before integration. Sets pod.contact and pod.support.
export function applyHover(pod, g, dt) {
  const HV = CONFIG.hover, G = CONFIG.physics.gravity;
  const hh = pod.y - g.h;
  pod.contact = clamp((HV.range - hh) / (HV.range - HV.rideHeight), 0, 1);
  // how fast the ground under us is rising (so the damper follows terrain, and ramps launch you)
  const terrainVy = g.gx * pod.vx + g.gz * pod.vz;
  pod.terrainVy = terrainVy;
  let support = 0;
  if (hh < HV.range) support = Math.max(0, G + HV.spring * (HV.rideHeight - hh) + HV.damping * (terrainVy - pod.vy));
  pod.support = support;
  pod.vy += (support - G) * dt;
  // hover force pushes along the ground normal: on a slope part of it pushes
  // you downhill (climbs cost speed, descents add it)
  pod.vx -= g.gx * support * dt;
  pod.vz -= g.gz * support * dt;
}

// After integration: hard floor, ceilings, airborne + landing.
export function resolveVertical(pod, g, dt) {
  const HV = CONFIG.hover, A = CONFIG.air;
  const floor = g.h + HV.minClearance;
  if (pod.y < floor) {
    pod.y = floor;
    if (pod.vy < pod.terrainVy) pod.vy = Math.min(pod.terrainVy, 0) + Math.max(0, pod.terrainVy) * 0.5;
  }
  if (pod.y > g.ceiling - 1) { pod.y = g.ceiling - 1; if (pod.vy > 0) pod.vy = 0; }

  const hh = pod.y - g.h;
  if (hh > HV.rideHeight + A.airborneAbove) {
    pod.airTime += dt;
    if (pod.airTime > 0.1) pod.airborne = true;
  } else {
    if (pod.airborne) land(pod);
    pod.airborne = false; pod.airTime = 0;
  }
}

function land(pod) {
  const A = CONFIG.air;
  const speed = Math.hypot(pod.vx, pod.vz);
  const fx = Math.sin(pod.yaw), fz = Math.cos(pod.yaw);
  let misalign = 0;
  if (speed > 5) misalign = Math.acos(clamp((pod.vx * fx + pod.vz * fz) / speed, -1, 1));
  const over = Math.max(0, misalign - A.landingTolerance * DEG);
  let loss = Math.min(A.landingMaxLoss, over * A.landingSpeedLoss);
  const impact = (pod.terrainVy || 0) - pod.vy; // downward speed relative to the ground
  if (impact > A.hardLandingSpeed) loss += (impact - A.hardLandingSpeed) * A.hardLandingLoss;
  loss = Math.min(loss, 0.8);
  pod.vx *= 1 - loss; pod.vz *= 1 - loss;
  if (over > 0) {
    // ground grabs the pod: kick it toward its velocity, and wobble
    const vl = pod.vx * -fz + pod.vz * fx; // + = velocity to the right of the nose
    pod.yawRate += -Math.sign(vl) * over * A.landingWobble;
    pod.wobble = Math.min(0.35, over * 0.6);
  }
  pod.events.push({ type: 'land', loss, misalign: misalign / DEG, clean: over === 0 && loss < 0.02 });
}

// Visual tilt: follow the ground, lean into turns, pitch with acceleration,
// follow the trajectory in the air, wobble after crooked landings.
export function updateVisualTilt(pod, g, dt) {
  const HV = CONFIG.hover;
  const fx = Math.sin(pod.yaw), fz = Math.cos(pod.yaw), rx = -fz, rz = fx;
  let tp, tr;
  if (!pod.airborne) {
    const slopeF = g.gx * fx + g.gz * fz, slopeR = g.gx * rx + g.gz * rz;
    tp = -Math.atan(slopeF) - clamp(pod.accelF / 9.81, -2, 2) * HV.pitchPerG;
    tr = -Math.atan(slopeR) + clamp(-pod.yawRate * pod.speed / 9.81, -4, 4) * HV.leanPerG;
  } else {
    tp = -Math.atan2(pod.vy, Math.max(pod.speed, 1)) * 0.6;
    tr = clamp(-pod.yawRate * 0.15, -0.4, 0.4);
  }
  pod.wobbleT += dt;
  pod.wobble *= Math.exp(-2.5 * dt);
  tr += Math.sin(pod.wobbleT * 17) * pod.wobble;
  const k = 1 - Math.exp(-HV.visualTiltFollow * dt);
  pod.pitch += (tp - pod.pitch) * k;
  pod.roll += (tr - pod.roll) * k;
}
