import { CONFIG } from '../../config.js';

// ============================================================================
//  Gamepad (Xbox or any controller the browser reports with the "standard"
//  layout). Polled once per frame. Two ways to drive, use either:
//    Sticks (tank):  left stick up/down = left engine, right stick = right engine
//    Triggers:       LT / RT = left / right engine forward, LB / RB = reverse
//  Buttons:  A vent (step 2)   X overdrive/boost (step 2)   L3/R3 overdrive per side
//            Y assist on/off   View reset to checkpoint     Menu start / reset to grid
//  Browsers only reveal a controller after you press a button on it once.
// ============================================================================

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11 };
const NAMES = Object.fromEntries(Object.entries(B).map(([k, v]) => [v, k]));

export class GamepadInput {
  constructor() {
    this.l = 0; this.r = 0; this.od = 0; this.vent = false; this.ventCount = 0;
    this.assist = false; this.lastUse = -1e9; this.connected = false; this.id = '';
    this.prev = [];
    this.listeners = new Set();
    addEventListener('gamepadconnected', (e) => { this.id = e.gamepad.id; });
  }

  onButton(f) { this.listeners.add(f); return () => this.listeners.delete(f); }

  // true while the pad has been used recently (it then overrides the phone)
  get active() { return this.connected && performance.now() - this.lastUse < 1500; }

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  poll() {
    const p = this.pad();
    this.connected = !!p;
    if (!p) { this.l = this.r = 0; this.od = 0; this.vent = false; return; }
    this.id = p.id;
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
    const trig = (fwd, back) => {
      const f = shape(btn(fwd).value, G.triggerDeadzone);
      return btn(back).pressed ? -rev : f;
    };
    // per engine: whichever control is pushed harder
    const pick = (a, b) => (Math.abs(a) >= Math.abs(b) ? a : b);
    this.l = pick(stick(1), trig(B.LT, B.LB));
    this.r = pick(stick(3), trig(B.RT, B.RB));
    this.od = (btn(B.X).pressed ? 3 : 0) | (btn(B.L3).pressed ? 1 : 0) | (btn(B.R3).pressed ? 2 : 0);
    this.vent = btn(B.A).pressed;

    let used = Math.abs(this.l) > 0.02 || Math.abs(this.r) > 0.02;
    p.buttons.forEach((b, i) => {
      if (b.pressed && !this.prev[i]) {
        used = true;
        if (i === B.A) this.ventCount++;
        if (i === B.Y) this.assist = !this.assist;
        for (const f of this.listeners) f(NAMES[i] || `B${i}`);
      }
      this.prev[i] = b.pressed;
    });
    if (used) this.lastUse = performance.now();
  }

  input() {
    return { l: this.l, r: this.r, od: this.od, vent: this.vent, ventCount: this.ventCount, assist: this.assist, gamepad: true };
  }

  rumble(strength = 0.6, ms = 180) {
    if (!CONFIG.gamepad.rumble) return;
    const p = this.pad();
    const act = p && p.vibrationActuator;
    if (act && act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch(() => {});
  }
}

export const gamepad = new GamepadInput();
