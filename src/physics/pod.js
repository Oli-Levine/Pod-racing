// Pod rigid-body state. Heading (yaw) and velocity are independent: the pod can
// travel in a different direction to where it faces.
//   forward = (sin yaw, 0, cos yaw), right = (-cos yaw, 0, sin yaw)
//   yaw increasing = turning LEFT. yawRate < 0 = turning right.
import { initBoost } from './boost.js';

export function createPod(slot) {
  const pod = {
    slot,
    x: 0, y: 0, z: 0,          // position (y = height of the pod centre)
    vx: 0, vy: 0, vz: 0,       // velocity
    yaw: 0, yawRate: 0,
    engL: 0, engR: 0,          // applied engine thrust -reverse..1 (lags input by engineSpool)
    contact: 1,                // 0..1 hover contact with the ground (grip & thrust scale)
    airborne: false, airTime: 0,
    support: 0,                // hover support accel this tick
    surface: 'rock', onTrack: true, progress: 0,
    slip: 0, speed: 0, accelF: 0,
    // visuals (smoothed)
    pitch: 0, roll: 0, wobble: 0, wobbleT: 0,
    // interpolation
    px: 0, py: 0, pz: 0, pyaw: 0, ppitch: 0, proll: 0,
    events: [],                // landing / lap events for HUD + effects, drained by the game
    assist: false,
    drift: 0, drifting: false, driftHeld: false,
    charge: 0, slideState: 'idle', slideOverT: 0, slipstream: 0, dragMult: 1, wakeFollowed: 0,
    touching: false, wallNx: 0, wallNz: 0, scrape: 0, hitCd: 0, stuckT: 0, stuckX: 0, stuckZ: 0, penalty: 0, resetReason: null,
    ground: {},
  };
  initBoost(pod);
  return pod;
}

export function placePod(pod, pose, rideHeight) {
  pod.x = pod.px = pose.x; pod.z = pod.pz = pose.z;
  pod.y = pod.py = pose.y + rideHeight;
  pod.yaw = pod.pyaw = pose.yaw;
  pod.vx = pod.vy = pod.vz = 0; pod.yawRate = 0; pod.engL = pod.engR = 0;
  pod.pitch = pod.roll = pod.ppitch = pod.proll = 0; pod.wobble = 0; pod.kickLeft = 0; pod.boost = 0; pod.drift = 0; pod.drifting = false; pod.stuckT = 0; pod.stuckX = pod.x; pod.stuckZ = pod.z; pod.resetReason = null;
  pod.airborne = false; pod.airTime = 0; pod.contact = 1;
}

export function savePrev(pod) {
  pod.px = pod.x; pod.py = pod.y; pod.pz = pod.z; pod.pyaw = pod.yaw; pod.ppitch = pod.pitch; pod.proll = pod.roll;
}
