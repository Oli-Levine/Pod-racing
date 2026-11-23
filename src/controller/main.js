import './controller.css';
import { CONFIG } from '../../config.js';
import { WsClient } from '../net/wsClient.js';
import { ThrottlePad } from './pad.js';
import { drawPads } from './padView.js';
import { wake } from './wake.js';

const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

const S = {
  pid: store.get('pod.pid'), slot: -1, color: '#888', joined: false,
  phase: 'lobby', lobby: null, ready: false, assist: store.get('pod.assist') === '1',
  connected: false, rejected: null, left: false, ping: 0, lastPong: 0,
  seq: 0, ventCount: 0, ventHeld: false,
  heat: 0, stall: false, boost: false, ventReady: 1, countdown: false, fxAt: 0, ended: false,
};

// ---- Haptics ------------------------------------------------------------------
// vent: short tick. perfect: sharp triple. overheat: long double thud. wall: one hit.
const PATTERNS = { vent: [35], perfect: [25, 45, 25, 45, 70], overheat: [280, 70, 280], wall: [30], slide: [20, 30, 45] };
function haptic(kind) {
  try { if (navigator.vibrate && PATTERNS[kind]) navigator.vibrate(PATTERNS[kind]); } catch {}
}

// ---- Pads + vent ------------------------------------------------------------
const padL = new ThrottlePad($('padL'), 'L');
const padR = new ThrottlePad($('padR'), 'R');
const vent = $('vent');
vent.style.setProperty('--size', CONFIG.controller.ventButtonPx + 'px');
vent.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  try { vent.setPointerCapture(e.pointerId); } catch {}
  S.ventHeld = true; S.ventCount++; vent.classList.add('down');
  haptic('vent'); // instant feedback; the TV sends a stronger pattern for a perfect vent
});
const ventUp = () => { S.ventHeld = false; vent.classList.remove('down'); };
vent.addEventListener('pointerup', ventUp);
vent.addEventListener('pointercancel', ventUp);

// ---- Connection --------------------------------------------------------------
const conn = new WsClient('controller', {
  onOpen() {
    S.connected = true; S.lastPong = performance.now();
    if (!S.left) hello();
    render();
  },
  onMessage: onMsg,
  onClose() { S.connected = false; S.joined = false; S.pending = false; render(); },
});

function hello() { if (S.pending) return; S.pending = true; conn.send({ t: 'hello', pid: S.pid, assist: S.assist }); }

function onMsg(m) {
  switch (m.t) {
    case 'welcome':
      S.pending = false; S.pid = m.pid; store.set('pod.pid', m.pid);
      S.slot = m.slot; S.color = m.color; S.joined = true; S.rejected = null;
      document.documentElement.style.setProperty('--pc', m.color);
      break;
    case 'rejected':
      S.pending = false; S.joined = false; S.rejected = m.reason;
      break;
    case 'pong':
      S.lastPong = performance.now();
      S.ping = S.lastPong - m.c;
      break;
    case 'lobby':
      S.lobby = m; S.phase = m.phase;
      if (S.joined) S.ready = !!m.players[S.slot]?.ready;
      // Not joined (race was running / lobby was full): try again when a slot is free.
      if (!S.joined && !S.left && m.phase === 'lobby' && m.players.some((p) => !p.occupied)) hello();
      // Slot was freed under us (e.g. server restarted): fall back to unjoined.
      if (S.joined && !m.players[S.slot]?.occupied) { S.joined = false; S.pid = null; hello(); }
      break;
    case 'fx': // heat state from the TV (~15 Hz): drives the background tint + vent button
      S.heat = m.h / 100; S.stall = !!m.s; S.boost = !!m.b; S.ventReady = m.v / 100; S.countdown = !!m.c; S.fxAt = performance.now();
      if (!!m.e !== S.ended) { S.ended = !!m.e; render(); } // race over: host gets RACE AGAIN
      return;
    case 'vib': // haptics (Android only; iOS Safari has no vibration API - fails silently)
      haptic(m.k);
      return;
  }
  render();
}

// ---- Ping / watchdog ---------------------------------------------------------
setInterval(() => {
  const now = performance.now();
  if (conn.open) {
    conn.send({ t: 'ping', c: now, rtt: Math.round(S.ping) });
    if (now - S.lastPong > CONFIG.net.pongTimeoutMs) { S.lastPong = now; conn.reset(); } // half-open socket
  }
}, CONFIG.net.pingIntervalMs);

// ---- Input send loop ----------------------------------------------------------
setInterval(() => {
  if (!conn.open || !S.joined) return;
  if (conn.ws.bufferedAmount > 4096) return; // don't queue stale input behind a stalled link
  const l = padL.value, r = padR.value;
  conn.send({
    t: 'in', s: ++S.seq,
    l: Math.round(l * 1000) / 1000, r: Math.round(r * 1000) / 1000,
    o: (padL.od ? 1 : 0) | (padR.od ? 2 : 0),
    v: S.ventHeld ? 1 : 0, c: S.ventCount, a: S.assist ? 1 : 0,
  });
}, 1000 / CONFIG.controller.inputHz);

// ---- UI -----------------------------------------------------------------------
const ui = {
  pname: $('pname'), status: $('status'), ping: $('ping'), wake: $('wake'),
  assist: $('assist'), ready: $('ready'), start: $('start'), leave: $('leave'),
  lobbyBtns: $('lobbyBtns'), overlay: $('overlay'),
  ovTitle: $('ovTitle'), ovText: $('ovText'), ovBtn: $('ovBtn'),
};

