// Debug overlay (` key): physics + input diagnostics.
const DEG = 180 / Math.PI;

export class DebugOverlay {
  constructor(root) {
    this.el = document.createElement('pre');
    this.el.className = 'debug';
    root.appendChild(this.el);
    this.visible = false; this.el.style.display = 'none';
    this.fps = 60; this.last = 0;
  }

  toggle() { this.visible = !this.visible; this.el.style.display = this.visible ? '' : 'none'; }

  update(info, now) {
    const dt = now - this.last; this.last = now;
    if (dt > 0) this.fps += (1000 / dt - this.fps) * 0.05;
    if (!this.visible || (this._t && now - this._t < 100)) return;
    this._t = now;
    const lines = [`fps ${this.fps.toFixed(0)}   physics ${info.hz} Hz   steps/frame ${info.steps}   pixel ratio ${info.pixelRatio}`];
    for (const p of info.pods) {
      const pod = p.pod, inp = p.input, lat = p.latency;
      lines.push('',
        `${p.label}${pod.assist ? '  [ASSIST]' : ''}${p.keyboard ? `  [${p.keyboard}]` : ''}`,
        `speed     ${(pod.speed * 3.6).toFixed(0).padStart(4)} km/h  (${pod.speed.toFixed(1)} m/s)`,
        `slip      ${(pod.slip * DEG).toFixed(1).padStart(6)} deg`,
        `yaw rate  ${(pod.yawRate * DEG).toFixed(1).padStart(6)} deg/s`,
        `engine L  ${(inp.l * 100).toFixed(0).padStart(4)}% in  ${(pod.engL * 100).toFixed(0).padStart(4)}% out`,
        `engine R  ${(inp.r * 100).toFixed(0).padStart(4)}% in  ${(pod.engR * 100).toFixed(0).padStart(4)}% out`,
        `boost     meter ${pod.boostMeter.toFixed(2)}${pod.boost > 0.5 ? '  BOOSTING' : ''}${pod.boostLocked ? '  LOCKED (refilling)' : ''}   thrust x${pod.thrustMult.toFixed(2)}  top-speed x${pod.falloffMult.toFixed(2)}`,
        `drift     ${pod.drift.toFixed(2)}${pod.driftHeld ? '  HELD' : ''}${pod.drifting ? '  DRIFTING' : ''}`,
        `surface   ${pod.surface}${pod.onTrack ? '' : ' (off track)'}`,
        `hover     ${(pod.y - pod.ground.h).toFixed(2)} m  contact ${pod.contact.toFixed(2)}${pod.airborne ? '  AIRBORNE' : ''}`,
        `skill     slide ${pod.slideState} charge ${pod.charge.toFixed(2)}   slipstream ${pod.slipstream.toFixed(2)} (drag x${pod.dragMult.toFixed(2)})`,
        `wall      ${pod.touching ? 'TOUCHING' : 'clear'}  scrape ${pod.scrape.toFixed(2)}  stuck ${pod.stuckT.toFixed(1)}s  penalty ${pod.penalty.toFixed(1)}s`,
        `progress  ${pod.progress.toFixed(0)} m   next cp ${p.lapTimer.nextCp}`,
        `input     ${lat}`);
    }
    if (info.spots) { lines.push('', 'teleport keys:'); for (let i = 0; i < info.spots.length; i += 3) lines.push('  ' + info.spots.slice(i, i + 3).map((x) => `${x.key} ${x.name}`).join('   ')); }
    this.el.textContent = lines.join('\n');
  }
}
