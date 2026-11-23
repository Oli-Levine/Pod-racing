import { CONFIG } from '../../config.js';

// One analog throttle for one half of the screen.
// Thrust = vertical thumb travel from where the thumb FIRST touched.
//   up    fullThrustPx -> +100%,  overdrivePx -> OVERDRIVE band (boost, needs both pads)
//   down  reversePx    -> -reverseMax (-40%)
// The zero point is clamped so full travel is always reachable, even if you touch
// near the top or bottom edge (thrust then starts non-zero - see README).
export class ThrottlePad {
  constructor(el, side) {
    this.el = el; this.side = side;
    this.id = null; this.anchor = 0; this.y = 0; this.value = 0; this.od = false;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, (e) => this.up(e));
  }

  get active() { return this.id !== null; }

  down(e) {
    if (this.id !== null) return;
    e.preventDefault();
    const c = CONFIG.controller, r = this.el.getBoundingClientRect();
    this.id = e.pointerId;
    try { this.el.setPointerCapture(e.pointerId); } catch {}
    const y = e.clientY - r.top;
    this.rectH = r.height;
    this.anchor = Math.min(Math.max(y, c.overdrivePx + 8), Math.max(r.height - c.reversePx - 4, c.overdrivePx + 8));
    this.y = y;
    this.update();
  }

  move(e) {
    if (e.pointerId !== this.id) return;
    e.preventDefault();
    this.y = e.clientY - this.el.getBoundingClientRect().top;
    this.update();
  }

  up(e) {
    if (e.pointerId !== this.id) return;
    this.id = null; this.value = 0; this.od = false;
  }

  update() {
    const c = CONFIG.controller;
    const d = this.anchor - this.y; // + = up
    if (d >= 0) {
      const f = Math.min(d / c.fullThrustPx, 1);
      this.value = Math.pow(f, c.throttleCurve);
      this.od = d >= c.overdrivePx;
    } else {
      const f = Math.min(-d / c.reversePx, 1);
      this.value = -Math.pow(f, c.throttleCurve) * c.reverseMax;
      this.od = false;
    }
  }
}
