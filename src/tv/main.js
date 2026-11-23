import './tv.css';
import { CONFIG, playerColor } from '../../config.js';
import { WsClient } from '../net/wsClient.js';
import { createBackdrop } from '../render/backdrop.js';
import { InputStore } from './inputStore.js';
import { createLobbyUI } from './lobbyUI.js';
import { Game } from '../game/game.js';

const $ = (id) => document.getElementById(id);
const inputs = new InputStore();
let snap = null;        // latest lobby snapshot from the server
let info = null;        // /api/info
let ipIndex = 0;

const backdrop = createBackdrop($('bg'));
let game = null; // built on first race start (track build takes a moment)
const lobbyUI = createLobbyUI({
  slotsEl: $('slots'), qrCanvas: $('qr'), urlEl: $('url'), ipNoteEl: $('ipnote'), maxPlayers: CONFIG.maxPlayers,
});

// ---- Server link ---------------------------------------------------------------
const conn = new WsClient('tv', {
  onOpen() { $('conn').textContent = ''; $('conn').classList.remove('bad'); },
  onClose() { $('conn').textContent = 'server connection lost - retrying…'; $('conn').classList.add('bad'); },
  onMessage(m) {
    if (m.t === 'lobby') onLobby(m);
    else if (m.t === 'inputs') inputs.ingest(m.i);
    else if (m.t === 'startReq') tryStart(false, m.slot);
  },
});

function onLobby(m) {
  const wasPhase = snap && snap.phase;
  snap = m;
  inputs.setConnected(m.players.filter((p) => p.occupied && p.connected).map((p) => p.slot));
  lobbyUI.setLobby(m);
  if (m.phase !== wasPhase) showPhase(m.phase);
}

// ---- QR / IP --------------------------------------------------------------------
const ipParam = new URLSearchParams(location.search).get('ip'); // e.g. ?ip=192.168.1.23
fetch('/api/info').then((r) => r.json()).then((i) => {
  info = i;
  if (ipParam) info.ips = [{ ip: ipParam, name: '?ip=', score: 999 }, ...info.ips.filter((a) => a.ip !== ipParam)];
  showQR();
}).catch(() => { $('url').textContent = 'could not read /api/info'; });
function showQR() {
  if (!info || !info.ips.length) {
    $('url').textContent = 'No Wi-Fi address found';
    $('ipnote').textContent = 'Find it in Settings > Wi-Fi > (i), then open this page as localhost:' + (info ? info.port : 3000) + '/?ip=THAT.ADDRESS';
    return;
  }
  const a = info.ips[ipIndex % info.ips.length];
  const note = info.ips.length > 1 ? `${a.name} (${ipIndex % info.ips.length + 1}/${info.ips.length}) - press I if phones can't connect` : '';
  lobbyUI.setQR(`http://${a.ip}:${info.port}/controller.html`, note);
}

// ---- Phase handling ----------------------------------------------------------------
function showPhase(phase) {
  const racing = phase === 'racing';
  $('lobby').classList.toggle('hidden', racing);
  $('hud').classList.toggle('hidden', !racing);
  $('toLobby').classList.toggle('hidden', !racing);
  backdrop.setPaused(racing);
  if (racing) {
    if (!game) game = new Game({ canvas: $('game'), hudRoot: $('hud'), inputs, getLobby: () => snap });
    // Step 1 is single player: the host's phone (lowest joined slot) drives; the keyboard can always take over.
    const players = snap.players.filter((p) => p.occupied).map((p) => ({ slot: p.slot, label: `P${p.slot + 1}` }));
    game.start(players);
  } else if (game) game.stop();
}

// ---- Start / keys ---------------------------------------------------------------------
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2500);
}

function tryStart(force, fromSlot) {
  if (!snap || snap.phase !== 'lobby') return;
  const present = snap.players.filter((p) => p.occupied && p.connected);
  const waiting = present.filter((p) => !p.ready);
  if (!force && present.length === 0) { toast('Nobody has joined yet'); return; }
  if (!force && waiting.length) { toast(`Waiting for ${waiting.map((p) => 'P' + (p.slot + 1)).join(', ')} to ready up`); return; }
  conn.send({ t: 'phase', phase: 'racing' });
  if (fromSlot != null) toast(`P${fromSlot + 1} started the race`);
}

// Same actions from the keyboard (laptop) or on-screen buttons (iPad / touch screens).
const actions = {
  start: () => tryStart(false),
  force: () => tryStart(true),
  lobby: () => conn.send({ t: 'phase', phase: 'lobby' }),
  fs: toggleFullscreen,
  ip: () => { ipIndex++; showQR(); },
};
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'Enter') actions[e.shiftKey ? 'force' : 'start']();
  else if (e.key === 'Escape') actions.lobby();
  else if (e.key === 'f' || e.key === 'F') actions.fs();
  else if (e.key === 'i' || e.key === 'I') actions.ip();
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b) { e.preventDefault(); actions[b.dataset.act](); }
  keepAwake(); // needs a user gesture on some browsers
});

// Fullscreen: standard API, or webkit-prefixed on older iPadOS Safari.
function toggleFullscreen() {
  const d = document, el = d.documentElement;
  const fsEl = d.fullscreenElement || d.webkitFullscreenElement;
  try {
    if (fsEl) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) Promise.resolve(req.call(el)).catch(() => toast('Fullscreen blocked - use Share > Add to Home Screen'));
      else toast('No fullscreen here - use Share > Add to Home Screen');
    }
  } catch { toast('Fullscreen blocked - use Share > Add to Home Screen'); }
}

// Keep the host screen awake (localhost is a secure context, so this works on iPad Safari).
let wakeLock = null;
async function keepAwake() {
  if (wakeLock || !('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
keepAwake();

// ---- Frame loop --------------------------------------------------------------------------
function frame(now) {
  if (!snap || snap.phase === 'lobby') lobbyUI.frame(snap, inputs, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
