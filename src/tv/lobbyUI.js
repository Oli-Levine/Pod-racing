import QRCode from 'qrcode';
import { createThrottleBars } from './throttleBars.js';

// Lobby screen: QR code + one card per slot. Structure rebuilt only when the
// lobby snapshot changes; throttle bars update every frame from the InputStore.
export function createLobbyUI({ slotsEl, qrCanvas, urlEl, ipNoteEl, maxPlayers }) {
  const cards = [];
  slotsEl.style.setProperty('--n', maxPlayers);
  for (let i = 0; i < maxPlayers; i++) {
    const card = document.createElement('div');
    card.className = 'card empty';
    card.innerHTML = `<div class="hd"><b>P${i + 1}</b><span class="st">open</span></div>
      <div class="meta"><span class="png"></span></div><div class="bars"></div><div class="hint">Press A on a controller to join (or scan the QR code with a phone)</div>`;
    const bars = createThrottleBars();
    card.querySelector('.bars').appendChild(bars.el);
    slotsEl.appendChild(card);
    cards.push({ card, bars, st: card.querySelector('.st'), png: card.querySelector('.png'), hint: card.querySelector('.hint') });
  }

  return {
    setQR(url, note) {
      urlEl.textContent = url.replace('http://', '');
      ipNoteEl.textContent = note || '';
      QRCode.toCanvas(qrCanvas, url, { width: 512, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1a0f08', light: '#fff4e0' } });
    },
    setLobby(lobby) {
      lobby.players.forEach((p, i) => {
        const c = cards[i];
        c.card.style.setProperty('--pc', p.color);
        c.card.className = 'card' + (!p.occupied ? ' empty' : '') + (p.occupied && !p.connected ? ' gone' : '') + (p.ready ? ' ready' : '');
        c.st.textContent = !p.occupied ? 'open' : p.local ? 'GAMEPAD - READY' : !p.connected ? 'reconnecting…' : p.ready ? 'READY' : 'not ready';
        c.hint.textContent = !p.occupied ? 'Press A on a controller to join (or scan the QR code with a phone)' : p.local ? 'Press B on the controller to leave' : p.slot === lobby.host ? 'Host: can start from phone' : '';
      });
    },
    // called every frame
    frame(lobbySnap, inputs, now) {
      if (!lobbySnap) return;
      lobbySnap.players.forEach((p, i) => {
        cards[i].bars.update(inputs.get(i), p.occupied && p.connected, now);
        cards[i].png.textContent = p.occupied && p.connected ? `${p.ping} ms` : '';
      });
    },
  };
}
