import * as THREE from 'three';
import { CONFIG, playerColor } from '../../config.js';
import { Track } from '../track/track.js';
import { createPod, placePod } from '../physics/pod.js';
import { stepPod } from '../physics/world.js';
import { LapTimer } from '../race/laps.js';
import { buildTrackMeshes } from '../render/trackMesh.js';
import { buildEnvironment, SUN_DIR } from '../render/environment.js';
import { createPodMesh } from '../render/podMesh.js';
import { ChaseCamera } from '../render/chaseCamera.js';
import { Dust, SpeedStreaks } from '../render/effects.js';
import { splitLayout } from '../tv/layout.js';
import { Hud } from '../ui/hud.js';
import { DebugOverlay } from '../ui/debugOverlay.js';
import { TuningPanel } from '../ui/tuningPanel.js';
import { KeyboardPod } from '../input/keyboard.js';
import { gamepads } from '../input/gamepad.js';
import { collidePods } from '../physics/collisions.js';
import { Minimap } from '../ui/minimap.js';
import { Results } from '../ui/results.js';
import { resetHeat, launch } from '../physics/heat.js';

const lerp = (a, b, t) => a + (b - a) * t;

// Split-screen cell with no player in it (3 players in a 2x2 grid), or null.
function emptyCell(n) {
  if (n !== 3) return null;
  return { x: 0.5, y: 0.5, w: 0.5, h: 0.5 };
}
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

// ============================================================================
//  Game: owns the track, pods, fixed-step physics loop, render and HUD.
//  Physics runs at CONFIG.physics.hz no matter the frame rate; rendering
//  interpolates between the last two physics states.
// ============================================================================
export class Game {
  constructor({ canvas, hudRoot, inputs, getLobby, sendFx = () => {} }) {
    this.sendFx = sendFx;
    this.cdLeft = 0; this.goUntil = 0;
    this.canvas = canvas; this.hudRoot = hudRoot; this.inputs = inputs; this.getLobby = getLobby;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = CONFIG.render.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setScissorTest(true);
    this.scene = new THREE.Scene();
    this.track = new Track();
    this.env = buildEnvironment(this.scene);
    this.scene.add(buildTrackMeshes(this.track));
    this.dust = new Dust(this.scene);
    this.keyboard = new KeyboardPod();
    this.debug = new DebugOverlay(hudRoot);
    this.tuning = new TuningPanel(hudRoot);
    if (CONFIG.debug.overlayOnStart) this.debug.toggle();
    this.players = [];
    this.running = false;
    this.minimap = new Minimap(hudRoot, this.track);
    this.resultsUI = new Results(hudRoot);
    addEventListener('resize', () => this.layout());
    addEventListener('keydown', (e) => this.key(e));
  }

  // players: [{ slot, label, local }]. slot -1 = keyboard-only pod (nobody joined).
  // local = 'padN' for a controller that joined on the TV.
  start(players) {
    this.stop();
    const list = players.length ? players : [{ slot: -1, label: 'P1' }];
    this.solo = list.length === 1;
    this.practice = CONFIG.race.laps <= 0 || (this.solo && CONFIG.race.practiceWhenSolo);
    this.players = list.map((p, i) => {
      const color = playerColor(Math.max(0, p.slot));
      const pod = createPod(p.slot);
      const mesh = createPodMesh(color);
      this.scene.add(mesh.root);
      const cam = new ChaseCamera();
      const streaks = new SpeedStreaks();
      cam.cam.add(streaks.lines);
      this.scene.add(cam.cam);
      const hud = new Hud(this.hudRoot, color, p.label);
      const lap = new LapTimer(this.track);
      const pl = { ...p, gridIndex: i, color, pod, mesh, cam, streaks, hud, lap, input: { l: 0, r: 0 }, interp: {}, keyboard: false, pos: i + 1 };
      this.resetToStart(pl);
      return pl;
    });
    this.time = 0; this.acc = 0; this.lastFrame = performance.now(); this.steps = 0;
    this.running = true;
    this.resetRace();
    this.startCountdown();
    this.canvas.style.display = '';
    this.layout();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  resetRace() {
    this.goTime = 0; this.firstFinish = null; this.results = null;
    this.resultsUI.hide();
    for (const p of this.players) { p.finished = false; p.finishTime = null; }
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const p of this.players) { this.scene.remove(p.mesh.root); this.scene.remove(p.cam.cam); p.hud.dispose(); }
    this.players = [];
    this.minimap.hide(); this.resultsUI.hide();
    this.canvas.style.display = 'none';
  }

