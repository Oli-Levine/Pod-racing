import { CONFIG } from '../../config.js';

// Surface lookup. Grip/drag values live in config.js (CONFIG.surfaces) so new
// surfaces (mud, ice...) are a config entry plus a patch in the track data.
export const DEFAULT_SURFACE = 'rock';
export const OFFTRACK_SURFACE = 'sand';

export function surface(name) {
  return CONFIG.surfaces[name] || CONFIG.surfaces[DEFAULT_SURFACE];
}

// patches: [{ from, to, dMin, dMax, surface }] in path distance s (m) and lateral d (m).
export function surfaceAt(patches, s, d, halfWidth) {
  for (const p of patches) {
    if (s >= p.from && s <= p.to && d >= p.dMin && d <= p.dMax) return p.surface;
  }
  return Math.abs(d) > halfWidth ? OFFTRACK_SURFACE : DEFAULT_SURFACE;
}
