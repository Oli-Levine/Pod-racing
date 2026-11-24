# Hover Pod Racing

Couch multiplayer hover-pod racing for 1-4 players (player count is a config value).
The laptop runs the game fullscreen in a browser on the TV. **Xbox controllers are the main way to play**
(plug them into the laptop); phones still work as controllers but their UI is parked (see "Phone controller").
No internet or accounts needed once installed.

**Status: steps 0-5 built, then reworked:** the heat / vent / overheat / timed-start system was removed and boost now
runs on a simple meter. Built: handling, test track, laps, tuning panel, boost meter, walls and resets,
multiplayer racing for 1-4 players (split screen, pod-to-pod collisions, positions, results), and the skill extras
(slide-charge, slipstream).

## How it works

- `net/server.js` (Node + `ws`) serves the files and relays phone input (only needed for phones). It does **no** game logic.
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

1. Connect the Xbox controller(s) to the laptop, open **http://localhost:3000/** (press `F` for fullscreen, HDMI to the TV).
2. Press **A** on each controller to join (controllers are always ready). Press **Menu** to start.
3. Phones (optional): the terminal and the lobby show a QR code / URL such as `http://192.168.1.23:3000/controller.html`.
   Scan it, tap **TAP TO START**, hold the phone in landscape, tap **READY**.

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
| `Shift` | boost |
| `Space` | drift (hold) |
| `B` | toggle beginner assist for the keyboard pod |
| `R` | back to the start grid with a new countdown (restarts lap timing) |
| `T` | reset to the last checkpoint |
| `` ` `` | debug overlay (speed, slip, yaw rate, engines, surface, hover, input latency) |
| `1`-`9`, `0` | with the debug overlay open: teleport to a test section (cancels the current lap) |
| `Tab` | tuning panel (see below) |

The keyboard takes over the pod whenever you press a driving key, even with a phone connected.

### Xbox / gamepad

Connect the controller to the laptop (Bluetooth or USB), open the game, then **press any button once** -
browsers only reveal a controller after a button press. The TV shows "Controller connected".

**Each controller is its own player:** in the lobby press **A** to take a slot (it is always ready), **B** to leave,
**Menu** to start. On the results screen **Menu** races again and **B** goes back to the lobby.
Several controllers work too, and phones can still join the same race.

Default layout (`gamepad.scheme: 'steer'`) - the sticks never accelerate:

| Control | Action |
| --- | --- |
| RT | throttle (analog) |
| LT | brake / reverse (analog) |
| Left stick left / right | steer |
| LB or RB (hold) | **drift** |
| A or X (hold) | boost |
| Y | beginner assist on / off |
| View | back to the last checkpoint (2 s penalty when racing others) |
| Menu | join + start (lobby) / race again (results screen, or any time when racing solo) |
| A / B (lobby) | join as a player / leave |
| B (results screen) | back to the lobby |

Steering is mixed into the two engines: steering right takes thrust off the right engine (and pushes it into
reverse at full lock when you're not on the throttle - a pivot), so the pod still handles like a twin-engine pod
under the hood. `gamepad.steerCurve` / `steerStrength` set how sharp the stick is.

Alternative: `gamepad.scheme: 'tank'` in `config.js` = LT / RT drive the left / right engine, LB / RB put that
engine in reverse, **B** (hold) drifts, A / X boost.

A joined controller drives its own pod. When racing solo, a controller that hasn't joined can also take over
the pod. It rumbles on rough landings, wall hits, bumps, drift entry, slide payouts and when the boost meter runs dry. Dead zone and response curve are in `config.js` under `gamepad`.

### Tuning panel (`Tab`)

Every handling, drift, boost, hover, air, assist, surface, camera and effect value from `config.js`, changed live while
you drive. `,` `.` switch section, `[` `]` pick a value, `-` `=` change it (hold Shift for big steps,
Alt for fine), `0` resets it, `C` copies all current values (changed ones listed at the top) so you can
paste them into `config.js` - or paste them to me. Changes are not saved until they're in `config.js`;
reloading the page goes back to the file.

Each key also has an on-screen button for touch screens.

## Phone controller (parked)

Phones still connect and drive, but the phone UI has not been updated for the boost rework: its **VENT** button
now does nothing and its background tint stays green. Only the TV and the Xbox controller are being developed.

Landscape only. Each half of the screen is an **analog throttle** for that engine: touch anywhere in the
half, then slide your thumb **up** for thrust (full at 90 px, **overdrive** band at 135 px) or **down** for
reverse (-40% at 55 px). The zero point is where your thumb first lands. Overdrive on **both** sides = boost.
Top bar: your colour/slot, connection status, ping, wake-lock indicator, **ASSIST** toggle, and in the lobby
**READY / START / LEAVE**. All distances live in `config.js` under `controller`.

## Boost

- **Boost (A or X on the pad, Shift on the keyboard):** with the engines pushing forward (on average at least
  `boost.minThrottle`), hold boost for
  +45% thrust and +20% top speed. It drains the **BOOST meter** (bottom left of the HUD): about 4 s from full.
- **Refill:** off boost the meter refills after a 0.5 s delay, about 10 s from empty.
- **Empty:** boost locks (red meter, "BOOST EMPTY") until the meter has refilled to 20%.
- Every race starts with a full meter. The engine glow turns amber while boosting.
- There is no heat, venting, overheating or timed start any more: the countdown just holds the pods on the grid.
  Wall scrapes and pod-to-pod hits cost speed and spin, not heat.

All numbers are in `config.js` under `boost` (and `race.countdown`); the tuning panel has a `boost` tab.

## Multiplayer racing

- Every joined player (phone or controller) gets a pod on the grid (4 abreast, staggered rows).
- **Split screen:** 1 player = full screen, 2 = top / bottom, 3-4 = quad (with 3, the spare quarter shows a live
  track map with race positions). Render resolution drops with more viewports
  (`render.pixelRatioByViewports`); `render.splitShadows: false` turns shadows off in split screen if it's slow.
  The player count comes from `maxPlayers`; more than 4 uses a bigger grid.
- **Races** are `race.laps` laps (default 3), timed from GO. Positions are live (HUD shows POS and LAP x/3).
  Finish order, then distance covered for anyone still racing. When everyone has finished - or
  `race.finishTimeout` (30 s) after the winner - the **results** screen shows positions, race times and best laps.
  **Enter**, **Menu** on a controller, or **RACE AGAIN** on the host phone restarts; **Esc** goes to the lobby.
- **Solo** (one player) stays endless practice with lap times (`race.practiceWhenSolo`).
- **Pod-to-pod hits:** each pod is two circles (engines + cockpit). Hits exchange momentum by mass and relative
  speed; a hit away from the centre (e.g. on the cockpit) spins the pod. Shown as "RAMMED!" /
  "HIT!", with shake, phone buzz and rumble. Tuning panel tab: `bump`.
- A phone that drops mid-race leaves its pod coasting with "PHONE DISCONNECTED"; it rejoins the same pod.

## Drift

Hold **LB or RB** (Space on the keyboard) at speed and the pod **floats up a little and lets go of the ground**:

- Sideways grip almost disappears and sliding barely costs speed, so the pod **glides** on its momentum.
- The travel direction swings round toward the nose on its own, keeping your speed. How hard it can pull you round
  is capped (`drift.glideAccel`, a bit less than normal grip), so a drift takes a slightly wider line but keeps
  much more speed than forcing a gripping turn.
- You steer the **nose angle** with the stick. Hold it steady and the slide settles at an angle; the thrust, pointing
  where the nose points, pulls you toward the inside. Too much rotation and you spin out (over-rotate).
- **Release** and the pod re-grips over about 0.3 s.
- Drifting feeds the **slide-charge**: while drifting the angle band goes up to 50 degrees and the engines only need to
  average 50%. Hold a clean drift, then straighten out for the SLIDE BOOST kick.
- You'll see a **DRIFT** tag, the pod banks into the slide, the camera swings out to show it, and the pad gives a small
  bump when the drift starts. Below 10 m/s nothing happens. In the air the drift is held, so you can land into one.
- Assist still lets you drift (it stops correcting your slide while the button is held).

All values are in `config.js` under `drift`; the tuning panel has a `drift` tab. The big feel knobs:
`grip` (lower = floatier), `align` (higher = smaller drift angle), `glideAccel` (how tight a drift can turn),
`slipLoss` (how much speed sliding costs), `lift`.

## Skill extras

- **Slide-charge:** keep a slip angle inside the **9-27 degree band** (`slide.bandLow` / `bandHigh`; up to 50 degrees
  while drifting) at 25+ m/s with **both engines thrusting** (at least 50%; while drifting, 50% on average) and a charge builds (about 0.8 s to full). The **SLIDE bar** on the HUD fills;
  it glows while you're in the band. **Straighten out** (slip below 5 degrees) and it pays out as a speed kick, up to
  +14 m/s at full charge ("SLIDE BOOST +x%"). Slip past the band
  (over-rotated) and the charge **drains fast** ("OVER-ROTATED"): a sloppy slide gives nothing. Lifting off the
  throttle or leaving the ground fades it. Salt and sand patches make slides easier to start; assist stops most slides,
  so it can't earn much.
- **Slipstream:** follow within 40 m of another pod, near its line, and your **drag drops (up to 70%)**.
  (`slipstream.*`) It builds over 0.7 s and fades over 1 s. You'll see a **SLIPSTREAM** tag, a wider
  field of view, extra speed lines, and a hazy **wake** behind the pod in front. Nothing changes for the leader and
  nobody is rubber-banded: it's natural catch-up, and the slingshot passes work because drag stays low as you pull out.
- Tuning panel tabs: `slide` and `slipstream`. Debug overlay (`` ` ``) shows slide state, charge and slipstream strength.

