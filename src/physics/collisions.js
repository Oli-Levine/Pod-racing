import { CONFIG } from '../../config.js';

// ============================================================================
//  Walls + pillars + stuck / out-of-bounds detection.
//  Walls are where the sand run-off ends. A hit is resolved by splitting the
//  velocity into the part INTO the wall (bounces back by `bounce`, adds heat)
//  and the part ALONG it (loses `tangentLoss`). Both depend on impact angle
//  (config.wall tables), so a glancing scrape is cheap and a head-on is not.
// ============================================================================

const DEG = 180 / Math.PI;

// Piecewise-linear lookup in the config tables.
function table(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) { const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + (ys[i] - ys[i - 1]) * t; }
  }
  return ys[ys.length - 1];
}

export function collisionTable(angleDeg) {
  const W = CONFIG.wall;
  return { loss: table(W.angles, W.tangentLoss, angleDeg), bounce: table(W.angles, W.bounce, angleDeg) };
}

// Resolve one contact: normal (nx, nz) points away from the wall, into the playable area.
function contact(pod, nx, nz, pen, kind) {
  const W = CONFIG.wall;
  const push = Math.max(0, pen); // pen < 0 = within the contact skin, not yet penetrating
  pod.x += nx * push; pod.z += nz * push;
  const speed = Math.hypot(pod.vx, pod.vz);
  const vn = pod.vx * nx + pod.vz * nz; // < 0 = moving into the wall
  pod.touching = true; pod.wallNx = nx; pod.wallNz = nz;
  if (vn >= 0 || speed < 0.01) return;

  const vi = -vn;
  const angle = Math.asin(Math.min(1, vi / speed)) * DEG; // 0 = glancing, 90 = head-on
  const { loss, bounce } = collisionTable(angle);
  const tx = pod.vx - vn * nx, tz = pod.vz - vn * nz; // along-wall velocity
  pod.vx = tx * (1 - loss) + nx * vi * bounce;
  pod.vz = tz * (1 - loss) + nz * vi * bounce;

  // heat from the hit (heat >= 1 will overheat the pod on the next tick)
  pod.heat = Math.min(1, pod.heat + W.heatPerImpact * vi);

  // nose-first hits spin the nose away from the wall
  const fx = Math.sin(pod.yaw), fz = Math.cos(pod.yaw);
  const fn = fx * nx + fz * nz; // < 0 = nose pointing into the wall
  if (fn < 0) {
    const left = fz * nx - fx * nz; // (cos, -sin) . n
    pod.yawRate += Math.sign(left || 1) * W.spin * vi * -fn;
  }

  if (vi >= W.hitEventMin && pod.hitCd <= 0) {
    pod.hitCd = 0.12;
    pod.events.push({ type: 'wall', kind, speed: vi, angle, lossFrac: 1 - Math.hypot(pod.vx, pod.vz) / speed,
      x: pod.x - nx * CONFIG.wall.radius, z: pod.z - nz * CONFIG.wall.radius, nx, nz });
  }
}

// Call after integrating position. g = ground() at the new position.
export function collide(pod, g, track, dt) {
  const W = CONFIG.wall;
  pod.touching = false; pod.hitCd = Math.max(0, (pod.hitCd || 0) - dt);

  // -- canyon walls (edge of the run-off) --
  const limit = track.runoff - W.radius;
  if (g.path && g.edge > limit - 0.25) {
    const dx = g.cx - pod.x, dz = g.cz - pod.z, len = Math.hypot(dx, dz);
    if (len > 1e-3) contact(pod, dx / len, dz / len, g.edge - limit, 'wall');
  }

  // -- pillars (slalom) --
  const R = W.radius;
  for (const p of track.pillars) {
    const dx = pod.x - p.x, dz = pod.z - p.z, rr = R + p.r;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && pod.y < p.y + 18) {
      const d = Math.sqrt(d2) || 1e-3;
      contact(pod, dx / d, dz / d, rr - d, 'pillar');
    }
  }

  // -- scraping: drag, heat and sparks while touching --
  const speed = Math.hypot(pod.vx, pod.vz);
  pod.scrape = 0;
  if (pod.touching) {
    const vn = pod.vx * pod.wallNx + pod.vz * pod.wallNz;
    const along = Math.sqrt(Math.max(0, speed * speed - vn * vn));
    pod.scrape = Math.min(1, along / 25);
    if (along > 1) {
      const k = Math.exp(-W.scrapeDrag * dt);
      pod.vx *= k; pod.vz *= k;
      pod.heat = Math.min(1, pod.heat + W.scrapeHeat * along * dt);
    }
  }
}

// Stuck / out-of-bounds -> sets pod.resetReason ('out' | 'stuck' | 'fell').
export function checkReset(pod, g, track, dt) {
  const W = CONFIG.wall;
  if (pod.resetReason) return;
  if (g.path && g.edge > track.runoff + W.outMargin) { pod.resetReason = 'out'; return; }
  if (g.outside || pod.y < g.h - 30 || pod.y < -80) { pod.resetReason = 'fell'; return; }
  // Stuck = trying to move (throttle or pressed against a wall) but staying within stuckDist of the
  // same spot for stuckTime. Spinning on the spot, stalls, countdown and penalties don't count.
  const wantsMove = (Math.abs(pod.cmdL) + Math.abs(pod.cmdR)) / 2 > 0.2;
  const trying = (wantsMove || pod.touching) && Math.abs(pod.yawRate) < 0.8;
  const moved = Math.hypot(pod.x - pod.stuckX, pod.z - pod.stuckZ) > W.stuckDist;
  if (pod.locked || pod.penalty > 0 || pod.stall > 0 || !trying || moved) {
    pod.stuckT = 0; pod.stuckX = pod.x; pod.stuckZ = pod.z;
  } else {
    pod.stuckT += dt;
    if (pod.stuckT > W.stuckTime) pod.resetReason = 'stuck';
  }
}

