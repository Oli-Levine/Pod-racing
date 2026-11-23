// Fake phones for testing without real ones:  npm run sim -- [count] [host:port]
// Joins as N players, readies up, and wiggles the throttles so you can see the TV react.
import WebSocket from 'ws';

const count = Number(process.argv[2]) || 2;
const host = process.argv[3] || 'localhost:3000';

for (let n = 0; n < count; n++) {
  let seq = 0, vc = 0, joined = false;
  const ws = new WebSocket(`ws://${host}/ws?role=controller`);
  const t0 = Date.now();
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', pid: null, assist: n % 2 === 1 })));
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'welcome') { joined = true; console.log(`sim P${m.slot + 1} joined`); setTimeout(() => ws.send(JSON.stringify({ t: 'ready', v: true })), 800 + n * 400); }
    if (m.t === 'pong') {}
  });
  setInterval(() => {
    if (!joined || ws.readyState !== 1) return;
    const t = (Date.now() - t0) / 1000 + n;
    const l = Math.sin(t * 1.3) * 0.7 + 0.3, r = Math.sin(t * 1.3 + 1.5) * 0.7 + 0.3;
    const cl = (x) => Math.max(-0.4, Math.min(1, x));
    if (Math.sin(t * 0.5) > 0.99) vc++;
    ws.send(JSON.stringify({ t: 'in', s: ++seq, l: cl(l), r: cl(r), o: (l > 1 ? 1 : 0) | (r > 1 ? 2 : 0), v: 0, c: vc, a: n % 2 }));
  }, 1000 / 60);
  setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ t: 'ping', c: performance.now(), rtt: 5 + n })), 1000);
}
