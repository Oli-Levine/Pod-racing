# Hover Pod Racing

Couch multiplayer hover-pod racing for 1-4 players (player count is a config value).
The laptop runs the game fullscreen in a browser on the TV; phones are the controllers.
Everything runs on your home Wi-Fi - no internet or accounts needed once installed.

**Status: Step 1 of 5** - core handling, hover, air control, test track, chase camera, laps and timing,
debug overlay and live tuning panel. Single player. Heat, collisions, multiplayer racing and skill extras come next.

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
| `Shift+Enter` | start anyway (no phone needed: you get the keyboard test pod) |
| `F` | fullscreen |
| `I` | cycle through detected IP addresses (changes the QR code) |
| `Esc` | back to lobby |

### Driving / testing keys (during a race)

| Key | Action |
| --- | --- |
| `W` / `S` | left engine forward / reverse (keyboard test pod) |
| `Up` / `Down` | right engine forward / reverse |
| `B` | toggle beginner assist for the keyboard pod |
| `R` | reset to the start grid (restarts lap timing) |
| `T` | reset to the last checkpoint |
| `` ` `` | debug overlay (speed, slip, yaw rate, engines, surface, hover, input latency) |
| `1`-`9`, `0` | with the debug overlay open: teleport to a test section (cancels the current lap) |
| `Tab` | tuning panel (see below) |

The keyboard takes over the pod whenever you press a driving key, even with a phone connected.

### Tuning panel (`Tab`)

Every handling, hover, air, assist, surface, camera and effect value from `config.js`, changed live while
you drive. `,` `.` switch section, `[` `]` pick a value, `-` `=` change it (hold Shift for big steps,
Alt for fine), `0` resets it, `C` copies all current values (changed ones listed at the top) so you can
paste them into `config.js` - or paste them to me. Changes are not saved until they're in `config.js`;
reloading the page goes back to the file.

Each key also has an on-screen button for touch screens.

## Phone controller

Landscape only. Each half of the screen is an **analog throttle** for that engine: touch anywhere in the
half, then slide your thumb **up** for thrust (full at 90 px, **overdrive** band at 135 px) or **down** for
reverse (-40% at 55 px). The zero point is where your thumb first lands. If you touch very near the top
edge the zero point is nudged down so the full range stays reachable (so thrust starts slightly above zero).
Overdrive on **both** sides = boost (used from step 2). The centre button is **VENT** (step 2).
All distances live in `config.js` under `controller`.

Top bar: your colour/slot, connection status, ping, wake-lock indicator (☀), **ASSIST** toggle (beginner
assist, used from step 1), and in the lobby **READY / START / LEAVE**.

## Updating between steps

`git pull`, then stop the server (Ctrl+C) and run `npm start` again (or `npm install && npm start` if
`package.json` changed). Reload the TV page and the phones. No reboot needed.
With `npm run dev` most code and `config.js` changes reload the page automatically.

## Handling model (short version)

The pod has mass, a velocity and a heading that are separate. Each engine pushes at its own side, so a
thrust difference is a torque; rotation has inertia and carries on until you counter-thrust. Grip removes
sideways velocity up to a limit; past `handling.slideStart` the pod slides, keeps less grip, rotates more
freely and bleeds speed in proportion to how sideways it is. Thrust efficiency falls off with speed, so top
speed is where thrust meets drag. Hover is a spring-damper that follows the ground (ramps launch you,
crests make you light). In the air: no grip, gravity, reduced thrust, differential thrust still rotates you.
Landing crooked costs speed and wobbles. Assist stabilises rotation and partly corrects slip, but caps how
fast you can rotate - so raw handling has the higher ceiling.

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
src/game/game.js       fixed 120 Hz physics loop + interpolated rendering, viewports, resets
src/physics/           pod.js (state), handling.js (thrust/yaw/grip/assist), hover.js (ride height,
                       air, landings, body tilt), world.js (one physics step)
src/track/             testTrack.js (track DATA), track.js (geometry + ground queries), surfaces.js
src/race/laps.js       checkpoints, laps, sector splits
src/render/            pod mesh, track mesh, environment, chase camera, dust/streaks, lobby backdrop
src/ui/                HUD, debug overlay, tuning panel
src/input/keyboard.js  keyboard test pod
src/controller/        phone page: throttle pads, wake lock, connection
src/net/wsClient.js    reconnecting WebSocket client
scripts/sim-phones.js  fake phones for testing
```

## Roadmap

0. Scaffold, lobby, controller, live throttle bars  (**done**)
1. Core handling + hover + air control + test track + chase camera + laps + debug overlay + tuning panel  (**done**)
2. Heat, boost, vent, perfect vent, timed start
3. Wall collisions, out-of-bounds reset
4. Multiplayer racing: split screen, pod-to-pod collisions, positions
5. Skill extras: slide-charge, slipstream