  layout() {
    const n = Math.max(1, this.players.length);
    const pr = Math.min(devicePixelRatio || 1, CONFIG.render.pixelRatioByViewports[Math.min(n, CONFIG.render.pixelRatioByViewports.length - 1)]);
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.rects = splitLayout(n);
    this.env.light.castShadow = CONFIG.render.shadows && (n === 1 || CONFIG.render.splitShadows);
    this.players.forEach((p, i) => {
      const r = this.rects[i];
      p.cam.setAspect((r.w * innerWidth) / (r.h * innerHeight));
      p.hud.setRect(r);
    });
    // an empty split-screen cell (3 players) shows the track map
    const empty = emptyCell(n);
    if (empty) this.minimap.show(empty); else this.minimap.hide();
  }

  key(e) {
    if (!this.running || e.repeat) return;
    if (e.code === 'Backquote') this.debug.toggle();
    else if (e.code === 'KeyR') this.restart();
    else if (e.code === 'KeyT') this.players.forEach((p) => this.resetToCheckpoint(p));
    else if (this.debug.visible && !this.tuning.visible && /^Digit\d$/.test(e.code)) {
      const spot = this.track.testSpots.find((x) => x.key === e.code.slice(5));
      if (spot) this.players.forEach((p) => this.teleport(p, spot));
    }
  }

  resetToStart(p) {
    placePod(p.pod, this.track.gridSlot(p.gridIndex), CONFIG.hover.rideHeight);
    resetHeat(p.pod, p.input && p.input.ventCount || 0);
    p.lap.reset();
    p.cam.snap();
  }

  // Out of bounds / stuck: back to the last checkpoint, facing along the track, with a short frozen penalty.
  autoReset(p, reason) {
    const gates = this.track.checkpoints;
    const pose = p.lap.lastCp < 0 ? this.track.gridSlot(p.gridIndex) : this.track.gatePose(gates[p.lap.lastCp]);
    placePod(p.pod, pose, CONFIG.hover.rideHeight);
    p.pod.penalty = CONFIG.wall.resetPenalty;
    p.cam.snap();
    p.hud.event({ type: 'reset', text: reason === 'stuck' ? 'STUCK - RESET' : reason === 'manual' ? 'RESET' : 'OUT OF BOUNDS' }, performance.now());
  }

  // Back to the grid with a fresh timed-start countdown.
  restart() {
    this.players.forEach((p) => this.resetToStart(p));
    this.resetRace();
    this.startCountdown();
  }

  startCountdown() {
    const n = CONFIG.race.countdown;
    this.goUntil = 0;
    if (n > 0) { this.cdLeft = n; this.players.forEach((p) => { p.pod.locked = true; }); }
    else this.cdLeft = 0;
  }

  go() {
    this.cdLeft = 0; this.goUntil = performance.now() + 900; this.goTime = this.time;
    this.players.forEach((p) => launch(p.pod));
  }

  resetToCheckpoint(p) {
    const gates = this.track.checkpoints;
    if (p.lap.lastCp < 0) { this.resetToStart(p); return; }
    placePod(p.pod, this.track.gatePose(gates[p.lap.lastCp]), CONFIG.hover.rideHeight);
    p.cam.snap();
    p.hud.event({ type: 'reset', text: 'RESET TO CHECKPOINT' }, performance.now());
  }

