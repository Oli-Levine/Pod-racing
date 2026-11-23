#!/usr/bin/env python3
"""
Pod Racing host server - pure Python standard library, nothing to install.

Use this when the host can't run Node.js, e.g. an iPad (a-Shell, iSH, Pythonista).
It serves the prebuilt game from host/www/ and relays phone input over WebSocket,
speaking exactly the same protocol as net/server.js (see net/protocol.js).
Like the Node server it has NO game logic - physics runs in the TV browser page.

    python3 pod_host.py            # port from config (3000)
    python3 pod_host.py 4000       # other port
    HOST_IP=192.168.1.23 python3 pod_host.py   # force the address shown in the QR code
"""
import asyncio, base64, hashlib, json, mimetypes, os, socket, struct, sys, time, uuid
from urllib.parse import urlsplit, unquote

HERE = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(HERE, 'www')
try:
    with open(os.path.join(WWW, 'host-config.json')) as f:
        CFG = json.load(f)  # generated from config.js by `npm run build:host`
except FileNotFoundError:
    sys.exit('host/www is missing - run `npm run build:host` on a computer, or re-download the repo.')

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT') or CFG['port'])
NET = CFG['net']
WS_PATH = '/ws'
WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
MAX_MSG = NET['maxMsgBytes']


def player_color(i):
    cols = CFG['playerColors']
    return cols[i] if i < len(cols) else 'hsl(%d 80%% 60%%)' % round((i * 137.508) % 360)


# ---- LAN address ---------------------------------------------------------------
def lan_addresses():
    if os.environ.get('HOST_IP'):
        return [{'ip': os.environ['HOST_IP'], 'name': 'HOST_IP', 'score': 999}]
    found = []
    try:  # no packet is sent; this just asks the OS which interface routes to the LAN
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        found.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.append(info[4][0])
    except OSError:
        pass
    out, seen = [], set()
    for ip in found:
        if ip in seen or ip.startswith('127.') or ip.startswith('169.254.') or ip == '0.0.0.0':
            continue
        seen.add(ip)
        score = 30 if ip.startswith('192.168.') else 20 if ip.startswith('10.') else 10 if ip.startswith('172.') else 0
        out.append({'ip': ip, 'name': 'wifi', 'score': score})
    return sorted(out, key=lambda a: -a['score'])


ADDRS = lan_addresses()


# ---- Lobby (mirror of net/lobby.js) ------------------------------------------------
class Slot:
    def __init__(self, i):
        self.slot = i; self.pid = None; self.ws = None; self.connected = False; self.ready = False
        self.ping = 0; self.assist = False; self.seq = -1; self.input = None; self.dirty = False; self.gone_at = 0


class Lobby:
    def __init__(self, n):
        self.phase = 'lobby'
        self.slots = [Slot(i) for i in range(n)]

    def by_pid(self, pid):
        return next((s for s in self.slots if pid and s.pid == pid), None)

    def join(self, pid, ws, assist):
        s = self.by_pid(pid)
        rejoined = s is not None
        if not s:
            if self.phase != 'lobby':
                return {'error': 'race'}
            s = next((x for x in self.slots if not x.pid), None)
            if not s:
                return {'error': 'full'}
            s.pid = str(uuid.uuid4()); s.ready = False
        old = s.ws if s.ws is not None and s.ws is not ws else None
        s.ws = ws; s.connected = True; s.gone_at = 0; s.seq = -1; s.input = None; s.assist = bool(assist)
        return {'slot': s.slot, 'pid': s.pid, 'rejoined': rejoined, 'old': old}

    def disconnect(self, i):
        s = self.slots[i]
        s.ws = None; s.connected = False; s.gone_at = time.monotonic()
        if self.phase == 'lobby':
            s.ready = False

    def leave(self, i):
        self.slots[i] = Slot(i)

    def sweep(self):
        if self.phase != 'lobby':
            return False
        now, changed = time.monotonic(), False
        for s in self.slots:
            if s.pid and not s.connected and now - s.gone_at > NET['lobbyFreeSlotAfterMs'] / 1000:
                self.leave(s.slot); changed = True
        return changed

    def host_slot(self):
        return next((s.slot for s in self.slots if s.pid and s.connected), -1)

    def set_phase(self, phase):
        self.phase = phase
        if phase == 'lobby':
            for s in self.slots:
                s.ready = False

    def snapshot(self):
        return {'t': 'lobby', 'phase': self.phase, 'max': len(self.slots), 'host': self.host_slot(),
                'players': [{'slot': s.slot, 'occupied': bool(s.pid), 'connected': s.connected, 'ready': s.ready,
                             'ping': round(s.ping), 'assist': s.assist, 'color': player_color(s.slot)}
                            for s in self.slots]}


lobby = Lobby(CFG['maxPlayers'])
tvs, phones = set(), set()


