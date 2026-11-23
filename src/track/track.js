import * as THREE from 'three';
import { surfaceAt } from './surfaces.js';
import * as DATA from './testTrack.js';

// ============================================================================
//  Track geometry + ground queries. Used by physics AND rendering, so what you
//  see is exactly what the pod hovers over.
//
//  A track is a set of PATHS (the main loop + branches). Each path is a centre
//  line sampled every metre with width, bank and elevation. A ground query
//  finds the nearest path sample, projects onto the centre line and evaluates
//  a height function h(s, d) (s = distance along path, d = lateral offset).
// ============================================================================

const SAMPLE_STEP = 1;      // m between centre-line samples
const CELL = 16;            // m, spatial hash cell size

class Path {
  // pts: THREE.Vector3[] control points (x, y=elevation, z); widths/banks per point
  constructor(id, pts, widths, banks, closed, { patches = [], extra = null } = {}) {
    this.id = id; this.closed = closed; this.patches = patches; this.extra = extra;
    const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
    const nSeg = closed ? pts.length : pts.length - 1;

    // Dense sample by curve parameter, then resample at uniform arc length.
    const M = nSeg * 400;
    const dense = [], cum = [0];
    for (let i = 0; i <= M; i++) dense.push(curve.getPoint(i / M));
    for (let i = 1; i <= M; i++) {
      const a = dense[i - 1], b = dense[i];
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.length = cum[M];
    const n = Math.floor(this.length / SAMPLE_STEP) + (closed ? 0 : 1);
    this.n = n;
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n);
    this.tx = new Float32Array(n); this.tz = new Float32Array(n);
    this.w = new Float32Array(n); this.bankSlope = new Float32Array(n);
    this.cpS = []; // s of each control point
    const lerpScalar = (arr, u) => { // u = control-point parameter (fractional index)
      const i = Math.floor(u), f = u - i, a = arr[i % arr.length], b = arr[(i + 1) % arr.length];
      const sm = f * f * (3 - 2 * f);
      return a + (b - a) * sm;
    };
    let j = 0;
    const tAtS = (s) => {
      while (j < M && cum[j + 1] < s) j++;
      const f = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
      return (j + f) / M;
    };
    for (let i = 0; i < n; i++) {
      const s = i * SAMPLE_STEP, t = tAtS(s);
      const p = curve.getPoint(t);
      this.x[i] = p.x; this.y[i] = p.y; this.z[i] = p.z;
      const u = t * nSeg;
      this.w[i] = lerpScalar(widths, u);
      this.bankSlope[i] = Math.tan(lerpScalar(banks, u) * Math.PI / 180);
    }
    for (let k = 0; k <= nSeg; k++) {
      // s of control point k: find via cum at t = k / nSeg
      const idx = Math.min(M, Math.round((k / nSeg) * M));
      this.cpS.push(cum[idx]);
    }
    // tangents
    for (let i = 0; i < n; i++) {
      const a = this.idx(i - 1), b = this.idx(i + 1);
      const dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a], l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l; this.tz[i] = dz / l;
    }
    // bank direction: tilt into the turn (inside lower). + turn = turning right.
    for (let i = 0; i < n; i++) {
      const a = this.idx(i - 12), b = this.idx(i + 12);
      // right vector of a = (-tz, tx); turning right if tangent b leans to a's right
      const turn = (this.tx[b] * -this.tz[a] + this.tz[b] * this.tx[a]);
      const sign = Math.abs(turn) < 0.02 ? 0 : Math.sign(turn);
      this.bankSlope[i] = -this.bankSlope[i] * sign;
    }
    this.buildGrid();
  }

  idx(i) { return this.closed ? ((i % this.n) + this.n) % this.n : Math.max(0, Math.min(this.n - 1, i)); }
  wrapS(s) { return this.closed ? ((s % this.length) + this.length) % this.length : Math.max(0, Math.min(this.length, s)); }
  sAtCP(cp) {
    const i = Math.floor(cp), f = cp - i;
    const a = this.cpS[i], b = this.cpS[Math.min(i + 1, this.cpS.length - 1)];
    return a + (b - a) * f;
  }

  buildGrid() {
    this.grid = new Map();
    const reach = 60; // m around the centre line where this path answers queries
    for (let i = 0; i < this.n; i++) {
      const r = this.w[i] / 2 + reach;
      const x0 = Math.floor((this.x[i] - r) / CELL), x1 = Math.floor((this.x[i] + r) / CELL);
      const z0 = Math.floor((this.z[i] - r) / CELL), z1 = Math.floor((this.z[i] + r) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const k = cx * 100003 + cz;
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        if (list[list.length - 1] !== i) list.push(i);
      }
    }
  }

  // Interpolated centre-line attributes at distance s.
  at(s, out) {
    s = this.wrapS(s);
    const f = s / SAMPLE_STEP, i = Math.floor(f), t = f - i;
    const a = this.idx(i), b = this.idx(i + 1);
    out.x = this.x[a] + (this.x[b] - this.x[a]) * t;
    out.y = this.y[a] + (this.y[b] - this.y[a]) * t;
    out.z = this.z[a] + (this.z[b] - this.z[a]) * t;
    let tx = this.tx[a] + (this.tx[b] - this.tx[a]) * t, tz = this.tz[a] + (this.tz[b] - this.tz[a]) * t;
    const l = Math.hypot(tx, tz) || 1; out.tx = tx / l; out.tz = tz / l;
    out.w = this.w[a] + (this.w[b] - this.w[a]) * t;
    out.bank = this.bankSlope[a] + (this.bankSlope[b] - this.bankSlope[a]) * t;
    out.s = s;
    return out;
  }

  // Height of the ground at (s, d) on this path.
  heightAt(s, d, c = this.at(s, {})) {
    const hw = c.w / 2;
    const dc = Math.max(-hw, Math.min(hw, d));
    let h = c.y + dc * c.bank + Math.max(0, Math.abs(d) - hw) * 0.06; // run-off rises gently
    if (this.extra) h += this.extra(c.s, d);
    return h;
  }

  // Nearest point on the centre line: returns { s, d } or null if far away.
  project(x, z, out) {
    const list = this.grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    if (!list) return null;
    let best = -1, bd = Infinity;
    for (const i of list) {
      const dx = x - this.x[i], dz = z - this.z[i], dd = dx * dx + dz * dz;
      if (dd < bd) { bd = dd; best = i; }
    }
    // refine on the neighbouring segments
    let bestS = best * SAMPLE_STEP, bestDist = Infinity, bestD = 0, over = 0;
    for (const [a, b] of [[this.idx(best - 1), best], [best, this.idx(best + 1)]]) {
      if (a === b) continue;
      const ax = this.x[a], az = this.z[a], ex = this.x[b] - ax, ez = this.z[b] - az;
      const len2 = ex * ex + ez * ez || 1;
      const tRaw = ((x - ax) * ex + (z - az) * ez) / len2;
      const t = Math.max(0, Math.min(1, tRaw));
      const px = ax + ex * t, pz = az + ez * t, dist = Math.hypot(x - px, z - pz);
      if (dist < bestDist) {
        bestDist = dist;
        bestS = (a + t) * SAMPLE_STEP;
        // open paths end: distance beyond the last sample counts as "off the edge"
        over = !this.closed && ((a === 0 && tRaw < 0) || (b === this.n - 1 && tRaw > 1))
          ? Math.abs(tRaw < 0 ? tRaw : tRaw - 1) * Math.sqrt(len2) : 0;
        bestD = ((x - px) * -ez + (z - pz) * ex) / Math.sqrt(len2); // + = right of travel
      }
    }
    out.s = this.wrapS(bestS); out.d = bestD; out.over = over;
    return out;
  }
}

