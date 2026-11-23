// Node server: serves the game files and relays phone input over WebSocket.
// All physics / rendering happens in the TV browser page, never here.
//
//   npm run dev     -> Vite dev middleware (hot reload) + WebSocket, one port
//   npm start       -> production build + static serve + WebSocket, one port

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { CONFIG } from '../config.js';
import { Lobby } from './lobby.js';
import { lanAddresses } from './ip.js';
import { staticHandler } from './static.js';
import { WS_PATH, PHASE } from './protocol.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROD = process.argv.includes('--prod');
const PORT = Number(process.env.PORT) || CONFIG.net.port;
const NET = CONFIG.net;

const lobby = new Lobby(CONFIG.maxPlayers, NET.lobbyFreeSlotAfterMs);
const tvs = new Set();
const phones = new Set(); // all controller sockets, joined or not
const addrs = lanAddresses();

// ---- HTTP -------------------------------------------------------------------
let fallback; // vite middleware (dev) or static handler (prod)
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ port: PORT, ips: addrs, maxPlayers: CONFIG.maxPlayers }));
    return;
  }
  if (url.pathname === '/controller') { res.writeHead(302, { Location: '/controller.html' }).end(); return; }
  fallback(req, res);
});

// ---- WebSocket --------------------------------------------------------------
const wss = new WebSocketServer({ noServer: true, maxPayload: NET.maxMsgBytes });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== WS_PATH) { if (PROD) socket.destroy(); return; } // dev: vite HMR handles its own
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.role = url.searchParams.get('role') === 'tv' ? 'tv' : 'controller';
    wss.emit('connection', ws, req);
  });
});

const send = (ws, obj) => { if (ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
const toTVs = (obj) => { const s = JSON.stringify(obj); for (const ws of tvs) send(ws, s); };

// Lobby snapshots: structural changes go out immediately, ping-only changes at 4 Hz.
let bcTimer = null, bcUrgent = false;
function scheduleLobby(urgent) {
  bcUrgent = bcUrgent || urgent;
  if (bcTimer && !urgent) return;
  if (bcTimer) clearTimeout(bcTimer);
  bcTimer = setTimeout(() => {
    bcTimer = null; bcUrgent = false;
    const s = JSON.stringify(lobby.snapshot());
    for (const ws of tvs) send(ws, s);
    for (const ws of phones) send(ws, s);
  }, urgent ? 0 : 250);
}

wss.on('connection', (ws) => {
  ws.slot = -1; ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  if (ws.role === 'tv') {
    tvs.add(ws);
    send(ws, lobby.snapshot());
  } else {
    phones.add(ws);
    send(ws, lobby.snapshot());
  }

  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    ws.role === 'tv' ? onTV(ws, m) : onPhone(ws, m);
  });

  ws.on('close', () => {
    tvs.delete(ws); phones.delete(ws);
    if (ws.role === 'tv' && lobby.dropLocals(ws)) scheduleLobby(true);
    if (ws.slot >= 0 && lobby.slots[ws.slot].ws === ws) {
      lobby.disconnect(ws.slot);
      console.log(`  P${ws.slot + 1} disconnected`);
      scheduleLobby(true);
    }
  });
  ws.on('error', () => {});
});

