import { CONFIG } from '../../config.js';

// Draws both throttle rails on one canvas over the pads.
export function drawPads(canvas, pads, S) {
  const parent = canvas.parentElement;
  const w = parent.clientWidth, h = parent.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const c = CONFIG.controller;
  const both = pads[0].od && pads[1].od;

  pads.forEach((pad, i) => {
    const cx = i === 0 ? w * 0.25 : w * 0.75;
    const anchor = pad.active ? pad.anchor : h * 0.72;
    const top = anchor - c.overdrivePx - 12, bot = anchor + c.reversePx + 8;
    const fullY = anchor - c.fullThrustPx, odY = anchor - c.overdrivePx;
    const railW = 16, x0 = cx - railW / 2;
    const alpha = pad.active ? 1 : 0.35;
    g.globalAlpha = alpha;

    // rail bands: reverse / thrust / dead-ish top / overdrive
    g.fillStyle = 'rgba(80,140,255,0.35)'; roundRect(g, x0, anchor, railW, bot - anchor, 8);
    g.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(g, x0, fullY, railW, anchor - fullY, 4);
    g.fillStyle = 'rgba(255,255,255,0.20)'; roundRect(g, x0, odY, railW, fullY - odY, 4);
    g.fillStyle = both ? 'rgba(255,120,30,0.95)' : 'rgba(255,120,30,0.45)'; roundRect(g, x0, top, railW, odY - top, 8);

    // fill from zero to thumb
    if (pad.active) {
      const ty = Math.min(Math.max(pad.y, top), bot);
      g.fillStyle = pad.od ? '#ff8a2a' : S.color;
      g.globalAlpha = 0.9;
      g.fillRect(x0 - 3, Math.min(anchor, ty), railW + 6, Math.abs(anchor - ty));
      g.globalAlpha = 1;
      // thumb
      g.beginPath(); g.arc(cx, ty, 26, 0, Math.PI * 2);
      g.fillStyle = pad.od ? '#ff8a2a' : '#fff'; g.fill();
      g.lineWidth = 4; g.strokeStyle = S.color; g.stroke();
      // value
      g.fillStyle = '#fff'; g.font = '700 22px system-ui, sans-serif'; g.textAlign = 'center';
      const dir = i === 0 ? -1 : 1;
      g.textAlign = dir < 0 ? 'right' : 'left';
      g.fillText(`${Math.round(pad.value * 100)}%`, cx + dir * 44, ty + 8);
    }
    // zero line
    g.globalAlpha = alpha;
    g.fillStyle = '#fff'; g.fillRect(x0 - 10, anchor - 1.5, railW + 20, 3);
    // labels
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = '700 14px system-ui, sans-serif'; g.textAlign = 'center';
    if (!pad.active) g.fillText(i === 0 ? 'LEFT ENGINE' : 'RIGHT ENGINE', cx, top - 16);
    g.globalAlpha = 1;
  });
  if (both) {
    g.fillStyle = '#ff8a2a'; g.font = '800 26px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText('OVERDRIVE', w / 2, 34);
  }
}

function roundRect(g, x, y, w, h, r) {
  if (h <= 0) return;
  g.beginPath(); g.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2)); g.fill();
}