// ---------------------------------------------------------------------------
export class Track {
  constructor(data = DATA) {
    this.data = data;
    const cps = data.CONTROL_POINTS;
    const main = new Path('main',
      cps.map(([x, z, y]) => new THREE.Vector3(x, y, z)),
      cps.map((p) => p[3]), cps.map((p) => p[4]), true);
    this.main = main;
    const cpS = (cp) => main.sAtCP(cp);
    const F = data.FEATURES;

    // Main path height features + surfaces (converted from control-point index to metres)
    const bumps = F.bumps.map((b) => ({ from: cpS(b.from), to: cpS(b.to), amp: b.amp, wl: b.wavelength }));
    const j = F.jump && {
      r0: cpS(F.jump.rampStart), g0: cpS(F.jump.gapStart), g1: cpS(F.jump.gapEnd), e1: cpS(F.jump.exitEnd),
      rise: F.jump.rise, depth: F.jump.depth,
    };
    this.jump = j;
    main.extra = (s, d) => {
      let h = 0;
      for (const b of bumps) if (s > b.from && s < b.to) h += b.amp * (1 - Math.cos((2 * Math.PI * (s - b.from)) / b.wl)) * 0.5;
      if (j) {
        if (s > j.r0 && s <= j.g0) h += j.rise * Math.pow((s - j.r0) / (j.g0 - j.r0), 1.6);
        else if (s > j.g0 && s <= j.g1) h -= j.depth;
        else if (s > j.g1 && s < j.e1) h -= j.depth * (1 - (s - j.g1) / (j.e1 - j.g1));
      }
      return h;
    };
    main.patches = data.SURFACE_PATCHES.map((p) => ({ ...p, from: cpS(p.from), to: cpS(p.to) }));
    this.tunnel = F.tunnel && { from: cpS(F.tunnel.from), to: cpS(F.tunnel.to), ceiling: F.tunnel.ceiling };

    // Shortcut branch
    this.paths = [main];
    const sc = data.SHORTCUT;
    if (sc) {
      const a = cps[sc.from], b = cps[sc.to];
      const pts = [[a[0], a[1]], ...sc.points, [b[0], b[1]]].map(([x, z], i, arr) => {
        const y = a[2] + (b[2] - a[2]) * (i / (arr.length - 1));
        return new THREE.Vector3(x, y, z);
      });
      const br = new Path('shortcut', pts, pts.map(() => sc.width), pts.map(() => 0), false);
      const L = br.length;
      br.extra = (s) => (sc.bumps && s > sc.bumps.from * L && s < sc.bumps.to * L
        ? sc.bumps.amp * (1 - Math.cos((2 * Math.PI * (s - sc.bumps.from * L)) / sc.bumps.wavelength)) * 0.5 : 0);
      br.patches = sc.sand ? [{ from: sc.sand.from * L, to: sc.sand.to * L, dMin: -50, dMax: 50, surface: 'sand' }] : [];
      br.mainFrom = cpS(sc.from); br.mainTo = cpS(sc.to);
      this.paths.push(br);
      this.shortcut = br;
    }

    this.runoff = data.RUNOFF;
    this.length = main.length;
    this.startS = cpS(data.START_LINE);
    this.pillars = data.PILLARS.map(([cp, d, r]) => {
      const c = main.at(cpS(cp), {});
      return { x: c.x + -c.tz * d, z: c.z + c.tx * d, y: main.heightAt(c.s, d, c), r, s: c.s, d };
    });
    this.checkpoints = data.CHECKPOINTS.map((cp, i) => this.makeGate(cpS(cp), i));
    this.sectorEnds = data.SECTOR_ENDS;
    this.testSpots = (data.TEST_SPOTS || []).map(([key, name, cp]) => ({ key, name, s: cpS(cp) }));
    this._c = {}; this._p = {};
  }

