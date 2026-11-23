import * as THREE from 'three';
import { CONFIG } from '../../config.js';

// Low chase camera with a little lag. Swings round behind the nose (blended
// toward the travel direction), widens FOV with speed, shakes at speed and on
// impacts, and never clips into the ground or tunnel ceilings.
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class ChaseCamera {
  constructor(aspect = 16 / 9) {
    const C = CONFIG.camera;
    this.cam = new THREE.PerspectiveCamera(C.fovBase, aspect, C.near, C.far);
    this.yaw = 0; this.y = 0; this.init = false; this.shake = 0; this.t = 0;
    this.g = {};
  }

  addShake(amount) { this.shake = Math.min(1.5, this.shake + amount); }

  snap() { this.init = false; }

  // s: interpolated pod state { x, y, z, yaw, vx, vz, speed }
  update(s, dt, track) {
    const C = CONFIG.camera;
    this.t += dt;
    let targetYaw = s.yaw;
    if (s.speed > 6) {
      const velYaw = Math.atan2(s.vx, s.vz);
      // don't blend toward travel direction when going backwards
      const diff = wrap(velYaw - s.yaw);
      if (Math.abs(diff) < 2) targetYaw = s.yaw + diff * C.velocityBlend;
    }
    if (!this.init) { this.yaw = targetYaw; this.y = s.y + C.height; this.init = true; }
    this.yaw += wrap(targetYaw - this.yaw) * (1 - Math.exp(-C.yawStiffness * dt));

    const dist = C.distance + Math.min(s.speed, 80) * 0.015;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let x = s.x - fx * dist, z = s.z - fz * dist;
    let ty = s.y + C.height;
    let g = track.ground(x, z, this.g);
    // keep the camera inside the canyon walls (no clipping into rock on tight corners)
    const lim = track.runoff - C.wallMargin;
    if (g.path && g.edge > lim) {
      const dx = g.cx - x, dz = g.cz - z, len = Math.hypot(dx, dz) || 1, k = Math.min(len, g.edge - lim) / len;
      x += dx * k; z += dz * k;
      g = track.ground(x, z, this.g);
    }
    ty = Math.max(ty, g.h + 0.7);
    this.y += (ty - this.y) * (1 - Math.exp(-C.followStiffness * dt));
    let y = Math.max(this.y, g.h + 0.5);
    if (g.ceiling < Infinity) y = Math.min(y, g.ceiling - C.ceilingMargin);

    // shake: speed + impacts
    const sp = Math.max(0, (s.speed - C.shakeStart) / Math.max(1, C.fovSpeedRef - C.shakeStart));
    this.shake *= Math.exp(-5 * dt);
    const amp = C.shakeAmount * sp + this.shake * 0.25;
    const t = this.t;
    const sx = (Math.sin(t * 37) + Math.sin(t * 23.7)) * 0.5 * amp;
    const sy = (Math.sin(t * 41.3) + Math.sin(t * 29.1)) * 0.5 * amp;

    this.cam.position.set(x + sx * fz, y + sy, z - sx * fx);
    this.cam.lookAt(s.x + fx * C.lookAhead, s.y + C.lookHeight, s.z + fz * C.lookAhead);
    const fov = C.fovBase + C.fovSpeed * Math.min(s.speed / C.fovSpeedRef, 1.2) + CONFIG.slipstream.fovBoost * (s.slipstream || 0);
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
  }

  setAspect(a) { this.cam.aspect = a; this.cam.updateProjectionMatrix(); }
}
