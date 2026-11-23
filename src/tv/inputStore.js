// Latest input per player. The game reads this once per physics tick.
// Disconnected / stale players read as neutral (coast).
const NEUTRAL = Object.freeze({ seq: 0, l: 0, r: 0, od: 0, vent: false, ventCount: 0, assist: false, t: 0 });

export class InputStore {
  constructor() { this.latest = new Map(); this.connected = new Set(); }

  // rows: [slot, seq, l, r, od, vent, ventCount, assist]
  ingest(rows, now = performance.now()) {
    for (const [slot, seq, l, r, od, v, c, a] of rows) {
      this.latest.set(slot, { seq, l, r, od, vent: !!v, ventCount: c | 0, assist: !!a, t: now });
    }
  }

  setConnected(slots) {
    this.connected = new Set(slots);
    for (const k of this.latest.keys()) if (!this.connected.has(k)) this.latest.delete(k);
  }

  get(slot) {
    return this.connected.has(slot) ? (this.latest.get(slot) || NEUTRAL) : NEUTRAL;
  }
}