  makeGate(s, index) {
    const c = this.main.at(s, {});
    return { index, s, x: c.x, y: this.main.heightAt(s, 0, c), z: c.z, tx: c.tx, tz: c.tz, half: c.w / 2 + this.runoff };
  }

  // Ground under (x, z). y (optional) breaks ties toward the surface below.
  // Fills `out` with: h, surface, path, s, d, edge (m beyond the track edge, <=0 on track),
  // onTrack, ceiling (Infinity if open sky), progress (distance along the main loop).
  ground(x, z, out = {}) {
    let best = null, bestEdge = Infinity, bestPath = null;
    const p = this._p;
    for (const path of this.paths) {
      if (!path.project(x, z, p)) continue;
      const c = path.at(p.s, this._c);
      const edge = p.over > 0 ? Math.max(Math.abs(p.d) - c.w / 2, p.over) + 5 : Math.abs(p.d) - c.w / 2;
      // prefer being on a surface; among those, the most central
      const score = edge <= 0 ? edge - 1000 : edge;
      if (score < bestEdge) {
        bestEdge = score; bestPath = path;
        best = best || {}; best.s = p.s; best.d = p.d; best.edge = edge; best.w = c.w;
      }
    }
    if (!best) {
      out.h = -8; out.surface = 'sand'; out.path = null; out.s = 0; out.d = 0; out.edge = 999;
      out.onTrack = false; out.ceiling = Infinity; out.progress = 0; out.outside = true;
      return out;
    }
    const c = bestPath.at(best.s, this._c);
    out.h = bestPath.heightAt(best.s, best.d, c);
    out.surface = surfaceAt(bestPath.patches, best.s, best.d, c.w / 2);
    out.path = bestPath.id; out.s = best.s; out.d = best.d; out.edge = best.edge;
    out.onTrack = best.edge <= 0; out.outside = best.edge > this.runoff + 25;
    out.ceiling = Infinity;
    if (bestPath === this.main && this.tunnel && best.s > this.tunnel.from && best.s < this.tunnel.to && best.edge < this.runoff) {
      out.ceiling = c.y + this.tunnel.ceiling;
    }
    out.progress = bestPath === this.main ? best.s
      : bestPath.mainFrom + (best.s / bestPath.length) * (bestPath.mainTo - bestPath.mainFrom);
    return out;
  }

