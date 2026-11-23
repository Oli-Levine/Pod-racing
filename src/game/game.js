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
import { gamepad } from '../input/gamepad.js';
import { resetHeat, launch } from '../physics/heat.js';

const lerp = (a, b, t) => a + (b - a) * t;
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
    this.lastVentCount = new Map();
    addEventListener('resize', () => this.layout());
    addEventListener('keydown', (e) => this.key(e));
  }

  // players: [{ slot, label }]. slot -1 = keyboard-only pod.
  start(players) {
    this.stop();
    const list = players.length ? players : [{ slot: -1, label: 'P1' }];
    // Step 1: single player. (Split screen + more pods arrive in step 4.)
    this.players = list.slice(0, 1).map((p, i) => {
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
      const pl = { ...p, gridIndex: i, color, pod, mesh, cam, streaks, hud, lap, input: { l: 0, r: 0 }, interp: {}, keyboard: false };
      this.resetToStart(pl);
      return pl;
    });
    this.time = 0; this.acc = 0; this.lastFrame = performance.now(); this.steps = 0;
    this.running = true;
    this.startCountdown();
    this.canvas.style.display = '';
    this.layout();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const p of this.players) { this.scene.remove(p.mesh.root); this.scene.remove(p.cam.cam); p.hud.dispose(); }
    this.players = [];
    this.canvas.style.display = 'none';
  }

  layout() {
    const n = Math.max(1, this.players.length);
    const pr = Math.min(devicePixelRatio || 1, CONFIG.render.pixelRatioByViewports[Math.min(n, CONFIG.render.pixelRatioByViewports.length - 1)]);
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.rects = splitLayout(n);
    this.players.forEach((p, i) => {
      const r = this.rects[i];
      p.cam.setAspect((r.w * innerWidth) / (r.h * innerHeight));
      p.hud.setRect(r);
    });
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

  // Back to the grid with a fresh timed-start countdown.
  restart() {
    this.players.forEach((p) => this.resetToStart(p));
    this.startCountdown();
  }

  startCountdown() {
    const n = CONFIG.race.countdown;
    this.goUntil = 0;
    if (n > 0) { this.cdLeft = n; this.players.forEach((p) => { p.pod.locked = true; }); }
    else this.cdLeft = 0;
  }

  go() {
    this.cdLeft = 0; this.goUntil = performance.now() + 900;
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

  // Latest input for a player: phone (via the server relay) or keyboard.
  readInput(p) {
    let inp;
    const phone = p.slot >= 0 ? this.inputs.get(p.slot) : null;
    // priority: gamepad (if in use) > keyboard (if in use) > phone. No phone = local controls only.
    p.pad = gamepad.active || (p.slot < 0 && gamepad.connected && !this.keyboard.active);
    p.keyboard = !p.pad && (p.slot < 0 || this.keyboard.active);
    if (p.pad) inp = gamepad.input();
    else if (p.keyboard) inp = this.keyboard.input();
    else inp = { l: phone.l, r: phone.r, od: phone.od, vent: phone.vent, ventCount: phone.ventCount, assist: phone.assist, t: phone.t, seq: phone.seq };
    const src = p.pad ? 'pad' : p.keyboard ? 'kb' : 'phone';
    if (src !== p.src) { p.src = src; p.pod.lastVentCount = inp.ventCount; } // each device has its own vent counter
    return inp;
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
      p.lap.update(p.pod, this.time + dt, p.pod.events);
      // safety net until step 3's proper out-of-bounds reset
      if (p.pod.y < -40 || p.pod.outside) this.resetToCheckpoint(p);
    }
    this.time += dt;
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
      p.hud.update(p.pod, p.lap, this.time, 1, this.players.length, p.pad ? 'GAMEPAD' : p.keyboard ? 'KEYBOARD' : '', now);
    });

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
      if (p.pad && e.loss > 0.03) gamepad.rumble(Math.min(1, 0.3 + e.loss * 2), 200);
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
      if (p.pad) gamepad.rumble(perfect ? 1 : 0.4, perfect ? 260 : 120);
    } else if (e.type === 'overheat' || e.type === 'flood') {
      for (let i = 0; i < 40; i++) {
        const [x, y, z] = this.nozzle(s, i % 2 ? 1 : -1, 1.5);
        this.dust.puff(x, y, z, (Math.random() - 0.5) * 8, 2 + Math.random() * 5, (Math.random() - 0.5) * 8, '#2b2623', 1.2 + Math.random(), 1.5, 8, 0.6);
      }
      p.cam.addShake(0.9);
      buzz('overheat');
      if (p.pad) gamepad.rumble(1, 500);
    } else if (e.type === 'launch') {
      p.cam.addShake(0.6);
      if (p.pad) gamepad.rumble(0.8, 300);
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
    // phone state at ~15 Hz (background tint, vent button)
    p.fxT = (p.fxT || 0) + dt;
    if (p.slot >= 0 && p.fxT > 1 / 15) {
      p.fxT = 0;
      this.sendFx(p.slot, { t: 'fx', h: Math.round(pod.heat * 100), s: pod.stall > 0 ? 1 : 0, b: pod.boost > 0.5 ? 1 : 0,
        v: Math.round((1 - pod.ventCd / CONFIG.heat.ventCooldown) * 100), c: this.cdLeft > 0 ? 1 : 0 });
    }
    // countdown / GO banner
    let cd = { text: '' };
    if (this.cdLeft > 0) {
      const t = this.cdLeft;
      cd = t > 3 ? { text: 'READY', kind: 'ready', window: true } : { text: String(Math.ceil(t)), window: true };
    } else if (now < this.goUntil) cd = { text: 'GO!', kind: 'go' };
    p.hud.setCountdown(cd);
  }

  latencyText(p, now) {
    if (p.pad) return `gamepad (local): ${gamepad.id.slice(0, 40)}`;
    if (p.keyboard) return 'keyboard (local)';
    const lobby = this.getLobby();
    const pl = lobby && lobby.players[p.slot];
    if (!pl || !pl.connected) return 'phone disconnected';
    const inp = this.inputs.get(p.slot);
    const age = inp.t ? Math.max(0, performance.now() - inp.t) : NaN;
    return `seq ${inp.seq}  ping ${pl.ping} ms  ~${Math.round(pl.ping / 2 + 8)} ms phone->TV  last packet ${age.toFixed(0)} ms ago`;
  }
}
