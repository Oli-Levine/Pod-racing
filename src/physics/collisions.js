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
