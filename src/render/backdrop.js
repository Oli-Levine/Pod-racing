import * as THREE from 'three';
import { CONFIG } from '../../config.js';

// Placeholder desert-canyon backdrop for the lobby (proves the Three.js pipeline).
export function createBackdrop(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.render.pixelRatioByViewports[1]));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e8a766');
  scene.fog = new THREE.Fog('#e8a766', 40, 160);
  const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

  scene.add(new THREE.HemisphereLight('#ffd9a8', '#7a3b1d', 0.8));
  const sun = new THREE.DirectionalLight('#ffe2b8', 2.2);
  sun.position.set(-60, 14, 30); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 200 });
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#c97b3f', flatShading: true }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rockMat = new THREE.MeshStandardMaterial({ color: '#b5602e', flatShading: true });
  for (let i = 0; i < 60; i++) {
    const s = 2 + rnd() * 9;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockMat);
    const a = rnd() * Math.PI * 2, r = 22 + rnd() * 90;
    rock.position.set(Math.cos(a) * r, s * 0.35, Math.sin(a) * r);
    rock.scale.y = 1 + rnd() * 1.6; rock.rotation.set(rnd(), rnd() * 6, rnd());
    rock.castShadow = rock.receiveShadow = true; scene.add(rock);
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  let t = 0, last = performance.now();
  (function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.1); last = now; t += dt * 0.05;
    cam.position.set(Math.cos(t) * 24, 5 + Math.sin(t * 1.7) * 1.2, Math.sin(t) * 24);
    cam.lookAt(0, 3, 0);
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  })(last);
}
