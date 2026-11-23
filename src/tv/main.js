import './tv.css';
import { CONFIG, playerColor } from '../../config.js';
import { WsClient } from '../net/wsClient.js';
import { createBackdrop } from '../render/backdrop.js';
import { InputStore } from './inputStore.js';
import { createLobbyUI } from './lobbyUI.js';
import { createThrottleBars } from './throttleBars.js';
import { splitLayout } from './layout.js';

const $ = (id) => document.getElementById(id);
const inputs = new InputStore();
let snap = null;        // latest lobby snapshot from the server
let info = null;        // /api/info
let ipIndex = 0;
let raceCells = [];

createBackdrop($('bg'));
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
  if (m.phase === 'racing') updateRaceCells();
}

// ---- QR / IP --------------------------------------------------------------------
fetch('/api/info').then((r) => r.json()).then((i) => { info = i; showQR(); }).catch(() => { $('url').textContent = 'could not read /api/info'; });
function showQR() {
  if (!info || !info.ips.length) { $('url').textContent = 'No LAN address found - join Wi-Fi'; return; }
  const a = info.ips[ipIndex % info.ips.length];
  const note = info.ips.length > 1 ? `${a.name} (${ipIndex % info.ips.length + 1}/${info.ips.length}) - press I if phones can't connect` : '';
  lobbyUI.setQR(`http://${a.ip}:${info.port}/controller.html`, note);
}

// ---- Phase handling ----------------------------------------------------------------
// Step 0 'race' is a placeholder: one panel per player with live throttle bars,
// laid out with the real split-screen layout that step 4 will use.
function showPhase(phase) {
  const racing = phase === 'racing';
  $('lobby').classList.toggle('hidden', racing);
  $('race').classList.toggle('hidden', !racing);
}

function updateRaceCells() {
  const active = snap.players.filter((p) => p.occupied);
  const rects = splitLayout(Math.max(active.length, 1));
  const root = $('race');
  root.innerHTML = ''; raceCells = [];
  active.forEach((p, i) => {
    const r = rects[i];
    const cell = document.createElement('div');
    cell.className = 'cell';
    Object.assign(cell.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
    cell.style.setProperty('--pc', playerColor(p.slot));
    cell.innerHTML = `<div class="cin"><h2>P${p.slot + 1}</h2><div class="rs"></div><p>Step 0 placeholder - the track arrives in step 1.<br>Move your thumbs: bars below are your live throttles.</p></div>`;
    const bars = createThrottleBars();
    cell.querySelector('.cin').appendChild(bars.el);
    root.appendChild(cell);
    raceCells.push({ slot: p.slot, cell, bars, rs: cell.querySelector('.rs') });
  });
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

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'Enter') tryStart(e.shiftKey);
  else if (e.key === 'Escape') conn.send({ t: 'phase', phase: 'lobby' });
  else if (e.key === 'f' || e.key === 'F') {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
  } else if (e.key === 'i' || e.key === 'I') { ipIndex++; showQR(); }
});

// ---- Frame loop --------------------------------------------------------------------------
function frame(now) {
  lobbyUI.frame(snap, inputs, now);
  if (snap && snap.phase === 'racing') {
    for (const c of raceCells) {
      const p = snap.players[c.slot];
      c.bars.update(inputs.get(c.slot), p.connected, now);
      c.rs.textContent = p.connected ? `ping ${p.ping} ms` : 'phone disconnected - waiting for it to rejoin…';
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