  // Ground height + gradient (dh/dx, dh/dz) by central differences.
  groundWithSlope(x, z, out = {}) {
    this.ground(x, z, out);
    const e = 0.5, tmp = this._g || (this._g = {});
    const hx1 = this.ground(x + e, z, tmp).h, hx0 = this.ground(x - e, z, tmp).h;
    const hz1 = this.ground(x, z + e, tmp).h, hz0 = this.ground(x, z - e, tmp).h;
    out.gx = (hx1 - hx0) / (2 * e); out.gz = (hz1 - hz0) / (2 * e);
    // clamp vertical cliff faces (gap edge) so they don't act as launch pads
    const g = Math.hypot(out.gx, out.gz);
    if (g > 1.5) { out.gx *= 1.5 / g; out.gz *= 1.5 / g; out.cliff = true; } else out.cliff = false;
    return out;
  }

  // Starting grid slot i: 4 abreast, staggered rows, behind the start line.
  gridSlot(i) {
    const row = Math.floor(i / 4), col = i % 4;
    const s = this.startS - 14 - row * 14 - (col % 2) * 4;
    const c = this.main.at(s, {});
    const d = [-9, -3, 3, 9][col];
    const x = c.x + -c.tz * d, z = c.z + c.tx * d;
    return { x, z, y: this.main.heightAt(s, d, c), yaw: Math.atan2(c.tx, c.tz) };
  }

  // Placement at a checkpoint (for resets), facing along the track.
  gatePose(gate, d = 0) { return this.poseAt(gate.s - 2, d); }

  poseAt(s, d = 0) {
    const c = this.main.at(s, {});
    return { x: c.x + -c.tz * d, z: c.z + c.tx * d, y: this.main.heightAt(c.s, d, c), yaw: Math.atan2(c.tx, c.tz) };
  }
}
