import * as THREE from 'three';
import { CONFIG } from '../../config.js';

// Dust plumes kicked up behind pods + speed streaks around the camera.

const DUST_MAX = 2400;

export class Dust {
  constructor(scene) {
    this.pos = new Float32Array(DUST_MAX * 3); this.vel = new Float32Array(DUST_MAX * 3);
    this.col = new Float32Array(DUST_MAX * 3); this.life = new Float32Array(DUST_MAX); this.max = new Float32Array(DUST_MAX);
    this.size = new Float32Array(DUST_MAX); this.alpha = new Float32Array(DUST_MAX);
    this.next = 0; this.acc = new Map();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 }, fogColor: { value: new THREE.Color('#e9ad78') } },
      vertexShader: `attribute float size; attribute float alpha; varying float vA; varying vec3 vC; varying float vDepth;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = size * 600.0 / max(1.0, -mv.z); vA = alpha; vC = color; vDepth = -mv.z; }`,
      fragmentShader: `varying float vA; varying vec3 vC; varying float vDepth;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d); if (r > 0.25) discard;
          gl_FragColor = vec4(vC, vA * (1.0 - r * 4.0)); }`,
      vertexColors: true, transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.c = new THREE.Color();
  }

  // emit behind a pod (called per render frame)
  emit(pod, s, dt) {
    const F = CONFIG.fx;
    if (s.airborne || s.contact < 0.3) return;
    const speedF = Math.min(1, s.speed / 40);
    const slide = Math.min(1, Math.abs(s.slip) * 2);
    const rate = F.dustRate * (speedF * 0.8 + slide * 0.6 + Math.max(0, s.engL + s.engR) * 0.1) * (s.surface === 'rock' ? 0.6 : 1.4);
    let a = (this.acc.get(pod) || 0) + rate * dt;
    const surf = CONFIG.surfaces[s.surface] || CONFIG.surfaces.rock;
    this.c.set(surf.dust);
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    while (a >= 1) {
      a -= 1;
      const i = this.next; this.next = (this.next + 1) % DUST_MAX;
      const side = Math.random() < 0.5 ? -1 : 1;
      const k = i * 3;
      this.pos[k] = s.x - fx * 3.5 - fz * side * 1.6 + (Math.random() - 0.5) * 2;
      this.pos[k + 1] = s.groundH + 0.3;
      this.pos[k + 2] = s.z - fz * 3.5 + fx * side * 1.6 + (Math.random() - 0.5) * 2;
      this.vel[k] = s.vx * 0.35 + (Math.random() - 0.5) * 6 - fz * side * 3;
      this.vel[k + 1] = 1 + Math.random() * 3;
      this.vel[k + 2] = s.vz * 0.35 + (Math.random() - 0.5) * 6 + fx * side * 3;
      const sh = 0.85 + Math.random() * 0.2;
      this.col[k] = this.c.r * sh; this.col[k + 1] = this.c.g * sh; this.col[k + 2] = this.c.b * sh;
      this.max[i] = F.dustLife * (0.6 + Math.random() * 0.6); this.life[i] = this.max[i];
    }
    this.acc.set(pod, a);
  }

  update(dt) {
    for (let i = 0; i < DUST_MAX; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3, f = Math.max(0, this.life[i] / this.max[i]);
      const drag = Math.exp(-2.2 * dt);
      this.vel[k] *= drag; this.vel[k + 2] *= drag; this.vel[k + 1] = this.vel[k + 1] * drag + 0.4 * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] = 1 + (1 - f) * 6;
      this.alpha[i] = f * 0.45;
    }
    for (const n of ['position', 'color', 'size', 'alpha']) this.geo.attributes[n].needsUpdate = true;
  }
}

// Streaks flying past the camera at speed.
export class SpeedStreaks {
  constructor() {
    const N = 70;
    this.N = N;
    this.pts = Array.from({ length: N }, () => this.spawn({}, true));
    this.pos = new Float32Array(N * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo = geo;
    this.mat = new THREE.LineBasicMaterial({ color: '#fff6e6', transparent: true, opacity: 0, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
  }

  spawn(p, anyZ) {
    const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 5;
    p.x = Math.cos(a) * r; p.y = Math.sin(a) * r * 0.6; p.z = anyZ ? -5 - Math.random() * 60 : -65;
    return p;
  }

  // attach to camera (camera space: -Z forward)
  update(speed, dt) {
    const F = CONFIG.fx;
    const k = Math.max(0, Math.min(1, (speed - F.streakStart) / 30));
    this.mat.opacity = k * 0.35;
    this.lines.visible = k > 0;
    if (!k) return;
    const len = 1 + speed * 0.05;
    this.pts.forEach((p, i) => {
      p.z += speed * 1.4 * dt;
      if (p.z > 2) this.spawn(p, false);
      const o = i * 6;
      this.pos[o] = p.x; this.pos[o + 1] = p.y; this.pos[o + 2] = p.z;
      this.pos[o + 3] = p.x; this.pos[o + 4] = p.y; this.pos[o + 5] = p.z - len;
    });
    this.geo.attributes.position.needsUpdate = true;
  }
}
