# Hover Pod Racing

Couch multiplayer hover-pod racing for 1-4 players (player count is a config value).
The laptop runs the game fullscreen in a browser on the TV; phones are the controllers.
Everything runs on your home Wi-Fi - no internet or accounts needed once installed.

**Status: Step 3 of 5** - handling, test track, laps, tuning panel, heat / boost / vent / timed start, plus walls,
pillars and auto reset. Single player. Multiplayer racing (split screen, pod-to-pod hits) and skill extras come next.

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
| `Shift` | boost (both engines in overdrive) |
| `Space` | vent |
| `B` | toggle beginner assist for the keyboard pod |
| `R` | back to the start grid with a new timed-start countdown (restarts lap timing) |
| `T` | reset to the last checkpoint |
| `` ` `` | debug overlay (speed, slip, yaw rate, engines, surface, hover, input latency) |
| `1`-`9`, `0` | with the debug overlay open: teleport to a test section (cancels the current lap) |
| `Tab` | tuning panel (see below) |

The keyboard takes over the pod whenever you press a driving key, even with a phone connected.

### Xbox / gamepad

Connect the controller to the laptop (Bluetooth or USB), open the game, then **press any button once** -
browsers only reveal a controller after a button press. The TV shows "Controller connected".

| Control | Action |
| --- | --- |
| Left stick up / down | left engine forward / reverse (analog) |
| Right stick up / down | right engine forward / reverse (analog) |
| LT / RT | left / right engine forward (alternative to the sticks) |
| LB / RB | left / right engine reverse |
| Y | beginner assist on / off |
| Menu | start (from the lobby) / back to the start grid (in a race) |
| View | back to the last checkpoint |
| A | vent |
| X | boost (or L3 / R3 for overdrive per side) |

The pad takes over the pod whenever you touch it (priority: gamepad, then keyboard, then phone). It
rumbles on rough landings. Dead zone and response curve are in `config.js` under `gamepad`.

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
Overdrive on **both** sides = boost. The centre button is **VENT**; the whole screen tints green / yellow / red
with heat, and on Android the phone vibrates for vent, perfect vent and overheat.
All distances live in `config.js` under `controller`.

Top bar: your colour/slot, connection status, ping, wake-lock indicator (☀), **ASSIST** toggle (beginner
assist, used from step 1), and in the lobby **READY / START / LEAVE**.

## Heat, boost and vent

- **Heat (0-1)** rises with thrust. **Green** (below 0.5): normal. **Yellow** (0.5-1.0): more thrust and top speed,
  but heat rises 1.5x faster. **Red** (1.0): **overheat**, engines cut for 2 s, the pod coasts and smokes.
- **Boost:** push *both* throttles into the overdrive band. Big thrust and top speed, heat 5x faster - only a few seconds.
- **Cooling** is faster off-throttle and while airborne.
- **Vent** (centre button) dumps heat and gives a speed kick; cooldown 1.8 s, and it applies even to a wasted vent.
  In green it does almost nothing. In yellow it dumps 0.30 heat. A **perfect vent** (narrow band inside yellow, shown
  as a white box on the TV heat gauge) dumps 0.50 and kicks about 3x harder, with a flash. The HUD tells you
  "early" or "late" when you miss the band.
  On a phone, pressing vent means lifting a thumb, so you lose that engine for a moment. Keyboard / gamepad can't
  do that, so a vent there briefly cuts both engines instead (`heat.ventLocalCut` / `ventLocalTime`).
- **Timed start:** during the countdown (READY, 3, 2, 1, GO) the pod is held on the grid but you can rev. Hold heat
  inside the **blue band** on the gauge when it says GO for a launch boost. Revving into red floods the engine:
  you stall for 2 s on the line. Phones and gamepad sticks can hold a partial throttle; on the keyboard, tap the keys.
- Engine glow goes cool blue-white, amber, angry red, then sputters. `R` restarts the countdown.

All numbers are in `config.js` under `heat` (and `air.cooling`, `race.countdown`); the tuning panel has a `heat` tab.

## Walls, pillars and resets

- **Walls** are the rock faces at the track edge (`RUNOFF` in `src/track/testTrack.js` can add a sand verge).
  **Pillars** in the slalom are solid too. The camera is kept inside the walls. Pods have a collision radius (`wall.radius`, 2 m).
- A hit is split into the speed *into* the wall and the speed *along* it, both by **impact angle** (tables in
  `config.js` under `wall`: 0 deg = scrape, 90 deg = head-on):
  - glancing scrape (about 10 deg): loses ~3% of speed, no bounce, almost no heat
  - 45 deg: loses ~25% along the wall and bounces ~30% of the into-wall speed
  - head-on: loses ~55%, bounces back, and adds the most heat (`wall.heatPerImpact`)
  - nose-first hits spin the nose away from the wall
- **Scraping** along a wall adds drag, heat (`wall.scrapeHeat`) and throws sparks. A hard enough hit can push you
  into overheat. Heavy hits show "HEAVY HIT -x%".
- **Auto reset** to the last checkpoint (facing along the track, centre line) with a frozen **2 s penalty**
  (engines cut, the pod cools) when you:
  - leave the world / go well beyond the run-off ("OUT OF BOUNDS"), or
  - are **stuck**: trying to move (throttle or pushed against a wall) but staying within 4 m of the same spot for 3 s.
    Standing still with no throttle, spinning on the spot, stalls and the countdown do not count.
- The `T` key still resets to the last checkpoint without a penalty (test key).
- Phones buzz on wall hits (Android), the gamepad rumbles, the camera shakes. The tuning panel has a `wall` tab.

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
