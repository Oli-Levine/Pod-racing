import * as THREE from 'three';

// ============================================================================
//  Placeholder pod: junk-built "used future" racer. Two oversized engine
//  nacelles out front, tethered to a small trailing cockpit. Patched panels,
//  primer, rust and a stripe of the player's colour. Low-poly, flat shaded.
//  Origin = physics centre. +Z = forward.
// ============================================================================

import { CONFIG } from '../../config.js';

const COOL = new THREE.Color('#bfe6ff'), AMBER = new THREE.Color('#ffa83a'), RED = new THREE.Color('#ff2410');
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, metalness: 0.25, ...extra });

export function createPodMesh(color) {
  const root = new THREE.Group();     // yaw + position
  const body = new THREE.Group();     // pitch / roll
  root.add(body);
  root.rotation.order = 'YXZ';
  body.rotation.order = 'YXZ';

  const team = mat(color);
  const metal = mat('#8a8378');
  const primer = mat('#5d5a54');
  const rust = mat('#8b4a2b');
  const dark = mat('#26221f', { metalness: 0.5 });
  const glass = mat('#1d3340', { metalness: 0.8, roughness: 0.2 });
  const exhaustMat = new THREE.MeshBasicMaterial({ color: '#9fd4ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });

  const engines = [];
  for (const side of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(side * 1.6, 0.35, 1.3); // side -1 = right (+X is the pod's left)
    // nacelle
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.62, 4.4, 8), metal);
    nac.rotation.x = Math.PI / 2; e.add(nac);
    // intake ring + dark intake
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.14, 5, 8), dark);
    ring.position.z = 2.2; e.add(ring);
    const intake = new THREE.Mesh(new THREE.CircleGeometry(0.62, 8), dark);
    intake.position.z = 2.21; e.add(intake);
    // patch panels
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 1.3), rust);
    p1.position.set(side * -0.25, 0.62, 0.6); p1.rotation.z = side * 0.3; e.add(p1);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 1.0), primer);
    p2.position.set(side * 0.62, 0, -0.7); e.add(p2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.2, 0.5), team);
    stripe.position.set(0, 0.15, 1.3); e.add(stripe);
    // fin
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 1.4), team);
    fin.position.set(0, 0.9, -1.2); fin.rotation.x = -0.35; e.add(fin);
    // nozzle
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.5, 8, 1, true), dark);
    noz.rotation.x = Math.PI / 2; noz.position.z = -2.4; e.add(noz);
    // exhaust flame (scaled by thrust)
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1, 8, 1, true), exhaustMat);
    flame.rotation.x = -Math.PI / 2; flame.position.z = -2.65; e.add(flame);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.46, 8), exhaustMat.clone());
    core.rotation.y = Math.PI; core.position.z = -2.5; e.add(core);
    body.add(e);
    engines.push({ group: e, flame, core });
  }
  // crossbar between engines
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.3), primer);
  bar.position.set(0, 0.35, 1.0); body.add(bar);

  // trailing cockpit
  const pit = new THREE.Group();
  pit.position.set(0, 0.15, -3.0);
  const hull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), team);
  hull.scale.set(0.95, 0.6, 1.5); pit.add(hull);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.position.set(0, 0.3, 0.3); canopy.scale.set(1, 0.8, 1.4); pit.add(canopy);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.8), rust);
  tail.position.set(0, 0.5, -1.0); pit.add(tail);
  body.add(pit);

  // tethers (cockpit -> engines)
  const tetherMat = mat('#222');
  for (const side of [-1, 1]) {
    const a = new THREE.Vector3(side * 1.5, 0.35, -0.6), b = new THREE.Vector3(side * 0.4, 0.2, -2.4);
    const len = a.distanceTo(b);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 4), tetherMat);
    t.position.copy(a).add(b).multiplyScalar(0.5);
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    body.add(t);
  }

  // hover glow under the pod
  const glow = new THREE.Mesh(new THREE.CircleGeometry(2.4, 12),
    new THREE.MeshBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = -0.9; body.add(glow);

  body.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; } });

  return {
    root, engines,
    // engine glow colour from heat: cool blue-white -> amber -> angry red
    glowColor(heat, out) {
      const Y = CONFIG.heat.yellowStart;
      if (heat < Y) return out.copy(COOL).lerp(AMBER, Math.pow(Math.max(0, heat - Y * 0.55) / (Y * 0.45), 1.5));
      return out.copy(AMBER).lerp(RED, Math.min(1, (heat - Y) / (1 - Y)));
    },
    update(state, time) {
      root.position.set(state.x, state.y, state.z);
      root.rotation.y = state.yaw;
      body.rotation.x = state.pitch;
      body.rotation.z = state.roll;
      const thr = [state.engR, state.engL]; // engines[0] is at -X = the pod's RIGHT (forward is +Z)
      this.glowColor(state.heat, exhaustMat.color);
      const sputter = state.stall > 0 ? 1 : Math.max(0, (state.heat - 0.88) / 0.12);
      engines.forEach((e, i) => {
        e.core.material.color.copy(exhaustMat.color);
        let t = Math.max(0, thr[i]);
        let flick = 0.85 + 0.15 * Math.sin(time * 60 + i * 2);
        if (sputter > 0) { // angry sputtering: flame chops in and out
          const n = Math.sin(time * 47 + i * 5.3) * Math.sin(time * 31.7 + i);
          flick *= n > 1 - sputter * 1.4 ? 0.1 : 1;
          if (state.stall > 0) t *= Math.max(0, Math.sin(time * 9 + i * 3) - 0.6) * 0.8;
        }
        e.sputtering = sputter > 0;
        e.flame.scale.set(0.6 + t * 0.5, 0.3 + t * 2.6 * flick, 0.6 + t * 0.5);
        e.flame.position.z = -2.5 - (0.15 + t * 1.3 * flick);
        e.core.material.opacity = 0.35 + t * 0.6;
      });
      glow.material.color.copy(exhaustMat.color).lerp(COOL, 0.5);
      glow.material.opacity = state.airborne ? 0.05 : 0.18;
    },
  };
}
