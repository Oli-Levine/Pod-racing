// Lap + sector timing from ordered invisible checkpoint gates.
// A gate counts only if it is the NEXT one in order and crossed forwards, so
// corner cutting past a gate gains nothing. Gate 0 is the start/finish line.
export class LapTimer {
  constructor(track) {
    this.track = track;
    this.reset();
  }

  reset() {
    this.nextCp = 0;          // next gate to cross
    this.lastCp = -1;         // last gate crossed (for resets)
    this.lap = 0;             // 0 = not started (on the grid), 1 = first lap...
    this.lapStart = 0; this.sectorStart = 0; this.sector = 0;
    this.lastLap = null; this.bestLap = null;
    this.curSectors = []; this.lastSectors = []; this.bestSectors = [];
    this.laps = [];
  }

  // Called after each physics step with the pod's previous and new position.
  update(pod, time, events) {
    const gates = this.track.checkpoints;
    const g = gates[this.nextCp];
    const a = (pod.px - g.x) * g.tx + (pod.pz - g.z) * g.tz;
    const b = (pod.x - g.x) * g.tx + (pod.z - g.z) * g.tz;
    if (!(a < 0 && b >= 0)) return;
    const lat = (pod.x - g.x) * -g.tz + (pod.z - g.z) * g.tx;
    if (Math.abs(lat) > g.half || Math.abs(pod.y - g.y) > 20) return;
    // exact crossing time within this step
    const t = time - (b / Math.max(1e-6, b - a)) * (time - (pod.prevTime ?? time));

    this.lastCp = this.nextCp;
    this.nextCp = (this.nextCp + 1) % gates.length;
    const ends = this.track.sectorEnds;

    if (g.index === 0) {
      if (this.lap > 0) {
        this.closeSector(t, events);
        const lapTime = t - this.lapStart;
        const best = this.bestLap === null || lapTime < this.bestLap;
        events.push({ type: 'lap', lap: this.lap, time: lapTime, delta: this.bestLap === null ? null : lapTime - this.bestLap, best });
        this.lastLap = lapTime;
        if (best) this.bestLap = lapTime;
        this.laps.push(lapTime);
        this.lastSectors = this.curSectors;
      }
      this.lap++;
      this.lapStart = t; this.sectorStart = t; this.sector = 0; this.curSectors = [];
    } else if (ends.includes(g.index) && this.lap > 0) {
      this.closeSector(t, events);
    }
  }

  closeSector(t, events) {
    const i = this.sector, time = t - this.sectorStart;
    const prevBest = this.bestSectors[i];
    events.push({ type: 'sector', sector: i, time, delta: prevBest == null ? null : time - prevBest });
    if (prevBest == null || time < prevBest) this.bestSectors[i] = time;
    this.curSectors[i] = time;
    this.sector++; this.sectorStart = t;
  }

  current(time) { return this.lap > 0 ? time - this.lapStart : 0; }
}
