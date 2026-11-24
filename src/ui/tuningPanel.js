import { CONFIG } from '../../config.js';

// ============================================================================
//  Live tuning panel (Tab). Changes CONFIG values in place while you drive;
//  physics reads CONFIG every tick, so changes apply instantly.
//    ,  .       previous / next section
//    [  ]       previous / next value
//    -  =       decrease / increase   (hold Shift for big steps, Alt for tiny)
//    0          reset value to config.js default
//    C          copy current values (paste back into config.js)
//  Changes are NOT saved: reload the page to go back to config.js.
// ============================================================================

const SECTIONS = ['handling', 'boost', 'slide', 'slipstream', 'wall', 'bump', 'pod', 'hover', 'air', 'assist', 'surfaces', 'physics', 'camera', 'fx', 'race'];
const SKIP = new Set(['hz', 'maxStepsPerFrame', 'near', 'far', 'laps']);

function collect() {
  const out = [];
  for (const sec of SECTIONS) {
    const items = [];
    const add = (obj, key, label) => { if (typeof obj[key] === 'number' && !SKIP.has(key)) items.push({ obj, key, label, def: obj[key] }); };
    const o = CONFIG[sec];
    if (sec === 'surfaces') {
      for (const [name, s] of Object.entries(o)) for (const k of Object.keys(s)) add(s, k, `${name}.${k}`);
    } else for (const k of Object.keys(o)) {
      if (Array.isArray(o[k])) o[k].forEach((_, i) => add(o[k], i, `${k}[${sec === 'wall' && o.angles && k !== 'angles' ? o.angles[i] + 'deg' : i}]`));
      else add(o, k, k);
    }
    out.push({ name: sec, items });
  }
  return out;
}

function stepFor(v, mult) {
  const a = Math.abs(v);
  const base = a === 0 ? 0.01 : Math.pow(10, Math.floor(Math.log10(a)) - 1);
  return base * mult;
}

const round = (v) => Number.parseFloat(v.toPrecision(6));

export class TuningPanel {
  constructor(root) {
    this.sections = collect();
    this.sec = 0; this.item = 0; this.visible = false;
    this.el = document.createElement('div');
    this.el.className = 'tuning';
    this.el.style.display = 'none';
    root.appendChild(this.el);
    addEventListener('keydown', (e) => this.key(e));
  }

  toggle() { this.visible = !this.visible; this.el.style.display = this.visible ? '' : 'none'; this.render(); }

  key(e) {
    if (e.code === 'Tab') { e.preventDefault(); this.toggle(); return; }
    if (!this.visible) return;
    const s = this.sections[this.sec];
    const it = s.items[this.item];
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    let handled = true;
    switch (e.code) {
      case 'Comma': this.sec = (this.sec + this.sections.length - 1) % this.sections.length; this.item = 0; break;
      case 'Period': this.sec = (this.sec + 1) % this.sections.length; this.item = 0; break;
      case 'BracketLeft': this.item = (this.item + s.items.length - 1) % s.items.length; break;
      case 'BracketRight': this.item = (this.item + 1) % s.items.length; break;
      case 'Minus': case 'NumpadSubtract': it.obj[it.key] = round(it.obj[it.key] - stepFor(it.obj[it.key], mult)); break;
      case 'Equal': case 'NumpadAdd': it.obj[it.key] = round(it.obj[it.key] + stepFor(it.obj[it.key], mult)); break;
      case 'Digit0': it.obj[it.key] = it.def; break;
      case 'KeyC': this.copy(); break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); this.render(); }
  }

  changed() {
    const list = [];
    for (const s of this.sections) for (const it of s.items) if (it.obj[it.key] !== it.def) list.push({ sec: s.name, it });
    return list;
  }

  // Text ready to paste into config.js: changed values listed first, then the
  // full tunable sections with current values.
  exportText() {
    const ch = this.changed();
    let t = '// ---- Tuning panel export ----\n// Changed:\n';
    t += ch.length ? ch.map(({ sec, it }) => `//   ${sec}.${it.label}: ${it.def} -> ${it.obj[it.key]}`).join('\n') : '//   (nothing)';
    t += '\n\n';
    for (const sec of SECTIONS) t += `  ${sec}: ${toJs(CONFIG[sec], 2)},\n`;
    return t;
  }

  copy() {
    const text = this.exportText();
    const done = (ok) => { this.flash = ok ? 'Copied! Paste into config.js (or send it to me).' : 'Copy blocked: text shown in the browser console.'; this.render(); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => done(true), () => { console.log(text); done(false); });
    else { console.log(text); done(false); }
  }

  render() {
    if (!this.visible) return;
    const s = this.sections[this.sec];
    const ch = new Set(this.changed().map((c) => c.it));
    const rows = s.items.map((it, i) => {
      const v = it.obj[it.key];
      return `<div class="t-row${i === this.item ? ' sel' : ''}${ch.has(it) ? ' chg' : ''}"><span>${it.label}</span><b>${v}</b>${ch.has(it) ? `<i>${it.def}</i>` : ''}</div>`;
    }).join('');
    const tabs = this.sections.map((x, i) => `<span class="${i === this.sec ? 'on' : ''}">${x.name}</span>`).join('');
    this.el.innerHTML = `<div class="t-head">TUNING <small>, . section · [ ] value · - = change (Shift big, Alt fine) · 0 reset · C copy · Tab close</small></div>
      <div class="t-tabs">${tabs}</div><div class="t-rows">${rows}</div>
      <div class="t-foot">${this.flash || `${ch.size} changed - not saved until pasted into config.js`}</div>`;
    this.flash = null;
  }
}

function toJs(v, ind) {
  const pad = ' '.repeat(ind + 2);
  if (typeof v !== 'object' || v === null) return typeof v === 'string' ? `'${v}'` : String(v);
  if (Array.isArray(v)) return `[${v.map((x) => toJs(x, ind)).join(', ')}]`;
  const entries = Object.entries(v).map(([k, x]) => `${pad}${k}: ${toJs(x, ind + 2)},`);
  return `{\n${entries.join('\n')}\n${' '.repeat(ind)}}`;
}