// ============================================================================
//  Pod-to-pod collisions. Each pod is two circles (engines + cockpit). Contacts
//  are resolved with a 2D rigid-body impulse using mass and yaw inertia, so a
//  hit away from the centre spins the pod. The pod hit in the SIDE gains heat
//  (ramming someone toward overheat is a tactic); the rammer gains a little.
// ============================================================================
function circles(pod, out) {
  const B = CONFIG.bump, fx = Math.sin(pod.yaw), fz = Math.cos(pod.yaw);
  out[0] = pod.x + fx * B.frontOffset; out[1] = pod.z + fz * B.frontOffset; out[2] = B.frontRadius;
  out[3] = pod.x + fx * B.rearOffset; out[4] = pod.z + fz * B.rearOffset; out[5] = B.rearRadius;
  return out;
}

const ca = new Float64Array(6), cb = new Float64Array(6);

export function collidePods(pods) {
  for (let i = 0; i < pods.length; i++) for (let j = i + 1; j < pods.length; j++) {
    const A = pods[i], Bp = pods[j];
    if (Math.abs(A.y - Bp.y) > 3) continue; // one is flying over the other
    if (Math.hypot(A.x - Bp.x, A.z - Bp.z) > 12) continue;
    circles(A, ca); circles(Bp, cb);
    let best = null;
    for (let a = 0; a < 6; a += 3) for (let b = 0; b < 6; b += 3) {
      const dx = ca[a] - cb[b], dz = ca[a + 1] - cb[b + 1], rr = ca[a + 2] + cb[b + 2];
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-3, pen = rr - d;
      if (!best || pen > best.pen) {
        const nx = dx / d, nz = dz / d; // from B to A
        best = { nx, nz, pen, px: (ca[a] - nx * ca[a + 2] + cb[b] + nx * cb[b + 2]) / 2, pz: (ca[a + 1] - nz * ca[a + 2] + cb[b + 1] + nz * cb[b + 2]) / 2 };
      }
    }
    if (best) resolvePair(A, Bp, best);
  }
}

function resolvePair(A, Bp, c) {
  const P = CONFIG.pod, K = CONFIG.bump;
  const mA = P.mass, mB = P.mass, IA = P.yawInertia, IB = P.yawInertia;
  const { nx, nz, pen } = c;
  // separate (held pods don't move)
  const wA = A.locked || A.penalty > 0 ? 0 : 1 / mA, wB = Bp.locked || Bp.penalty > 0 ? 0 : 1 / mB;
  if (wA + wB === 0) return;
  A.x += nx * pen * wA / (wA + wB); A.z += nz * pen * wA / (wA + wB);
  Bp.x -= nx * pen * wB / (wA + wB); Bp.z -= nz * pen * wB / (wA + wB);

  // relative velocity at the contact point. Point velocity from yaw rate w: (w*rz, -w*rx)
  const rAx = c.px - A.x, rAz = c.pz - A.z, rBx = c.px - Bp.x, rBz = c.pz - Bp.z;
  const vAx = A.vx + A.yawRate * rAz, vAz = A.vz - A.yawRate * rAx;
  const vBx = Bp.vx + Bp.yawRate * rBz, vBz = Bp.vz - Bp.yawRate * rBx;
  const vn = (vAx - vBx) * nx + (vAz - vBz) * nz;
  if (vn >= 0) return; // already separating
  const kA = rAz * nx - rAx * nz, kB = rBz * nx - rBx * nz; // (r x n) about +Y
  const iA = wA ? 1 / IA : 0, iB = wB ? 1 / IB : 0;
  const j = (-(1 + K.restitution) * vn) / (wA + wB + kA * kA * iA + kB * kB * iB);
  A.vx += j * nx * wA; A.vz += j * nz * wA; A.yawRate += kA * j * iA * K.spinScale;
  Bp.vx -= j * nx * wB; Bp.vz -= j * nz * wB; Bp.yawRate -= kB * j * iB * K.spinScale;

  // who rammed whom: the pod closing faster on the other is the attacker
  const vi = -vn;
  const closeA = -(A.vx * nx + A.vz * nz), closeB = Bp.vx * nx + Bp.vz * nz; // (pre-impulse approx is fine)
  const sideness = (pod) => Math.abs(nx * -Math.cos(pod.yaw) + nz * Math.sin(pod.yaw)); // |n . right|
  const [att, vic] = closeA >= closeB ? [A, Bp] : [Bp, A];
  const heat = K.sideHeat * vi * sideness(vic);
  vic.heat = Math.min(1, vic.heat + heat);
  att.heat = Math.min(1, att.heat + heat * K.attackerHeat);
  if (vi >= K.hitEventMin) {
    vic.events.push({ type: 'bump', speed: vi, victim: true, heat, other: att.slot, x: c.px, z: c.pz });
    att.events.push({ type: 'bump', speed: vi, victim: false, heat: heat * K.attackerHeat, other: vic.slot, x: c.px, z: c.pz });
  }
}
