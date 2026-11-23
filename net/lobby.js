import { randomUUID } from 'node:crypto';
import { playerColor } from '../config.js';
import { PHASE } from './protocol.js';

// Slot / lobby bookkeeping. No sockets logic here beyond holding a reference.
export class Lobby {
  constructor(max, freeAfterMs) {
    this.max = max;
    this.freeAfterMs = freeAfterMs;
    this.phase = PHASE.LOBBY;
    this.slots = Array.from({ length: max }, (_, i) => this._empty(i));
  }

  _empty(i) {
    return {
      slot: i, pid: null, ws: null, connected: false, ready: false, ping: 0,
      assist: false, seq: -1, input: null, inputDirty: false, goneAt: 0,
      local: null, localWs: null, // local player on the TV (e.g. 'pad0'): no phone, input read by the TV
    };
  }

  bySlotPid(pid) { return pid ? this.slots.find((s) => s.pid === pid) : undefined; }

  // Join or rejoin. Returns {slot, pid, rejoined, old} or {error}.
  join(pid, ws, assist) {
    let s = this.bySlotPid(pid);
    let rejoined = !!s;
    if (!s) {
      if (this.phase !== PHASE.LOBBY) return { error: 'race' };
      s = this.slots.find((x) => !x.pid);
      if (!s) return { error: 'full' };
      s.pid = randomUUID();
      s.ready = false;
    }
    const old = s.ws && s.ws !== ws ? s.ws : null;
    s.ws = ws; s.connected = true; s.goneAt = 0; s.seq = -1; s.input = null;
    s.assist = !!assist;
    return { slot: s.slot, pid: s.pid, rejoined, old };
  }

  // A controller plugged into the TV joins as its own player (always connected + ready).
  joinLocal(key, tvWs) {
    const existing = this.slots.find((x) => x.local === key);
    if (existing) return { slot: existing.slot };
    if (this.phase !== PHASE.LOBBY) return { error: 'race' };
    const s = this.slots.find((x) => !x.pid);
    if (!s) return { error: 'full' };
    Object.assign(s, { pid: 'local:' + key, local: key, localWs: tvWs, connected: true, ready: true });
    return { slot: s.slot };
  }

  leaveLocal(key) {
    const s = this.slots.find((x) => x.local === key);
    if (s && this.phase === PHASE.LOBBY) { this.leave(s.slot); return true; }
    return false;
  }

  // TV page closed: drop its local players.
  dropLocals(tvWs) {
    let changed = false;
    for (const s of this.slots) if (s.local && s.localWs === tvWs) { this.leave(s.slot); changed = true; }
    return changed;
  }

  disconnect(slot) {
    const s = this.slots[slot];
    s.ws = null; s.connected = false; s.goneAt = Date.now();
    if (this.phase === PHASE.LOBBY) s.ready = false;
  }

  leave(slot) { this.slots[slot] = this._empty(slot); }

  // Lobby only: free slots whose phone has been gone too long. Returns true if any freed.
  sweep(now) {
    if (this.phase !== PHASE.LOBBY) return false;
    let changed = false;
    for (const s of this.slots) {
      if (s.pid && !s.local && !s.connected && now - s.goneAt > this.freeAfterMs) { this.leave(s.slot); changed = true; }
    }
    return changed;
  }

  // Host = lowest occupied slot with a connected phone (local players have no phone).
  hostSlot() {
    const s = this.slots.find((x) => x.pid && x.connected && !x.local);
    return s ? s.slot : -1;
  }

  setPhase(phase) {
    this.phase = phase;
    if (phase === PHASE.LOBBY) for (const s of this.slots) s.ready = !!s.local;
  }

  snapshot() {
    return {
      t: 'lobby', phase: this.phase, max: this.max, host: this.hostSlot(),
      players: this.slots.map((s) => ({
        slot: s.slot, occupied: !!s.pid, connected: s.connected, ready: s.ready,
        ping: Math.round(s.ping), assist: s.assist, color: playerColor(s.slot), local: s.local,
      })),
    };
  }
}
