// Per-viewport HUD: speed, boost meter, lap, position, lap times, sector splits,
// landing feedback. DOM overlay positioned over the viewport.
import { CONFIG } from '../../config.js';

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
      <div class="h-tl"><span class="h-name">${label}</span><span class="h-assist">ASSIST</span><span class="h-kb"></span><span class="h-slipflag">SLIPSTREAM</span></div>
      <div class="h-tr">
        <div class="h-row"><span class="h-k">LAP</span><b class="h-lap">-</b><span class="h-k">POS</span><b class="h-pos">1/1</b></div>
        <div class="h-time">0:00.000</div>
        <div class="h-sub"><span class="h-k">LAST</span><span class="h-last">--:--.---</span></div>
        <div class="h-sub"><span class="h-k">BEST</span><span class="h-best">--:--.---</span></div>
        <div class="h-secs"></div>
      </div>
      <div class="h-bl">
        <div class="h-speed"><b>0</b><span>km/h</span></div>
        <div class="h-gauge">
          <div class="h-boost">
            <div class="h-boost-fill"></div>
            <span>BOOST</span>
          </div>
          <div class="h-chargebar"><div class="h-chargefill"></div><span>SLIDE</span></div>
        </div>
      </div>
      <div class="h-count"></div>
      <div class="h-banner"></div>
      <div class="h-pop"></div>
      <div class="h-flash"></div>`;
    root.appendChild(el);
    this.el = el;
    const q = (c) => el.querySelector(c);
    this.n = { lap: q('.h-lap'), pos: q('.h-pos'), time: q('.h-time'), last: q('.h-last'), best: q('.h-best'),
      speed: q('.h-speed b'), assist: q('.h-assist'), kb: q('.h-kb'), pop: q('.h-pop'), secs: q('.h-secs'), boost: q('.h-boost-fill'), count: q('.h-count'), flash: q('.h-flash'), banner: q('.h-banner'),
      slipflag: q('.h-slipflag'), chargebar: q('.h-chargebar'), chargefill: q('.h-chargefill') };
    this.flashUntil = 0;
    this.popUntil = 0;
  }

  setRect(r) {
    Object.assign(this.el.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
    // HUD sizes are in --u = 1% of this viewport's smaller side, so split-screen HUDs scale down
    this.el.style.setProperty('--u', Math.min(r.w * innerWidth, r.h * innerHeight) / 100 + 'px');
  }

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
    } else if (e.type === 'wall') {
      if (e.speed >= CONFIG.wall.heavyHit) this.popup(`HEAVY HIT  -${Math.round(e.lossFrac * 100)}%`, 'bad', now, 1000);
    } else if (e.type === 'boostEmpty') { this.popup('BOOST EMPTY', 'bad', now, 900); }
    else if (e.type === 'slideRelease') { this.popup(`SLIDE BOOST +${Math.round(e.charge * 100)}%`, 'perfect', now, 1000); }
    else if (e.type === 'slideLost') { this.popup('OVER-ROTATED', 'bad', now, 800); }
    else if (e.type === 'bump') {
      if (e.victim && e.speed > 8) this.popup('RAMMED!', 'bad', now, 900);
      else if (!e.victim && e.speed > 8) this.popup('HIT!', '', now, 600);
    }
  }

  flash(kind, now) {
    this.n.flash.className = 'h-flash ' + kind; void this.n.flash.offsetWidth; this.n.flash.classList.add('go');
    this.flashUntil = now + 600;
  }

  // countdown: { text, window } (text '' hides it)
  setCountdown(cd) {
    this.n.count.textContent = cd.text || '';
    this.n.count.classList.toggle('show', !!cd.text);
    this.n.count.dataset.kind = cd.kind || '';
  }

  update(pod, lap, time, pos, total, localDevice, now, extra = {}) {
    const n = this.n;
    n.speed.textContent = Math.round(pod.speed * 3.6);
    const lapNo = lap.lap > 0 ? (extra.laps ? Math.min(lap.lap, extra.laps) : lap.lap) : '-';
    n.lap.textContent = extra.laps ? `${lapNo}/${extra.laps}` : lapNo;
    const ord = (k) => k + (['th', 'st', 'nd', 'rd'][(k % 100 > 10 && k % 100 < 14) ? 0 : k % 10] || 'th');
    const banner = extra.finished ? `FINISHED ${ord(pos)}` : extra.disconnected ? 'PHONE DISCONNECTED - REJOIN TO DRIVE' : '';
    if (n.banner.textContent !== banner) { n.banner.textContent = banner; n.banner.classList.toggle('show', !!banner); }
    n.pos.textContent = `${pos}/${total}`;
    n.time.textContent = extra.finished ? fmt(lap.lastLap) : fmt(lap.current(time));
    n.last.textContent = fmt(lap.lastLap);
    n.best.textContent = fmt(lap.bestLap);
    n.assist.style.display = pod.assist ? '' : 'none';
    n.kb.style.display = localDevice ? '' : 'none';
    if (n.kb.textContent !== localDevice) n.kb.textContent = localDevice;
    n.boost.style.clipPath = `inset(0 ${(1 - pod.boostMeter) * 100}% 0 0)`;
    n.slipflag.style.display = extra.slipstream > 0.2 ? 'inline-block' : 'none';
    n.slipflag.style.opacity = 0.5 + extra.slipstream * 0.5;
    n.chargefill.style.width = pod.charge * 100 + '%';
    n.chargebar.dataset.state = pod.slideState;
    this.el.classList.toggle('boosting', pod.boost > 0.5);
    this.el.classList.toggle('boostLocked', pod.boostLocked);
    const secs = lap.bestSectors.map((t, i) => `S${i + 1} ${t.toFixed(2)}`).join('  ');
    if (n.secs.textContent !== secs) n.secs.textContent = secs;
    if (now > this.popUntil) n.pop.classList.remove('show');
  }

  dispose() { this.el.remove(); }
}
