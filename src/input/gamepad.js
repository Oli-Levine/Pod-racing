import { CONFIG } from '../../config.js';

// ============================================================================
//  Gamepads (Xbox or any controller the browser reports with the "standard"
//  layout). Each connected controller can join the lobby as its own player.
//  Polled once per frame. Control scheme is CONFIG.gamepad.scheme:
//    'steer' (default): RT throttle, LT brake / reverse, left stick steer, LB / RB (hold) drift
//    'tank':            LT / RT = left / right engine forward, LB / RB = reverse, B (hold) drift
//  Sticks never give thrust. Steering is mixed into the two engines (differential thrust).
//  Buttons:  A or X boost (race) / A join (lobby)   B leave (lobby) / back to lobby (results)
//            Y assist on/off   View reset to checkpoint   Menu start / race again
//  Browsers only reveal a controller after you press a button on it once.
// ============================================================================

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11 };
const NAMES = Object.fromEntries(Object.entries(B).map(([k, v]) => [v, k]));

class PadState {
  constructor(index) {
    this.index = index; this.key = 'pad' + index; this.id = '';
    this.l = 0; this.r = 0; this.od = 0; this.drift = false;
    this.assist = false; this.lastUse = -1e9; this.connected = false; this.prev = [];
  }

  get active() { return this.connected && performance.now() - this.lastUse < 1500; }

  input() {
    return { l: this.l, r: this.r, od: this.od, drift: this.drift, assist: this.assist, gamepad: true };
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
    for (const p of this.pads.values()) if (!seen.has(p.index)) { p.connected = false; p.l = p.r = 0; p.od = 0; p.drift = false; }
  }

  read(st, p) {
    st.connected = true; st.id = p.id;
    const G = CONFIG.gamepad, rev = CONFIG.controller.reverseMax;
    const btn = (i) => p.buttons[i] || { pressed: false, value: 0 };
    const trigger = (i) => Math.pow(Math.max(0, (btn(i).value - G.triggerDeadzone) / (1 - G.triggerDeadzone)), G.curve);
    if (G.scheme === 'tank') {
      const eng = (fwd, back) => (btn(back).pressed ? -rev : trigger(fwd));
      st.l = eng(B.LT, B.LB);
      st.r = eng(B.RT, B.RB);
      st.drift = btn(B.B).pressed;
    } else {
      // throttle from the triggers, steering from the left stick, mixed into the two engines
      let t = trigger(B.RT) - trigger(B.LT);
      if (t < 0) t *= rev;
      const sx = p.axes[0] || 0, a = Math.abs(sx);
      const steer = a < G.deadzone ? 0 : Math.sign(sx) * Math.pow((a - G.deadzone) / (1 - G.deadzone), G.steerCurve) * G.steerStrength;
      // steer right = more LEFT engine (yaw decreases = turning right)
      let l = t + steer, r = t - steer;
      if (l > 1) { r -= l - 1; l = 1; }  // keep the full difference (turn rate) by cutting the inner engine
      if (r > 1) { l -= r - 1; r = 1; }
      st.l = Math.max(-rev, l);
      st.r = Math.max(-rev, r);
      st.drift = btn(B.LB).pressed || btn(B.RB).pressed;
    }
    const boost = btn(B.X).pressed || btn(B.A).pressed;
    st.od = (boost ? 3 : 0) | (btn(B.L3).pressed ? 1 : 0) | (btn(B.R3).pressed ? 2 : 0);

    let used = Math.abs(st.l) > 0.02 || Math.abs(st.r) > 0.02 || st.drift;
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
