# Hover Pod Racing

Couch multiplayer hover-pod racing for 1-4 players (player count is a config value).
The laptop runs the game fullscreen in a browser on the TV; phones are the controllers.
Everything runs on your home Wi-Fi - no internet or accounts needed once installed.

**Status: Step 0 of 5** - scaffold, server, QR code, lobby, phone controller, live throttle bars.
Handling, track, heat, collisions, multiplayer racing and skill extras come in later steps.

## How it works

- `net/server.js` (Node + `ws`) serves the files and relays phone input. It does **no** game logic.
  `host/pod_host.py` does the same job with plain Python, for hosting on an iPad.
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

Each key also has an on-screen button for touch screens.

## Hosting on an iPad (no laptop)

An iPad can't run Node.js, so there is a second, no-install host: `host/pod_host.py`. It uses only the
Python standard library and serves the prebuilt game in `host/www/`. It speaks the same protocol as
the Node server. The game itself still runs in Safari on the iPad. (`host/www` is rebuilt and
committed at every step, so you never need to build anything on the iPad.)

**1. Get the files onto the iPad.** In Safari open the GitHub repo -> **Code -> Download ZIP**
(sign in first if the repo is private). In the **Files** app tap the ZIP to unzip it.

**2. Start the host. Pick one terminal app (both are free on the App Store):**

*a-Shell* (native, fastest). iPadOS pauses apps that leave the screen, so a-Shell must **stay visible**.
Use Split View (Safari + a-Shell side by side), or, with Stage Manager and an external display, put
Safari on the TV and leave a-Shell on the iPad screen.
```
pickFolder                 # choose the unzipped Pod-racing folder
cd host
python3 pod_host.py
```

*iSH* (emulated Linux, slower). It can keep running in the background, so Safari can go full screen.
```
apk add python3
mount -t ios . /mnt        # choose the unzipped Pod-racing folder
cd /mnt/host
cat /dev/location > /dev/null &    # keeps iSH alive in the background (allow location access "Always")
python3 pod_host.py
```

If iOS asks to allow **Local Network** access for the app, tap Allow.

**3. Open the game.** In Safari go to **http://localhost:3000/**. For a true full-screen view use
**Share -> Add to Home Screen** and launch it from the icon. The on-screen buttons (Start, Fullscreen,
Switch IP, Lobby) replace the keyboard keys.

**4. Settings.** Set **Settings -> Display & Brightness -> Auto-Lock -> Never** while playing. Phones join
from the QR code as usual.

**TV output from the iPad:** a USB-C or Lightning **HDMI adapter** is best. It mirrors the screen, which
gives black bars because the iPad isn't 16:9. On iPads with Stage Manager the TV can be a separate,
full-width display. **Avoid AirPlay** for racing: it adds noticeable display delay.

**Wrong address in the QR code?** Look up the iPad's address in **Settings -> Wi-Fi -> (i)**. Then either
open `http://localhost:3000/?ip=THAT.ADDRESS` or start the host with `HOST_IP=THAT.ADDRESS python3 pod_host.py`.

**Updating:** download the ZIP again after each step.

**Later steps** add a tuning panel and a keyboard test pod. For those, a Bluetooth or Magic Keyboard on
the iPad gives you the full set of keys. Touch alternatives will be added where practical.

Developers: after changing code or `config.js`, run `npm run build:host` and commit `host/www`.
`config.js` network/player values are copied to `host/www/host-config.json`, so both hosts stay in sync.

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
host/pod_host.py       no-install Python host (iPad); serves host/www (prebuilt game)
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
