import { CONFIG } from '../../config.js';

// Keyboard test pod. Tank controls, like the phone halves:
//   W / S        left engine forward / reverse
//   Up / Down    right engine forward / reverse
//   Shift        boost
//   B            toggle beginner assist
// Keys ramp the throttle (0 -> 100% in rampTime) so you get some in-between values.
const RAMP = 5; // per second

export class KeyboardPod {
  constructor() {
    this.down = new Set();
    this.l = 0; this.r = 0; this.assist = false; this.lastUse = -1e9;
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      if (['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'].includes(e.code)) this.lastUse = performance.now();
      if (e.code === 'KeyB') this.assist = !this.assist;
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }

  // true while the driving keys are in use (keyboard then overrides the phone)
  get active() { return performance.now() - this.lastUse < 1500; }

  update(dt) {
    const k = this.down, rev = -CONFIG.controller.reverseMax;
    const tl = k.has('KeyW') ? 1 : k.has('KeyS') ? rev : 0;
    const tr = k.has('ArrowUp') ? 1 : k.has('ArrowDown') ? rev : 0;
    const step = RAMP * dt;
    this.l += Math.max(-step, Math.min(step, tl - this.l));
    this.r += Math.max(-step, Math.min(step, tr - this.r));
    if (tl || tr) this.lastUse = performance.now();
  }

  input() {
    const od = this.down.has('ShiftLeft') || this.down.has('ShiftRight') ? 3 : 0;
    return { l: this.l, r: this.r, od, assist: this.assist, keyboard: true };
  }
}
