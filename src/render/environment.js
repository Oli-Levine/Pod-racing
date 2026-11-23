import * as THREE from 'three';
import { CONFIG } from '../../config.js';

// Sky, harsh low sun, haze, desert floor and distant mesas.
export const SUN_DIR = new THREE.Vector3(-0.62, 0.3, 0.72).normalize(); // low sun -> long shadows

export function buildEnvironment(scene) {
  const horizon = new THREE.Color('#f0b47a'), zenith = new THREE.Color('#6f9fc4');
  scene.background = horizon.clone();
  scene.fog = new THREE.Fog('#e9ad78', 180, 1500);

  // gradient sky dome
  const skyGeo = new THREE.SphereGeometry(2000, 24, 12);
  const sc = [], p = skyGeo.attributes.position, tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 2000;
    tmp.copy(horizon).lerp(zenith, Math.pow(Math.max(0, y), 0.6));
    if (y < 0) tmp.copy(horizon).multiplyScalar(0.9);
    sc.push(tmp.r, tmp.g, tmp.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  scene.add(sky);
  // sun disc
  const sc2 = document.createElement('canvas'); sc2.width = sc2.height = 128;
  const sg = sc2.getContext('2d'), grad = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, '#fffaf0'); grad.addColorStop(0.18, '#fff1cc'); grad.addColorStop(0.3, 'rgba(255,220,160,0.55)'); grad.addColorStop(1, 'rgba(255,200,140,0)');
  sg.fillStyle = grad; sg.fillRect(0, 0, 128, 128);
  const sunTex = new THREE.CanvasTexture(sc2); sunTex.colorSpace = THREE.SRGBColorSpace;
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true }));
  sun.scale.setScalar(520); sun.renderOrder = -1;
  sun.position.copy(SUN_DIR).multiplyScalar(1900);
  scene.add(sun);
  // keep sky + sun centred on the camera so they never get closer
  scene.userData.skyFollow = [sky, sun];

  scene.add(new THREE.HemisphereLight('#ffe0b8', '#8a4a26', 1.15));
  const light = new THREE.DirectionalLight('#ffd9a6', 2.6);
  light.castShadow = CONFIG.render.shadows;
  light.shadow.mapSize.set(CONFIG.render.shadowMapSize, CONFIG.render.shadowMapSize);
  Object.assign(light.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
  light.shadow.bias = -0.0006; light.shadow.normalBias = 0.6;
  scene.add(light); scene.add(light.target);

  // desert floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshStandardMaterial({ color: '#c98a52', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -14; floor.receiveShadow = true;
  scene.add(floor);

  // distant mesas / buttes
  let seed = 21; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mesaMat = new THREE.MeshStandardMaterial({ color: '#b0643a', flatShading: true, roughness: 1 });
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, r = 750 + rnd() * 900;
    const w = 60 + rnd() * 160, h = 40 + rnd() * 140;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(w * (0.6 + rnd() * 0.3), w, h, 6 + Math.floor(rnd() * 3)), mesaMat);
    m.position.set(Math.cos(a) * r - 50, -14 + h / 2, Math.sin(a) * r);
    m.rotation.y = rnd() * 6;
    scene.add(m);
  }

  // keep the shadow frustum on the camera's target pod
  return {
    light,
    follow(x, y, z) {
      light.position.set(x + SUN_DIR.x * 200, y + SUN_DIR.y * 200, z + SUN_DIR.z * 200);
      light.target.position.set(x, y, z);
    },
  };
}
