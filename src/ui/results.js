import { fmt } from './hud.js';

// End-of-race results over the whole TV.
export class Results {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'results';
    this.el.style.display = 'none';
    root.appendChild(this.el);
  }

  show(rows, laps) {
    const ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th');
    const best = Math.min(...rows.map((r) => r.best ?? Infinity));
    this.el.innerHTML = `<h2>RESULTS <small>${laps} laps</small></h2>
      <table>${rows.map((r) => `<tr style="--pc:${r.color}">
        <td class="r-pos">${ord(r.pos)}</td><td class="r-name">${r.label}${r.device ? ` <i>${r.device}</i>` : ''}</td>
        <td class="r-time">${r.time != null ? fmt(r.time) : `DNF <i>${r.laps}/${laps}</i>`}</td>
        <td class="r-best${r.best === best ? ' fast' : ''}">best ${fmt(r.best)}</td></tr>`).join('')}</table>
      <p>Enter / Menu on a controller / host phone: <b>race again</b> &nbsp;·&nbsp; Esc: <b>lobby</b></p>`;
    this.el.style.display = '';
  }

  hide() { this.el.style.display = 'none'; }
}