## Walls, pillars and resets

- **Walls** are the rock faces at the track edge (`RUNOFF` in `src/track/testTrack.js` can add a sand verge).
  **Pillars** in the slalom are solid too. The camera is kept inside the walls. Pods have a collision radius (`wall.radius`, 2 m).
- A hit is split into the speed *into* the wall and the speed *along* it, both by **impact angle** (tables in
  `config.js` under `wall`: 0 deg = scrape, 90 deg = head-on):
  - glancing scrape (about 10 deg): loses ~3% of speed, no bounce
  - 45 deg: loses ~25% along the wall and bounces ~30% of the into-wall speed
  - head-on: loses ~55%, bounces back
  - nose-first hits spin the nose away from the wall
- **Scraping** along a wall adds drag and throws sparks. Heavy hits show "HEAVY HIT -x%".
- **Auto reset** to the last checkpoint (facing along the track, centre line) with a frozen **2 s penalty**
  (engines cut) when you:
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
2. Heat, boost, vent, perfect vent, timed start  (**done**, then heat / vent / timed start removed; boost is now a meter)
3. Wall collisions, out-of-bounds reset  (**done**)
4. Multiplayer racing: split screen, pod-to-pod collisions, positions  (**done**)
5. Skill extras: slide-charge, slipstream  (**done**)
6. Xbox-first controls (triggers + stick steer), drift  (**done**)
