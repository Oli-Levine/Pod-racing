import { WS_PATH } from '../../net/protocol.js';

// WebSocket with automatic reconnect. Same-origin /ws?role=...
export class WsClient {
  constructor(role, { onOpen, onMessage, onClose } = {}) {
    this.role = role;
    this.onOpen = onOpen; this.onMessage = onMessage; this.onClose = onClose;
    this.ws = null; this.retry = 0; this.closedByUs = false;
    this.connect();
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}${WS_PATH}?role=${this.role}`);
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; this.onOpen && this.onOpen(); };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      this.onMessage && this.onMessage(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return; // superseded
      this.onClose && this.onClose();
      const delay = Math.min(1000, 200 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {};
  }

  get open() { return this.ws && this.ws.readyState === 1; }

  send(obj) {
    if (!this.open) return false;
    this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
    return true;
  }

  // Drop a (possibly half-open) socket and reconnect right away.
  reset() {
    const ws = this.ws;
    if (!ws) return;
    this.ws = null;
    try { ws.close(); } catch {}
    this.onClose && this.onClose();
    this.connect();
  }
}
