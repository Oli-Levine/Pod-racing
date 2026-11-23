# Hover Pod Racing

Couch multiplayer hover-pod racing for 1-4 players (player count is a config value).
The laptop runs the game fullscreen in a browser on the TV; phones are the controllers.
Everything runs on your home Wi-Fi - no internet or accounts needed once installed.

**Status: Step 0 of 5** - scaffold, server, QR code, lobby, phone controller, live throttle bars.
Handling, track, heat, collisions, multiplayer racing and skill extras come in later steps.

## How it works

- `net/server.js` (Node + `ws`) serves the files and relays phone input. It does **no** game logic.
- Physics and rendering will run in the TV browser page (Three.js, fixed 120 Hz timestep).
- Phones send input ~60 Hz with a sequence number; the TV uses the latest input per player.
- A phone stores a player id in `localStorage`, so a dropped phone rejoins the same slot.

## Setup

Requirements: Node 18+ (tested on 22), a laptop and phones on the **same Wi-Fi**.

```bash
git clone <this repo> && cd Pod-racing
npm install
```

## Run

```bash
npm start        # production build + serve (recommended for the TV)
npm run dev      # Vite dev server with hot reload, same single port
```

Then:

1. Open **http://localhost:3000/** on the laptop (press `F` for fullscreen, HDMI to the TV).
2. The terminal also prints the phone URL and a QR code, e.g. `http://192.168.1.23:3000/controller.html`.
3. On each phone scan the QR code on the TV, tap **TAP TO START**, hold the phone in landscape.
4. Tap **READY** on each phone. Start with **Enter** on the laptop, or **START** on player 1's phone.

Change the port with `PORT=4000 npm start`. If the wrong IP is detected, press `I` on the TV to cycle
addresses, or run `HOST_IP=192.168.1.23 npm start`.

### No phones handy? Fake ones

```bash
npm run sim -- 3        # 3 simulated phones join, ready up and wiggle their throttles
```

### TV keys

| Key | Action |
| --- | --- |
| `Enter` | start (when everyone is ready) |
| `Shift+Enter` | start anyway |
| `F` | fullscreen |
| `I` | cycle through detected IP addresses (changes the QR code) |
| `Esc` | back to lobby |

## Phone controller

Landscape only. Each half of the screen is an **analog throttle** for that engine: touch anywhere in the
half, then slide your thumb **up** for thrust (full at 90 px, **overdrive** band at 135 px) or **down** for
reverse (-40% at 55 px). The zero point is where your thumb first lands. If you touch very near the top
edge the zero point is nudged down so the full range stays reachable (so thrust starts slightly above zero).
Overdrive on **both** sides = boost (used from step 2). The centre button is **VENT** (step 2).
All distances live in `config.js` under `controller`.

Top bar: your colour/slot, connection status, ping, wake-lock indicator (☀), **ASSIST** toggle (beginner
assist, used from step 1), and in the lobby **READY / START / LEAVE**.

## Network notes (read this if phones can't connect)

- **Firewall:** allow Node.js through when your OS asks (Windows Defender: tick *Private networks*;
  macOS: *Allow* on the "incoming connections" prompt). Or allow TCP port 3000.
- **Router "client isolation" / "AP isolation" must be OFF**, otherwise phones can't see the laptop.
  Some guest Wi-Fi networks always isolate clients - use the main network.
- **Phones and laptop must be on the same network** (same Wi-Fi name; not mobile data, not a VPN).
- **Screen wake lock:** browsers only offer the real Wake Lock API on HTTPS. Over plain `http://` the phone
  uses a best-effort video fallback; if the screen still sleeps, raise the phone's *Screen timeout* while playing.
  (Android Chrome: `chrome://flags` -> "Insecure origins treated as secure" -> add the laptop URL also enables it.)
- **iPhone tilt steering (a later option) needs HTTPS.** Motion sensors are blocked on insecure origins on
  iOS. When we add it: install [mkcert](https://github.com/FiloSottile/mkcert), create a cert for the laptop's
  LAN IP, **install and trust the mkcert root CA on the iPhone** (AirDrop `rootCA.pem`, then
  Settings -> General -> About -> Certificate Trust Settings), serve the game over HTTPS and switch the
  WebSocket to `wss://` (the client already picks `wss` automatically on an https page).
- Haptics: Android Chrome only. iOS Safari has no vibration API; it fails silently.

## Project layout

```
config.js              every tunable value (commented)
net/server.js          HTTP + WebSocket relay, lobby/slot bookkeeping
net/lobby.js           slots, ready, reconnect, host
net/protocol.js        message reference
net/ip.js, static.js   LAN address detection, static file server
src/tv/                TV page: lobby UI, input store, split-screen layout, throttle bars
src/render/            Three.js (placeholder backdrop for now)
src/controller/        phone page: throttle pads, wake lock, connection
src/net/wsClient.js    reconnecting WebSocket client
scripts/sim-phones.js  fake phones for testing
```

## Roadmap

0. Scaffold, lobby, controller, live throttle bars  (**done**)
1. Core handling + hover + air control + test track + chase camera + laps + debug overlay + tuning panel
2. Heat, boost, vent, perfect vent, timed start
3. Wall collisions, out-of-bounds reset
4. Multiplayer racing: split screen, pod-to-pod collisions, positions
5. Skill extras: slide-charge, slipstream
