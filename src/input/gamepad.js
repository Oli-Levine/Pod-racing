import { CONFIG } from '../../config.js';

// ============================================================================
//  Gamepads (Xbox or any controller the browser reports with the "standard"
//  layout). Each connected controller can join the lobby as its own player.
//  Polled once per frame. Two ways to drive, use either:
//    Sticks (tank):  left stick up/down = left engine, right stick = right engine
//    Triggers:       LT / RT = left / right engine forward, LB / RB = reverse
//  Buttons:  A join (lobby)   B leave (lobby) / back to lobby (results)   X boost   L3/R3 overdrive per side
//            Y assist on/off   View reset to checkpoint   Menu start / race again
//  Browsers only reveal a controller after you press a button on it once.
// ============================================================================

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11 };
const NAMES = Object.fromEntries(Object.entries(B).map(([k, v]) => [v, k]));

class PadState {
  constructor(index) {
    this.index = index; this.key = 'pad' + index; this.id = '';
    this.l = 0; this.r = 0; this.od = 0;
    this.assist = false; this.lastUse = -1e9; this.connected = false; this.prev = [];
  }

  get active() { return this.connected && performance.now() - this.lastUse < 1500; }

  input() {
    return { l: this.l, r: this.r, od: this.od, assist: this.assist, gamepad: true };
  }
}

class Gamepads {
  constructor() {
    this.pads = new Map(); // index -> PadState
    this.listeners = new Set();
  }

  onButton(f) { this.listeners.add(f); return () => this.listeners.delete(f); }

  get(index) {
    if (!this.pads.has(index)) this.pads.set(index, new PadState(index));
    return this.pads.get(index);
  }

  byKey(key) { return this.get(Number(String(key).replace('pad', ''))); }

  connectedPads() { return [...this.pads.values()].filter((p) => p.connected); }

  get anyConnected() { return this.connectedPads().length > 0; }

  // the most recently used connected pad (solo mode / unjoined override)
  mostRecent() {
    let best = null;
    for (const p of this.pads.values()) if (p.connected && (!best || p.lastUse > best.lastUse)) best = p;
    return best;
  }

  poll() {
    const raw = navigator.getGamepads ? navigator.getGamepads() : [];
    const seen = new Set();
    for (const gp of raw) {
      if (!gp || !gp.connected) continue;
      seen.add(gp.index);
      this.read(this.get(gp.index), gp);
    }
    for (const p of this.pads.values()) if (!seen.has(p.index)) { p.connected = false; p.l = p.r = 0; p.od = 0; }
  }

  read(st, p) {
    st.connected = true; st.id = p.id;
    const G = CONFIG.gamepad, rev = CONFIG.controller.reverseMax;
    const btn = (i) => p.buttons[i] || { pressed: false, value: 0 };
    const shape = (v, dz) => {
      const a = Math.abs(v);
      if (a < dz) return 0;
      return Math.sign(v) * Math.pow((a - dz) / (1 - dz), G.curve);
    };
    const stick = (axis) => {
      const v = shape(-(p.axes[axis] || 0), G.deadzone); // up = positive
      return v >= 0 ? v : v * rev;
    };
    const trig = (fwd, back) => (btn(back).pressed ? -rev : shape(btn(fwd).value, G.triggerDeadzone));
    const pick = (a, b) => (Math.abs(a) >= Math.abs(b) ? a : b); // whichever control is pushed harder
    st.l = pick(stick(1), trig(B.LT, B.LB));
    st.r = pick(stick(3), trig(B.RT, B.RB));
    st.od = (btn(B.X).pressed ? 3 : 0) | (btn(B.L3).pressed ? 1 : 0) | (btn(B.R3).pressed ? 2 : 0);

    let used = Math.abs(st.l) > 0.02 || Math.abs(st.r) > 0.02;
    p.buttons.forEach((b, i) => {
      if (b.pressed && !st.prev[i]) {
        used = true;
        if (i === B.Y) st.assist = !st.assist;
        for (const f of this.listeners) f(NAMES[i] || `B${i}`, st);
      }
      st.prev[i] = b.pressed;
    });
    if (used) st.lastUse = performance.now();
  }

  rumble(st, strength = 0.6, ms = 180) {
    if (!CONFIG.gamepad.rumble || !st) return;
    const raw = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = raw[st.index];
    const act = p && p.vibrationActuator;
    if (act && act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch(() => {});
  }
}

export const gamepads = new Gamepads();
