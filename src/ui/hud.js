// Per-viewport HUD: speed, heat gauge, lap, position, lap times, sector splits,
// landing feedback. DOM overlay positioned over the viewport.
export const fmt = (t) => {
  if (t == null) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
};
const fmtDelta = (d) => (d == null ? '' : `${d < 0 ? '-' : '+'}${Math.abs(d).toFixed(3)}`);

export class Hud {
  constructor(root, color, label) {
    const el = document.createElement('div');
    el.className = 'hud';
    el.style.setProperty('--pc', color);
    el.innerHTML = `
      <div class="h-tl"><span class="h-name">${label}</span><span class="h-assist">ASSIST</span><span class="h-kb">KEYBOARD</span></div>
      <div class="h-tr">
        <div class="h-row"><span class="h-k">LAP</span><b class="h-lap">-</b><span class="h-k">POS</span><b class="h-pos">1/1</b></div>
        <div class="h-time">0:00.000</div>
        <div class="h-sub"><span class="h-k">LAST</span><span class="h-last">--:--.---</span></div>
        <div class="h-sub"><span class="h-k">BEST</span><span class="h-best">--:--.---</span></div>
        <div class="h-secs"></div>
      </div>
      <div class="h-bl">
        <div class="h-speed"><b>0</b><span>km/h</span></div>
        <div class="h-heat"><div class="h-heat-fill"></div><span>HEAT</span></div>
      </div>
      <div class="h-pop"></div>`;
    root.appendChild(el);
    this.el = el;
    const q = (c) => el.querySelector(c);
    this.n = { lap: q('.h-lap'), pos: q('.h-pos'), time: q('.h-time'), last: q('.h-last'), best: q('.h-best'),
      speed: q('.h-speed b'), assist: q('.h-assist'), kb: q('.h-kb'), pop: q('.h-pop'), secs: q('.h-secs'), heat: q('.h-heat-fill') };
    this.popUntil = 0;
  }

  setRect(r) { Object.assign(this.el.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' }); }

  popup(text, cls, now, ms = 1600) {
    this.n.pop.textContent = text; this.n.pop.className = 'h-pop show ' + (cls || '');
    this.popUntil = now + ms;
  }

  event(e, now) {
    if (e.type === 'sector') {
      const cls = e.delta == null ? '' : e.delta <= 0 ? 'good' : 'bad';
      this.popup(`S${e.sector + 1}  ${fmt(e.time)}  ${fmtDelta(e.delta)}`, cls, now);
    } else if (e.type === 'lap') {
      this.popup(`LAP ${e.lap}  ${fmt(e.time)}  ${e.best && e.delta != null ? 'BEST!' : fmtDelta(e.delta)}`, e.best ? 'good' : 'bad', now, 2500);
    } else if (e.type === 'land') {
      if (e.clean) this.popup('CLEAN LANDING', 'good', now, 900);
      else if (e.loss > 0.03) this.popup(`ROUGH LANDING  -${Math.round(e.loss * 100)}%`, 'bad', now, 1100);
    } else if (e.type === 'reset') {
      this.popup(e.text, '', now, 1000);
    }
  }

  update(pod, lap, time, pos, total, isKeyboard, now) {
    const n = this.n;
    n.speed.textContent = Math.round(pod.speed * 3.6);
    n.lap.textContent = lap.lap > 0 ? lap.lap : '-';
    n.pos.textContent = `${pos}/${total}`;
    n.time.textContent = fmt(lap.current(time));
    n.last.textContent = fmt(lap.lastLap);
    n.best.textContent = fmt(lap.bestLap);
    n.assist.style.display = pod.assist ? '' : 'none';
    n.kb.style.display = isKeyboard ? '' : 'none';
    n.heat.style.width = '0%'; // heat arrives in step 2
    const secs = lap.bestSectors.map((t, i) => `S${i + 1} ${t.toFixed(2)}`).join('  ');
    if (n.secs.textContent !== secs) n.secs.textContent = secs;
    if (now > this.popUntil) n.pop.classList.remove('show');
  }

  dispose() { this.el.remove(); }
}
