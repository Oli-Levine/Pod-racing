import { CONFIG } from '../../config.js';

// Two vertical throttle bars (left / right engine) + vent lamp + boost flag.
const MIN = -CONFIG.controller.reverseMax, MAX = 1;
const zeroPct = (-MIN / (MAX - MIN)) * 100;

export function createThrottleBars() {
  const el = document.createElement('div');
  el.className = 'tbars';
  el.innerHTML = `
    <div class="tb"><div class="rail"><div class="od"></div><div class="zero" style="bottom:${zeroPct}%"></div><div class="fill" data-k="l"></div></div><label>L</label><span class="pct" data-k="lp">0</span></div>
    <div class="tb"><div class="rail"><div class="od"></div><div class="zero" style="bottom:${zeroPct}%"></div><div class="fill" data-k="r"></div></div><label>R</label><span class="pct" data-k="rp">0</span></div>
    <div class="flags"><span class="flag boost">BOOST</span><span class="flag vent">VENT</span><span class="flag assist">ASSIST</span></div>`;
  const q = (k) => el.querySelector(`[data-k="${k}"]`);
  const fills = { l: q('l'), r: q('r') }, pcts = { l: q('lp'), r: q('rp') };
  const boost = el.querySelector('.boost'), ventLamp = el.querySelector('.vent'), assist = el.querySelector('.assist');
  let lastVentCount = 0, ventUntil = 0;

  function setFill(node, v) {
    const f = (Math.max(MIN, Math.min(MAX, v)) - MIN) / (MAX - MIN) * 100;
    if (v >= 0) { node.style.bottom = zeroPct + '%'; node.style.height = (f - zeroPct) + '%'; }
    else { node.style.bottom = f + '%'; node.style.height = (zeroPct - f) + '%'; }
    node.classList.toggle('neg', v < 0);
  }

  return {
    el,
    update(inp, connected, now) {
      setFill(fills.l, inp.l); setFill(fills.r, inp.r);
      pcts.l.textContent = Math.round(inp.l * 100); pcts.r.textContent = Math.round(inp.r * 100);
      el.classList.toggle('off', !connected);
      el.classList.toggle('odl', !!(inp.od & 1)); el.classList.toggle('odr', !!(inp.od & 2));
      boost.classList.toggle('lit', inp.od === 3);
      if (inp.ventCount !== lastVentCount) { lastVentCount = inp.ventCount; ventUntil = now + 250; }
      ventLamp.classList.toggle('lit', inp.vent || now < ventUntil);
      assist.classList.toggle('lit', inp.assist);
    },
  };
}