function onPhone(ws, m) {
  switch (m.t) {
    case 'hello': {
      const r = lobby.join(typeof m.pid === 'string' ? m.pid : null, ws, m.assist);
      if (r.error) { send(ws, { t: 'rejected', reason: r.error }); return; }
      if (r.old) { r.old.slot = -1; r.old.close(4000, 'replaced'); }
      ws.slot = r.slot;
      send(ws, { t: 'welcome', pid: r.pid, slot: r.slot, color: lobby.snapshot().players[r.slot].color, rejoined: r.rejoined });
      console.log(`  P${r.slot + 1} ${r.rejoined ? 'rejoined' : 'joined'}`);
      scheduleLobby(true);
      break;
    }
    case 'ping':
      send(ws, { t: 'pong', c: m.c });
      if (ws.slot >= 0 && Number.isFinite(m.rtt)) { lobby.slots[ws.slot].ping = m.rtt; scheduleLobby(false); }
      break;
    case 'in': {
      if (ws.slot < 0) return;
      const s = lobby.slots[ws.slot];
      if (!(m.s > s.seq)) return; // stale / duplicate
      s.seq = m.s;
      s.input = [ws.slot, m.s, m.l, m.r, m.o, m.v, m.c, m.a];
      s.inputDirty = true;
      if (!!m.a !== s.assist) { s.assist = !!m.a; scheduleLobby(false); }
      break;
    }
    case 'ready':
      if (ws.slot >= 0 && lobby.phase === PHASE.LOBBY) { lobby.slots[ws.slot].ready = !!m.v; scheduleLobby(true); }
      break;
    case 'leave':
      if (ws.slot >= 0 && lobby.phase === PHASE.LOBBY) {
        console.log(`  P${ws.slot + 1} left`);
        lobby.leave(ws.slot); ws.slot = -1; scheduleLobby(true);
      }
      break;
    case 'start': // host phone: start from the lobby, or "race again" on the results screen (TV decides)
      if (ws.slot >= 0 && ws.slot === lobby.hostSlot()) toTVs({ t: 'startReq', slot: ws.slot });
      break;
  }
}

function onTV(ws, m) {
  switch (m.t) {
    case 'phase':
      if (m.phase === PHASE.LOBBY || m.phase === PHASE.RACING) { lobby.setPhase(m.phase); console.log(`  phase -> ${m.phase}`); scheduleLobby(true); }
      break;
    case 'localJoin': {
      const r = lobby.joinLocal(String(m.key), ws);
      if (r.error) send(ws, { t: 'localRejected', key: m.key, reason: r.error });
      else { console.log(`  P${r.slot + 1} joined (local ${m.key})`); scheduleLobby(true); }
      break;
    }
    case 'localLeave':
      if (lobby.leaveLocal(String(m.key))) scheduleLobby(true);
      break;
    case 'toPlayer': {
      const s = lobby.slots[m.slot];
      if (s && s.ws) send(s.ws, m.msg);
      break;
    }
  }
}

// Input relay: latest input per player, batched at relayHz.
setInterval(() => {
  const rows = [];
  for (const s of lobby.slots) if (s.inputDirty) { rows.push(s.input); s.inputDirty = false; }
  if (rows.length) toTVs({ t: 'inputs', i: rows });
}, 1000 / NET.relayHz);

// Housekeeping: dead-socket detection (half-open Wi-Fi) + lobby slot expiry.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
  if (lobby.sweep(Date.now())) scheduleLobby(true);
}, 2000);

// ---- Boot -------------------------------------------------------------------
if (PROD) {
  fallback = staticHandler(path.join(ROOT, 'dist'));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: ROOT, appType: 'mpa', clearScreen: false,
    server: { middlewareMode: true, hmr: { server } },
  });
  fallback = vite.middlewares;
}

server.listen(PORT, '0.0.0.0', async () => {
  const best = addrs[0]?.ip;
  const phoneUrl = best ? `http://${best}:${PORT}/controller.html` : null;
  console.log('\n  HOVER POD RACING  (' + (PROD ? 'production' : 'dev') + ')\n');
  console.log(`  TV (open on this laptop):  http://localhost:${PORT}/`);
  if (phoneUrl) {
    console.log(`  Phones:                    ${phoneUrl}`);
    if (addrs.length > 1) console.log('  Other addresses:           ' + addrs.slice(1).map((a) => `${a.ip} (${a.name})`).join(', '));
    console.log(await QRCode.toString(phoneUrl, { type: 'terminal', small: true }));
  } else {
    console.log('  No LAN address found - connect to Wi-Fi, or set HOST_IP=...');
  }
});