$('assist').addEventListener('click', () => {
  S.assist = !S.assist; store.set('pod.assist', S.assist ? '1' : '0'); render();
});
ui.ready.addEventListener('click', () => conn.send({ t: 'ready', v: !S.ready }));
ui.start.addEventListener('click', () => conn.send({ t: 'start' }));
ui.leave.addEventListener('click', () => {
  conn.send({ t: 'leave' });
  S.left = true; S.joined = false; S.pid = null; store.del('pod.pid');
  render();
});

let ovAction = null;
ui.ovBtn.addEventListener('click', () => ovAction && ovAction());

function overlay(title, text, btn, action) {
  ui.overlay.classList.remove('hidden');
  ui.ovTitle.textContent = title; ui.ovText.textContent = text;
  ui.ovBtn.textContent = btn || ''; ui.ovBtn.style.display = btn ? '' : 'none';
  ovAction = action || null;
}

let fsAsked = false;
function render() {
  const lobby = S.phase === 'lobby';
  ui.pname.textContent = S.joined ? `P${S.slot + 1}` : '--';
  document.getElementById('dot').style.background = S.joined ? S.color : '#555';
  ui.status.textContent = !S.connected ? 'reconnecting…' : S.joined ? (lobby ? 'in lobby' : 'racing') : 'connected';
  ui.status.className = S.connected ? 'ok' : 'bad';
  ui.ping.textContent = S.connected ? `${Math.round(S.ping)} ms` : '-- ms';
  ui.wake.className = wake.status === 'off' || wake.status === 'none' ? 'off' : 'on';
  ui.assist.textContent = `ASSIST: ${S.assist ? 'ON' : 'OFF'}`;
  ui.assist.classList.toggle('on', S.assist);
  const isHost = S.joined && S.lobby && S.lobby.host === S.slot;
  if (lobby) S.ended = false;
  ui.lobbyBtns.style.display = (lobby && S.joined) || (S.ended && isHost) ? '' : 'none';
  ui.ready.style.display = ui.leave.style.display = lobby ? '' : 'none';
  ui.start.textContent = lobby ? 'START' : 'RACE AGAIN';
  ui.ready.textContent = S.ready ? 'READY ✓' : 'READY';
  ui.ready.classList.toggle('on', S.ready);
  const players = S.lobby ? S.lobby.players.filter((p) => p.occupied && p.connected) : [];
  const allReady = players.length > 0 && players.every((p) => p.ready);
  ui.start.style.display = isHost ? '' : 'none';
  ui.start.disabled = lobby && !allReady;

  if (S.rejected && !S.joined) {
    overlay(S.rejected === 'race' ? 'Race in progress' : 'Lobby full',
      S.rejected === 'race' ? 'You will join automatically when the next lobby opens.' : 'You will join automatically when a slot frees up.');
  } else if (S.left) {
    overlay('You left the lobby', '', 'JOIN AGAIN', () => { S.left = false; hello(); render(); });
  } else if (!S.connected) {
    overlay('Connecting…', 'Looking for the game. Same Wi-Fi as the TV?');
  } else if (!fsAsked) {
    overlay('Hover Pod Racing', 'Tap to go fullscreen and keep the screen awake.', 'TAP TO START', async () => {
      fsAsked = true;
      try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch {}
      try { await screen.orientation.lock('landscape'); } catch {}
      wake.enable().then(render);
      render();
    });
  } else {
    ui.overlay.classList.add('hidden');
  }
}
wake.onChange(render);

// ---- Heat tint: the whole background goes green -> yellow -> red so you can read it peripherally ----
const TINT = { green: [20, 82, 44], yellow: [128, 100, 12], red: [150, 24, 18] };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.min(1, Math.max(0, t)));
let cur = TINT.green.slice(), lastT = performance.now();
const padsEl = $('pads');
function tint(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  const stale = now - S.fxAt > 1000; // TV not sending state (lobby): neutral green
  const h = stale ? 0 : S.heat;
  const Y = 0.5;
  let target = h < Y - 0.07 ? TINT.green : h < Y ? mix(TINT.green, TINT.yellow, (h - (Y - 0.07)) / 0.07)
    : h < 0.82 ? TINT.yellow : h < 0.97 ? mix(TINT.yellow, TINT.red, (h - 0.82) / 0.15) : TINT.red;
  if (!stale && S.stall) target = TINT.red;
  const pulse = !stale && (S.stall || h > 0.9) ? 0.72 + 0.28 * Math.sin(now / (S.stall ? 40 : 70)) : 1;
  cur = mix(cur, target, 1 - Math.exp(-12 * dt));
  const c = cur.map((v) => Math.round(v * pulse)), d = cur.map((v) => Math.round(v * pulse * 0.28));
  const grad = `radial-gradient(130% 100% at 50% 100%, rgb(${c}), rgb(${d}))`;
  padsEl.style.background = grad;
  document.body.style.background = `rgb(${d})`;
  vent.classList.toggle('cool', !stale && S.ventReady < 1);
  vent.style.setProperty('--fill', (stale ? 1 : S.ventReady) * 100 + '%');
}

// ---- Draw loop ------------------------------------------------------------------
const canvas = $('view');
function frame(now) {
  tint(now);
  drawPads(canvas, [padL, padR], S);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
render();

// ---- Block zoom / selection / context menu -----------------------------------------
for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'selectstart', 'dblclick']) {
  document.addEventListener(ev, (e) => e.preventDefault());
}
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
