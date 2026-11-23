// Top-down track map with pod dots. Shown in the empty split-screen cell (3 players).
export class Minimap {
  constructor(root, track) {
    this.track = track;
    this.el = document.createElement('div');
    this.el.className = 'minimap';
    this.el.style.display = 'none';
    this.canvas = document.createElement('canvas');
    this.el.appendChild(this.canvas);
    root.appendChild(this.el);
    // bounds of the track
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of track.paths) for (let i = 0; i < p.n; i++) {
      x0 = Math.min(x0, p.x[i]); x1 = Math.max(x1, p.x[i]); z0 = Math.min(z0, p.z[i]); z1 = Math.max(z1, p.z[i]);
    }
    this.b = { x0, x1, z0, z1 };
    this.visible = false;
  }

  show(r) {
    Object.assign(this.el.style, { display: '', left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
    this.visible = true;
  }

  hide() { this.el.style.display = 'none'; this.visible = false; }

  draw(players) {
    if (!this.visible) return;
    const c = this.canvas, w = this.el.clientWidth, h = this.el.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); this.bg = null; }
    const g = c.getContext('2d');
    const { x0, x1, z0, z1 } = this.b, pad = 0.1;
    const sc = Math.min((w * (1 - 2 * pad)) / (x1 - x0), (h * (1 - 2 * pad)) / (z1 - z0));
    const ox = (w - (x1 - x0) * sc) / 2, oz = (h - (z1 - z0) * sc) / 2;
    // the world is seen from above with +X to the LEFT (three.js camera looking down -Y with +Z forward), so mirror x
    const X = (x) => w - (ox + (x - x0) * sc), Z = (z) => oz + (z1 - z) * sc;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (const p of this.track.paths) {
      g.beginPath();
      for (let i = 0; i < p.n; i += 4) { const px = X(p.x[i]), pz = Z(p.z[i]); i ? g.lineTo(px, pz) : g.moveTo(px, pz); }
      if (p.closed) g.closePath();
      g.strokeStyle = '#00000066'; g.lineWidth = Math.max(4, p.w[0] * sc + 6); g.stroke();
      g.strokeStyle = '#d9a26e'; g.lineWidth = Math.max(2, p.w[0] * sc); g.stroke();
    }
    const sl = this.track.checkpoints[0];
    g.strokeStyle = '#fff'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(X(sl.x - sl.tz * sl.half), Z(sl.z + sl.tx * sl.half)); g.lineTo(X(sl.x + sl.tz * sl.half), Z(sl.z - sl.tx * sl.half)); g.stroke();
    for (const p of [...players].sort((a, b) => b.pos - a.pos)) {
      const x = X(p.interp.x ?? p.pod.x), z = Z(p.interp.z ?? p.pod.z), r = Math.max(7, w * 0.018);
      g.beginPath(); g.arc(x, z, r, 0, Math.PI * 2); g.fillStyle = p.color; g.fill();
      g.lineWidth = 2; g.strokeStyle = '#1a0f08'; g.stroke();
      g.fillStyle = '#1a0f08'; g.font = `800 ${Math.round(r * 1.2)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(p.pos, x, z + 0.5);
    }
  }
}