  // Debug: jump to a test spot. The current lap is cancelled (timing restarts at the line).
  teleport(p, spot) {
    placePod(p.pod, this.track.poseAt(spot.s), CONFIG.hover.rideHeight);
    const gates = this.track.checkpoints;
    let next = gates.findIndex((g) => g.s > spot.s);
    if (next < 0) next = 0;
    p.lap.lap = 0; p.lap.nextCp = next; p.lap.lastCp = (next - 1 + gates.length) % gates.length;
    p.cam.snap();
    p.hud.event({ type: 'reset', text: spot.name.toUpperCase() }, performance.now());
  }

  // Latest input for a player.
  //  - a controller that joined on the TV drives its own pod
  //  - phones drive their pods; the keyboard can take over the first pod (test key overrides)
  //  - solo: an unjoined controller can also take over
  readInput(p) {
    let inp, src;
    const first = p === this.players[0];
    if (p.local) {
      p.padState = gamepads.byKey(p.local); inp = p.padState.input(); src = 'pad';
    } else {
      const pad = this.solo ? gamepads.mostRecent() : null;
      const padFree = pad && !this.players.some((q) => q.local === pad.key);
      if (padFree && (pad.active || (p.slot < 0 && !this.keyboard.active))) { p.padState = pad; inp = pad.input(); src = 'pad'; }
      else if (p.slot < 0 || (first && this.keyboard.active)) { inp = this.keyboard.input(); src = 'kb'; }
      else {
        const phone = this.inputs.get(p.slot);
        inp = { l: phone.l, r: phone.r, od: phone.od, vent: phone.vent, ventCount: phone.ventCount, assist: phone.assist, t: phone.t, seq: phone.seq };
        src = 'phone';
      }
    }
    p.pad = src === 'pad'; p.keyboard = src === 'kb';
    if (src !== p.src) { p.src = src; p.pod.lastVentCount = inp.ventCount; } // each device has its own vent counter
    return inp;
  }

  // A controller's View button: that player back to the last checkpoint (penalty when racing others).
  resetByPad(padState) {
    const p = this.players.find((q) => q.local === padState.key) || (this.solo ? this.players[0] : null);
    if (!p) return;
    if (this.solo) this.resetToCheckpoint(p); else this.autoReset(p, 'manual');
  }

