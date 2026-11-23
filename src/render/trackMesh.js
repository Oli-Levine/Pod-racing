import * as THREE from 'three';
import { CONFIG } from '../../config.js';

// ============================================================================
//  Track visuals built from the same ground function the physics uses, so the
//  surface you see is exactly the one the pod hovers over.
// ============================================================================

function noiseTexture(size = 256, seed = 3) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < size * size; i++) {
    const v = 200 + rnd() * 55;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // pebbles / cracks for speed sensation
  for (let i = 0; i < 900; i++) {
    const x = rnd() * size, y = rnd() * size, r = 0.6 + rnd() * 2.2;
    g.fillStyle = `rgba(${rnd() < 0.5 ? '60,40,30' : '255,240,220'},${0.25 + rnd() * 0.35})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(70,45,30,0.25)'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    g.beginPath(); let x = rnd() * size, y = rnd() * size; g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.5) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const surfColor = {};
function colorFor(name) {
  if (!surfColor[name]) surfColor[name] = new THREE.Color((CONFIG.surfaces[name] || CONFIG.surfaces.rock).color);
  return surfColor[name];
}

// Road ribbon for one path. Heights/surfaces from the global ground query.
function buildRibbon(track, path, { runoff, step = 1 }) {
  const g = {};
  const across = [];
  // cross-section in fractions of half width (track) + run-off metres
  for (const f of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) across.push({ f, r: 0 });
  if (runoff) {
    across.unshift({ f: -1, r: -runoff * 0.5 }, { f: -1, r: -runoff });
    across.push({ f: 1, r: runoff * 0.5 }, { f: 1, r: runoff });
    across.sort((a, b) => (a.f * 100 + a.r) - (b.f * 100 + b.r));
  }
  const rows = Math.floor(path.length / step) + (path.closed ? 1 : 1);
  const cols = across.length;
  const pos = new Float32Array(rows * cols * 3), col = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2);
  const c = {}, tmp = new THREE.Color();
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < rows; i++) {
    const s = Math.min(i * step, path.closed ? path.length : path.length - 0.01);
    path.at(s, c);
    const hw = c.w / 2;
    for (let j = 0; j < cols; j++) {
      const d = across[j].f * hw + across[j].r;
      const x = c.x + -c.tz * d, z = c.z + c.tx * d;
      track.ground(x, z, g);
      const k = (i * cols + j) * 3;
      pos[k] = x; pos[k + 1] = g.h; pos[k + 2] = z;
      tmp.copy(colorFor(g.surface));
      const edge = Math.abs(Math.abs(d) - hw) < 0.3 && across[j].r === 0;
      const shade = 0.88 + rnd() * 0.18 - (edge ? 0.25 : 0) - (Math.abs(d) > hw ? 0.08 : 0);
      tmp.multiplyScalar(shade);
      col[k] = tmp.r; col[k + 1] = tmp.g; col[k + 2] = tmp.b;
      uv[(i * cols + j) * 2] = d / 7; uv[(i * cols + j) * 2 + 1] = s / 7;
    }
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + 1, cc = a + cols, d = cc + 1;
    idx.push(a, cc, b, b, cc, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Canyon walls: a rocky ridge along each side, beyond the run-off. Suppressed
// where another path's driving area is (junctions).
function buildWalls(track, path) {
  const g = {}, c = {};
  const step = 3, rows = Math.floor(path.length / step) + 1;
  const pos = [], idx = [];
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const floorY = -14;
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i < rows; i++) {
      const s = Math.min(i * step, path.length - 0.01);
      path.at(s, c);
      const d0 = side * (c.w / 2 + track.runoff);
      const x0 = c.x + -c.tz * d0, z0 = c.z + c.tx * d0;
      track.ground(x0, z0, g);
      const blocked = g.path !== path.id || g.edge < track.runoff - 0.6;
      const h0 = g.h;
      const k = blocked ? 0.02 : 1;
      const hgt = (8 + rnd() * 10 + Math.sin(s * 0.05) * 4) * k;
      const prof = [[0, -0.5], [0.7, hgt * 0.5], [2.5 + rnd() * 2, hgt], [8 + rnd() * 3, hgt * (0.7 + rnd() * 0.3)], [15, null]];
      for (const [off, dy] of prof) {
        const dd = d0 + side * off * (blocked ? 0.1 : 1);
        const x = c.x + -c.tz * dd, z = c.z + c.tx * dd;
        pos.push(x + (rnd() - 0.5) * 0.8, dy === null ? floorY : h0 + dy, z + (rnd() - 0.5) * 0.8);
      }
    }
    const cols = 5;
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
      const a = base + i * cols + j, b = a + 1, cc = a + cols, d = cc + 1;
      if (side < 0) idx.push(a, b, cc, b, d, cc); else idx.push(a, cc, b, b, cc, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function buildTunnel(track) {
  const t = track.tunnel; if (!t) return null;
  const path = track.main, c = {}, group = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: '#9a5230', flatShading: true, roughness: 1, side: THREE.DoubleSide });
  const pos = [], idx = [];
  const step = 2, n = Math.ceil((t.to - t.from) / step) + 1;
  for (let i = 0; i < n; i++) {
    const s = t.from + Math.min(i * step, t.to - t.from);
    path.at(s, c);
    const half = c.w / 2 + track.runoff + 2;
    for (const [d, dy] of [[-half, 0], [-half * 0.5, 1.2], [0, 1.6], [half * 0.5, 1.2], [half, 0]]) {
      const x = c.x + -c.tz * d, z = c.z + c.tx * d;
      pos.push(x, c.y + t.ceiling + dy, z);
    }
    for (const [d, dy] of [[-half, 4], [0, 6.5], [half, 4]]) {
      const x = c.x + -c.tz * d, z = c.z + c.tx * d;
      pos.push(x, c.y + t.ceiling + dy, z);
    }
  }
  const cols = 8;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < 4; j++) { const a = i * cols + j, b = a + 1, cc = a + cols, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
    for (const [p, q] of [[0, 5], [5, 6], [6, 7], [7, 4]]) { const a = i * cols + p, b = i * cols + q; idx.push(a, b, a + cols, b, b + cols, a + cols); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function buildStartLine(track) {
  const group = new THREE.Group();
  const c = track.main.at(track.startS, {});
  const yaw = Math.atan2(c.tx, c.tz);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(c.w, 2.2), new THREE.MeshBasicMaterial({ color: '#f4efe6', polygonOffset: true, polygonOffsetFactor: -2 }));
  line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, yaw, 0);
  line.position.set(c.x, track.main.heightAt(track.startS, 0, c) + 0.03, c.z);
  group.add(line);
  const slotMat = new THREE.MeshBasicMaterial({ color: '#f4efe6', transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 });
  for (let i = 0; i < CONFIG.maxPlayers; i++) {
    const p = track.gridSlot(i);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.4), slotMat);
    m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, p.yaw, 0);
    m.position.set(p.x + Math.sin(p.yaw) * 4.5, p.y + 0.03, p.z + Math.cos(p.yaw) * 4.5);
    group.add(m);
  }
  return group;
}

export function buildTrackMeshes(track) {
  const group = new THREE.Group();
  const tex = noiseTexture();
  const roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.95, metalness: 0 });
  const main = new THREE.Mesh(buildRibbon(track, track.main, { runoff: track.runoff }), roadMat);
  main.receiveShadow = true; group.add(main);
  for (const p of track.paths) {
    if (p === track.main) continue;
    const m = new THREE.Mesh(buildRibbon(track, p, { runoff: 0 }),
      new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
    m.receiveShadow = true; group.add(m);
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: '#a8572c', flatShading: true, roughness: 1 });
  for (const p of track.paths) {
    const w = new THREE.Mesh(buildWalls(track, p), rockMat);
    w.castShadow = true; w.receiveShadow = true; group.add(w);
  }
  // pillars
  const pillarMat = new THREE.MeshStandardMaterial({ color: '#b56236', flatShading: true, roughness: 1 });
  for (const p of track.pillars) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.8, p.r * 1.25, 18, 7), pillarMat);
    m.position.set(p.x, p.y + 8, p.z); m.rotation.y = p.s;
    m.castShadow = m.receiveShadow = true; group.add(m);
  }
  const tunnel = buildTunnel(track); if (tunnel) group.add(tunnel);
  group.add(buildStartLine(track));
  return group;
}