# ---- WebSocket connection ------------------------------------------------------------
class WS:
    def __init__(self, reader, writer, role):
        self.r, self.w, self.role = reader, writer, role
        self.slot = -1; self.alive = True; self.open = True

    def _frame(self, op, payload):
        n = len(payload)
        head = bytes([0x80 | op])
        head += bytes([n]) if n < 126 else bytes([126]) + struct.pack('>H', n) if n < 65536 else bytes([127]) + struct.pack('>Q', n)
        return head + payload

    def send(self, obj):
        if not self.open:
            return
        if self.w.transport.get_write_buffer_size() > 512 * 1024:  # stalled client
            self.close(); return
        data = obj if isinstance(obj, str) else json.dumps(obj, separators=(',', ':'))
        self.w.write(self._frame(1, data.encode()))

    def ping(self):
        if self.open:
            self.w.write(self._frame(9, b''))

    def close(self, code=1000):
        if self.open:
            self.open = False
            try:
                self.w.write(self._frame(8, struct.pack('>H', code)))
                self.w.close()
            except Exception:
                pass

    async def frames(self):
        buf, buf_op = b'', 0
        while True:
            b1, b2 = await self.r.readexactly(2)
            fin, op, masked, n = b1 & 0x80, b1 & 0x0F, b2 & 0x80, b2 & 0x7F
            if n == 126:
                n = struct.unpack('>H', await self.r.readexactly(2))[0]
            elif n == 127:
                n = struct.unpack('>Q', await self.r.readexactly(8))[0]
            if n > MAX_MSG:
                return
            mask = await self.r.readexactly(4) if masked else b''
            data = await self.r.readexactly(n)
            if masked and n:
                m = (mask * (n // 4 + 1))[:n]
                data = (int.from_bytes(data, 'big') ^ int.from_bytes(m, 'big')).to_bytes(n, 'big')
            if op == 8:
                return
            if op == 9:
                self.w.write(self._frame(10, data)); continue
            if op == 10:
                self.alive = True; continue
            if op in (1, 2):
                buf, buf_op = data, op
            elif op == 0:
                buf += data
                if len(buf) > MAX_MSG:
                    return
            if fin and buf_op == 1:
                yield buf.decode('utf-8', 'replace')
                buf = b''


# ---- Lobby broadcast (structural changes now, ping-only changes at 4 Hz) --------------
_bc_handle = None


def schedule_lobby(urgent):
    global _bc_handle
    loop = asyncio.get_running_loop()
    if _bc_handle and not urgent:
        return
    if _bc_handle:
        _bc_handle.cancel()
    _bc_handle = loop.call_later(0 if urgent else 0.25, _broadcast_lobby)


def _broadcast_lobby():
    global _bc_handle
    _bc_handle = None
    s = json.dumps(lobby.snapshot(), separators=(',', ':'))
    for ws in list(tvs) + list(phones):
        ws.send(s)


def to_tvs(obj):
    s = json.dumps(obj, separators=(',', ':'))
    for ws in list(tvs):
        ws.send(s)


def on_phone(ws, m):
    t = m.get('t')
    if t == 'hello':
        pid = m.get('pid') if isinstance(m.get('pid'), str) else None
        r = lobby.join(pid, ws, m.get('assist'))
        if 'error' in r:
            ws.send({'t': 'rejected', 'reason': r['error']}); return
        if r['old']:
            r['old'].slot = -1; r['old'].close(4000)
        ws.slot = r['slot']
        ws.send({'t': 'welcome', 'pid': r['pid'], 'slot': r['slot'], 'color': player_color(r['slot']), 'rejoined': r['rejoined']})
        print('  P%d %s' % (r['slot'] + 1, 'rejoined' if r['rejoined'] else 'joined'), flush=True)
        schedule_lobby(True)
    elif t == 'ping':
        ws.send({'t': 'pong', 'c': m.get('c')})
        if ws.slot >= 0 and isinstance(m.get('rtt'), (int, float)):
            lobby.slots[ws.slot].ping = m['rtt']; schedule_lobby(False)
    elif t == 'in':
        if ws.slot < 0:
            return
        s = lobby.slots[ws.slot]
        seq = m.get('s')
        if not isinstance(seq, (int, float)) or seq <= s.seq:
            return
        s.seq = seq
        s.input = [ws.slot, seq, m.get('l'), m.get('r'), m.get('o'), m.get('v'), m.get('c'), m.get('a')]
        s.dirty = True
        if bool(m.get('a')) != s.assist:
            s.assist = bool(m.get('a')); schedule_lobby(False)
    elif t == 'ready':
        if ws.slot >= 0 and lobby.phase == 'lobby':
            lobby.slots[ws.slot].ready = bool(m.get('v')); schedule_lobby(True)
    elif t == 'leave':
        if ws.slot >= 0 and lobby.phase == 'lobby':
            print('  P%d left' % (ws.slot + 1), flush=True)
            lobby.leave(ws.slot); ws.slot = -1; schedule_lobby(True)
    elif t == 'start':
        if ws.slot >= 0 and ws.slot == lobby.host_slot() and lobby.phase == 'lobby':
            to_tvs({'t': 'startReq', 'slot': ws.slot})


def on_tv(ws, m):
    t = m.get('t')
    if t == 'phase' and m.get('phase') in ('lobby', 'racing'):
        lobby.set_phase(m['phase']); print('  phase -> ' + m['phase'], flush=True); schedule_lobby(True)
    elif t == 'toPlayer':
        i = m.get('slot')
        if isinstance(i, int) and 0 <= i < len(lobby.slots) and lobby.slots[i].ws:
            lobby.slots[i].ws.send(m.get('msg'))


async def ws_session(reader, writer, headers, query):
    key = headers.get('sec-websocket-key', '')
    accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
    writer.write(('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                  'Sec-WebSocket-Accept: %s\r\n\r\n' % accept).encode())
    sock = writer.get_extra_info('socket')
    if sock:
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)  # low latency input
    ws = WS(reader, writer, 'tv' if 'role=tv' in query else 'controller')
    (tvs if ws.role == 'tv' else phones).add(ws)
    ws.send(lobby.snapshot())
    try:
        async for text in ws.frames():
            try:
                m = json.loads(text)
            except ValueError:
                continue
            if isinstance(m, dict) and isinstance(m.get('t'), str):
                (on_tv if ws.role == 'tv' else on_phone)(ws, m)
    except (asyncio.IncompleteReadError, ConnectionError, OSError):
        pass
    finally:
        ws.close()
        tvs.discard(ws); phones.discard(ws)
        if ws.slot >= 0 and lobby.slots[ws.slot].ws is ws:
            lobby.disconnect(ws.slot)
            print('  P%d disconnected' % (ws.slot + 1), flush=True)
            schedule_lobby(True)


# ---- HTTP ------------------------------------------------------------------------------
def http_response(writer, status, body=b'', ctype='text/plain', extra=''):
    writer.write(('HTTP/1.1 %s\r\nContent-Type: %s\r\nContent-Length: %d\r\nConnection: close\r\n%s\r\n'
                  % (status, ctype, len(body), extra)).encode() + body)


async def handle(reader, writer):
    try:
        raw = await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'), 15)
    except Exception:
        writer.close(); return
    lines = raw.decode('latin-1').split('\r\n')
    try:
        method, target, _ = lines[0].split(' ', 2)
    except ValueError:
        writer.close(); return
    headers = {}
    for line in lines[1:]:
        if ':' in line:
            k, v = line.split(':', 1); headers[k.strip().lower()] = v.strip()
    u = urlsplit(target)
    path = unquote(u.path)

    if path == WS_PATH and headers.get('upgrade', '').lower() == 'websocket':
        await ws_session(reader, writer, headers, u.query); return

    if path == '/api/info':
        body = json.dumps({'port': PORT, 'ips': ADDRS, 'maxPlayers': CFG['maxPlayers']}).encode()
        http_response(writer, '200 OK', body, 'application/json', 'Cache-Control: no-store\r\n')
    elif path == '/controller':
        http_response(writer, '302 Found', extra='Location: /controller.html\r\n')
    else:
        if path.endswith('/'):
            path += 'index.html'
        file = os.path.realpath(os.path.join(WWW, path.lstrip('/')))
        if not file.startswith(os.path.realpath(WWW) + os.sep) or not os.path.isfile(file):
            http_response(writer, '404 Not Found', b'not found')
        else:
            with open(file, 'rb') as f:
                body = f.read()
            ctype = mimetypes.guess_type(file)[0] or 'application/octet-stream'
            if ctype.startswith('text/') or ctype.endswith('javascript'):
                ctype += '; charset=utf-8'
            cache = 'public, max-age=3600' if '/assets/' in path else 'no-cache'
            http_response(writer, '200 OK', b'' if method == 'HEAD' else body, ctype, 'Cache-Control: %s\r\n' % cache)
    try:
        await writer.drain()
    finally:
        writer.close()


# ---- Timers -----------------------------------------------------------------------------
async def relay_loop():
    period = 1 / NET['relayHz']
    while True:
        await asyncio.sleep(period)
        rows = []
        for s in lobby.slots:
            if s.dirty:
                rows.append(s.input); s.dirty = False
        if rows:
            to_tvs({'t': 'inputs', 'i': rows})


async def housekeeping():
    while True:
        await asyncio.sleep(2)
        for ws in list(tvs) + list(phones):
            if not ws.alive:
                ws.close(); continue
            ws.alive = False; ws.ping()
        if lobby.sweep():
            schedule_lobby(True)


async def main():
    mimetypes.add_type('text/javascript', '.js')
    mimetypes.add_type('text/css', '.css')
    server = await asyncio.start_server(handle, '0.0.0.0', PORT)
    print('\n  HOVER POD RACING  (Python host)\n')
    print('  TV (open in Safari on this device):  http://localhost:%d/' % PORT)
    if ADDRS:
        print('  Phones:                              http://%s:%d/controller.html' % (ADDRS[0]['ip'], PORT))
    else:
        print('  Could not detect the Wi-Fi address. Find it in Settings > Wi-Fi > (i),')
        print('  then restart with HOST_IP=that.address python3 pod_host.py')
    print('  Keep this running. Ctrl+C to stop.\n', flush=True)
    asyncio.create_task(relay_loop())
    asyncio.create_task(housekeeping())
    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