  // Race order: finished pods by finish time, then everyone else by distance covered.
  standings() {
    const L = this.track.length;
    for (const p of this.players) {
      const rel = (((p.pod.progress - this.track.startS) % L) + L) % L;
      p.distance = p.lap.lap === 0 ? (rel > L / 2 ? rel - L : rel) : (p.lap.lap - 1) * L + rel;
    }
    const order = [...this.players].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.distance - a.distance;
    });
    order.forEach((p, i) => { p.pos = i + 1; });
    return order;
  }

  checkFinish(p) {
    if (this.practice || p.finished || p.lap.laps.length < CONFIG.race.laps) return;
    p.finished = true;
    p.finishTime = this.time - this.goTime;
    if (this.firstFinish === null) this.firstFinish = this.time;
    const pos = this.players.filter((q) => q.finished).length;
    p.pod.events.push({ type: 'finish', pos, time: p.finishTime });
  }

  checkRaceEnd() {
    if (this.practice || this.results || this.firstFinish === null) return;
    const lobby = this.getLobby();
    const racing = this.players.filter((p) => p.slot < 0 || p.local || (lobby && lobby.players[p.slot] && lobby.players[p.slot].connected));
    const allDone = racing.every((p) => p.finished);
    if (allDone || this.time - this.firstFinish > CONFIG.race.finishTimeout) this.showResults();
  }

  showResults() {
    const order = this.standings();
    this.results = order.map((p) => ({
      pos: p.pos, label: p.label, color: p.color, time: p.finished ? p.finishTime : null,
      best: p.lap.bestLap, laps: p.lap.laps.length, device: p.local ? 'gamepad' : '',
    }));
    this.resultsUI.show(this.results, CONFIG.race.laps);
  }

  tick(dt) {
    if (this.cdLeft > 0) {
      this.cdLeft -= dt;
      if (this.cdLeft <= 0) this.go();
    }
    for (const p of this.players) {
      p.input = this.readInput(p);
      p.pod.prevTime = this.time;
      stepPod(p.pod, p.input, this.track, dt);
    }
    if (this.players.length > 1) collidePods(this.players.map((p) => p.pod));
    for (const p of this.players) {
      p.lap.update(p.pod, this.time + dt, p.pod.events);
      this.checkFinish(p);
      if (p.pod.resetReason) this.autoReset(p, p.pod.resetReason);
    }
    this.time += dt;
    this.checkRaceEnd();
  }

  frame(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const frameDt = Math.min(0.25, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.keyboard.update(frameDt);

    // fixed-step physics
    const STEP = 1 / CONFIG.physics.hz;
    this.acc += frameDt;
    let steps = 0;
    while (this.acc >= STEP && steps < CONFIG.physics.maxStepsPerFrame) { this.tick(STEP); this.acc -= STEP; steps++; }
    if (steps >= CONFIG.physics.maxStepsPerFrame) this.acc = 0;
    this.steps = steps;
    const alpha = this.acc / STEP;

    // interpolate + render each viewport
    const W = innerWidth, H = innerHeight;
    this.players.forEach((p, i) => {
      const pod = p.pod, s = p.interp;
      s.x = lerp(pod.px, pod.x, alpha); s.y = lerp(pod.py, pod.y, alpha); s.z = lerp(pod.pz, pod.z, alpha);
      s.yaw = lerpAngle(pod.pyaw, pod.yaw, alpha);
      s.pitch = lerp(pod.ppitch, pod.pitch, alpha); s.roll = lerp(pod.proll, pod.roll, alpha);
      s.vx = pod.vx; s.vz = pod.vz; s.speed = pod.speed; s.engL = pod.engL; s.engR = pod.engR;
      s.airborne = pod.airborne; s.contact = pod.contact; s.slip = pod.slip; s.surface = pod.surface; s.groundH = pod.ground.h;
      p.mesh.update(s, now / 1000);
      this.dust.emit(p, s, frameDt);
      for (const e of pod.events) {
        p.hud.event(e, now);
        this.onPodEvent(p, e, s);
      }
      pod.events.length = 0;
      this.heatFx(p, s, frameDt, now);
    });
    this.dust.update(frameDt);
    this.standings();
    const lobby = this.getLobby();

    this.players.forEach((p, i) => {
      const r = this.rects[i];
      p.cam.update(p.interp, frameDt, this.track);
      p.streaks.update(p.pod.speed, frameDt);
      this.env.follow(p.interp.x, p.interp.y, p.interp.z);
      const cp = p.cam.cam.position;
      const [sky, sun] = this.scene.userData.skyFollow || [];
      if (sky) { sky.position.copy(cp); sun.position.set(cp.x + SUN_DIR.x * 1900, cp.y + SUN_DIR.y * 1900, cp.z + SUN_DIR.z * 1900); }
      const x = Math.round(r.x * W), y = Math.round((1 - r.y - r.h) * H), w = Math.round(r.w * W), h = Math.round(r.h * H);
      this.renderer.setViewport(x, y, w, h);
      this.renderer.setScissor(x, y, w, h);
      this.renderer.render(this.scene, p.cam.cam);
      const lp = lobby && p.slot >= 0 ? lobby.players[p.slot] : null;
      p.hud.update(p.pod, p.lap, this.time, p.pos, this.players.length, p.pad ? 'GAMEPAD' : p.keyboard ? 'KEYBOARD' : '', now, {
        laps: this.practice ? 0 : CONFIG.race.laps, finished: p.finished, disconnected: !p.local && lp && !lp.connected && !p.keyboard && !p.pad,
      });
    });
    this.minimap.draw(this.players);

    this.debug.update({
      hz: CONFIG.physics.hz, steps, pixelRatio: this.pixelRatio, spots: this.track.testSpots,
      pods: this.players.map((p) => ({ label: p.label, pod: p.pod, input: p.input, keyboard: p.pad ? 'GAMEPAD' : p.keyboard ? 'KEYBOARD' : '', lapTimer: p.lap, latency: this.latencyText(p, now) })),
    }, now);
  }

  // Engine nozzle position in the world (side: -1 = right engine, +1 = left engine).
  nozzle(s, side, back = 2.9) {
    const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw), lx = side * 1.6, lz = 1.3 - back;
    return [s.x + lx * cos + lz * sin, s.y + 0.3, s.z - lx * sin + lz * cos];
  }

  onPodEvent(p, e, s) {
    const buzz = (kind) => { if (p.slot >= 0 && !p.pad && !p.keyboard) this.sendFx(p.slot, { t: 'vib', k: kind }); };
    if (e.type === 'land') {
      p.cam.addShake(0.3 + e.loss * 3);
      if (p.pad && e.loss > 0.03) gamepads.rumble(p.padState, Math.min(1, 0.3 + e.loss * 2), 200);
    } else if (e.type === 'vent') {
      const perfect = e.kind === 'perfect', n = perfect ? 34 : e.kind === 'green' ? 4 : 16;
      for (const side of [-1, 1]) for (let i = 0; i < n / 2; i++) {
        const [x, y, z] = this.nozzle(s, side, 1.5);
        const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * (perfect ? 9 : 5);
        this.dust.puff(x, y, z, s.vx * 0.5 + Math.cos(a) * sp, 1 + Math.random() * 3, s.vz * 0.5 + Math.sin(a) * sp,
          perfect ? '#d8f6ff' : '#f4f4f4', 0.7 + Math.random() * 0.5, 1.2, perfect ? 7 : 4, 0.55);
      }
      if (e.kind !== 'green') p.cam.addShake(perfect ? 0.5 : 0.2);
      buzz(perfect ? 'perfect' : 'vent');
      if (p.pad) gamepads.rumble(p.padState, perfect ? 1 : 0.4, perfect ? 260 : 120);
    } else if (e.type === 'overheat' || e.type === 'flood') {
      for (let i = 0; i < 40; i++) {
        const [x, y, z] = this.nozzle(s, i % 2 ? 1 : -1, 1.5);
        this.dust.puff(x, y, z, (Math.random() - 0.5) * 8, 2 + Math.random() * 5, (Math.random() - 0.5) * 8, '#2b2623', 1.2 + Math.random(), 1.5, 8, 0.6);
      }
      p.cam.addShake(0.9);
      buzz('overheat');
      if (p.pad) gamepads.rumble(p.padState, 1, 500);
    } else if (e.type === 'wall') {
      const sp = e.speed, rock = e.kind === 'pillar' ? '#b56236' : '#a8572c';
      const sparks = Math.min(36, Math.round(sp * 1.1)), y = s.y - 0.2;
      for (let i = 0; i < sparks; i++) {
        const a = Math.random() * 6.28, v = 4 + Math.random() * sp * 0.5;
        this.dust.puff(e.x, y, e.z, e.nx * v * 0.6 + Math.cos(a) * v * 0.5 + s.vx * 0.3, 1 + Math.random() * 4, e.nz * v * 0.6 + Math.sin(a) * v * 0.5 + s.vz * 0.3,
          Math.random() < 0.5 ? '#ffd27a' : '#ff9a3a', 0.25 + Math.random() * 0.3, 0.3, 0, 1);
      }
      for (let i = 0; i < Math.min(14, sp * 0.4); i++) {
        this.dust.puff(e.x, y, e.z, e.nx * 3 + (Math.random() - 0.5) * 5, 1 + Math.random() * 3, e.nz * 3 + (Math.random() - 0.5) * 5, rock, 0.8 + Math.random() * 0.6, 1.2, 6, 0.5);
      }
      p.cam.addShake(Math.min(1.3, sp / 22));
      if (sp > 6) buzz('wall');
      if (p.pad) gamepads.rumble(p.padState, Math.min(1, sp / 30), 150);
    } else if (e.type === 'bump') {
      p.cam.addShake(Math.min(1.2, e.speed / 20));
      if (e.speed > 6) buzz('wall');
      if (p.pad) gamepads.rumble(p.padState, Math.min(1, e.speed / 25), 160);
      if (e.victim) for (let i = 0; i < Math.min(20, e.speed); i++) {
        this.dust.puff(e.x, s.y, e.z, (Math.random() - 0.5) * 10, 1 + Math.random() * 4, (Math.random() - 0.5) * 10, Math.random() < 0.5 ? '#ffd27a' : '#ff9a3a', 0.3, 0.3, 0, 1);
      }
    } else if (e.type === 'launch') {
      p.cam.addShake(0.6);
      if (p.pad) gamepads.rumble(p.padState, 0.8, 300);
    }
  }

  // Continuous heat effects: smoke while stalled / near red, plus phone tint/state updates.
  heatFx(p, s, dt, now) {
    const pod = p.pod;
    const rate = pod.stall > 0 ? 45 : pod.heat > 0.9 ? 10 : pod.locked && pod.heat > 0.75 ? 8 : 0;
    p.smokeAcc = (p.smokeAcc || 0) + rate * dt;
    while (p.smokeAcc >= 1) {
      p.smokeAcc -= 1;
      const [x, y, z] = this.nozzle(s, Math.random() < 0.5 ? -1 : 1, 2.2);
      this.dust.puff(x, y + 0.2, z, s.vx * 0.4 + (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, s.vz * 0.4 + (Math.random() - 0.5) * 2,
        pod.stall > 0 ? '#2b2623' : '#6b625b', 1.0 + Math.random() * 0.8, 1, 5, pod.stall > 0 ? 0.55 : 0.35);
    }
    // continuous sparks while scraping a wall
    if (pod.scrape > 0.05) {
      p.sparkAcc = (p.sparkAcc || 0) + CONFIG.wall.sparkRate * pod.scrape * dt;
      const R = CONFIG.wall.radius;
      while (p.sparkAcc >= 1) {
        p.sparkAcc -= 1;
        const along = Math.random() * 6 - 3;
        this.dust.puff(s.x - pod.wallNx * R, s.y - 0.2 + Math.random() * 0.5, s.z - pod.wallNz * R, s.vx * 0.5 + pod.wallNx * (1 + Math.random() * 3), 1 + Math.random() * 3, s.vz * 0.5 + pod.wallNz * (1 + Math.random() * 3),
          Math.random() < 0.5 ? '#ffd27a' : '#ff9a3a', 0.2 + Math.random() * 0.25, 0.3, 0, 1);
      }
    }
    // phone state at ~15 Hz (background tint, vent button)
    p.fxT = (p.fxT || 0) + dt;
    if (p.slot >= 0 && p.fxT > 1 / 15) {
      p.fxT = 0;
      this.sendFx(p.slot, { t: 'fx', h: Math.round(pod.heat * 100), s: pod.stall > 0 ? 1 : 0, b: pod.boost > 0.5 ? 1 : 0,
        v: Math.round((1 - pod.ventCd / CONFIG.heat.ventCooldown) * 100), c: this.cdLeft > 0 ? 1 : 0, e: this.results ? 1 : 0 });
    }
    // countdown / GO banner
    let cd = { text: '' };
    if (pod.penalty > 0) cd = { text: `RESET ${pod.penalty.toFixed(1)}`, kind: 'ready' };
    else if (this.cdLeft > 0) {
      const t = this.cdLeft;
      cd = t > 3 ? { text: 'READY', kind: 'ready', window: true } : { text: String(Math.ceil(t)), window: true };
    } else if (now < this.goUntil) cd = { text: 'GO!', kind: 'go' };
    p.hud.setCountdown(cd);
  }

  latencyText(p, now) {
    if (p.pad) return `gamepad (local): ${(p.padState && p.padState.id || '').slice(0, 40)}`;
    if (p.keyboard) return 'keyboard (local)';
    const lobby = this.getLobby();
    const pl = lobby && lobby.players[p.slot];
    if (!pl || !pl.connected) return 'phone disconnected';
    const inp = this.inputs.get(p.slot);
    const age = inp.t ? Math.max(0, performance.now() - inp.t) : NaN;
    return `seq ${inp.seq}  ping ${pl.ping} ms  ~${Math.round(pl.ping / 2 + 8)} ms phone->TV  last packet ${age.toFixed(0)} ms ago`;
  }
}
