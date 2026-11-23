// ============================================================================
//  config.js  -  every tunable value lives here.
//  Shared by the Node server, the TV page and the phone page.
//  Each build step adds its own section (handling, heat, collisions, ...).
//  Units: metres, seconds, kilograms, newtons, radians (angles noted in degrees
//  are converted where used). Speeds shown in the HUD are km/h.
//  Values marked [live] can be changed while driving with the tuning panel (Tab).
// ============================================================================

export const CONFIG = {
  // ---- Players -------------------------------------------------------------
  // Number of player slots. Nothing else in the code hard-codes 4.
  maxPlayers: 4,

  // Slot colours. Slots past the end of this list get a generated colour
  // (see playerColor()), so raising maxPlayers just works.
  playerColors: ['#ff5a47', '#38a6ff', '#c26bff', '#f2c94c'],

  // ---- Network -------------------------------------------------------------
  net: {
    port: 3000,                // override with PORT=xxxx npm start
    relayHz: 60,               // server -> TV input relay rate
    pingIntervalMs: 1000,      // phone ping cadence
    pongTimeoutMs: 3000,       // phone force-reconnects if no pong for this long
    lobbyFreeSlotAfterMs: 20000, // lobby only: free a disconnected slot after this
                               //   (during a race the slot is kept forever)
    maxMsgBytes: 2048,
  },

  // ---- Phone controller ----------------------------------------------------
  // Throttle model: touch a half of the screen, thrust is how far you slide
  // your thumb up/down from where it first landed (CSS pixels).
  controller: {
    inputHz: 60,
    fullThrustPx: 90,    // slide up this far from touch point = 100% thrust
    overdrivePx: 135,    // slide up this far = enters the OVERDRIVE band
    reversePx: 55,       // slide down this far = full reverse
    reverseMax: 0.4,     // full reverse = -40% thrust
    throttleCurve: 1.0,  // 1 = linear. >1 = finer control near zero.
    ventButtonPx: 96,    // centre vent button diameter
  },


  // ---- Physics core --------------------------------------------------------
  physics: {
    hz: 120,               // fixed physics rate. Handling never depends on frame rate.
    maxStepsPerFrame: 10,  // safety cap if a frame stalls
    gravity: 20,           // [live] m/s^2. Heavier than Earth (9.8) for snappy jumps.
  },

  // ---- Pod body ------------------------------------------------------------
  pod: {
    mass: 800,             // [live] kg
    thrust: 10500,         // [live] N per engine at 100%
    reverseThrust: 1.0,    // [live] multiplier on reverse input (-40% input * this)
    engineArm: 1.6,        // [live] m, engine distance from centre line (torque lever)
    engineSpool: 0.06,     // [live] s, engine response lag (time constant)
    yawInertia: 4800,      // [live] kg m^2. Higher = rotation builds and stops slower.
  },

  // ---- Handling (ground) -----------------------------------------------------
  handling: {
    yawDamping: 1.4,          // [live] 1/s, base rotational damping (any surface, any speed)
    gripYawDamping: 2.6,      // [live] 1/s, extra damping while GRIPPING at speed.
    slideYawFreedom: 0.6,     // [live] 0..1, how much of gripYawDamping a full slide removes
                              //   -> a controlled slide rotates faster than gripping.
    gripYawRefSpeed: 35,      // [live] m/s, speed where grip yaw damping reaches full strength
                              //   (grows with speed squared: ~free at pivot speeds, so spins are fast)
    lateralGrip: 34,          // [live] m/s^2, max sideways correction on grip 1.0 surface
    gripResponse: 9,          // [live] 1/s, how fast grip kills sideways velocity (below the limit)
    slideStart: 12,           // [live] deg slip angle where the pod breaks into a slide
    slideGrip: 0.62,          // [live] fraction of lateral grip left while sliding
    slipSpeedLoss: 0.6,       // [live] 1/s at fully sideways: speed bleed = this * |sin(slip)| * speed
    dragLinear: 0.06,         // [live] 1/s, hover/air friction
    dragAero: 0.0018,         // [live] 1/m, aero drag (accel = this * speed^2)
    thrustFalloffSpeed: 62,   // [live] m/s where engine efficiency has dropped to 50%
    thrustFalloffSharpness: 3.5,// [live] higher = efficiency holds longer then drops harder
                              //   -> top speed is where thrust*efficiency = drag (a curve, no cap)
  },

  // ---- Hover ---------------------------------------------------------------
  hover: {
    rideHeight: 1.0,       // [live] m above ground
    spring: 70,            // [live] 1/s^2, spring stiffness (as acceleration per metre)
    damping: 11,           // [live] 1/s, damper (relative to the ground's own vertical motion)
    range: 3.2,            // [live] m, hover force and grip fade out between rideHeight and this
    minClearance: 0.3,     // [live] m, hard floor (bottoming out)
    visualTiltFollow: 10,  // [live] 1/s, how fast the body tilts to match the ground
    leanPerG: 0.09,        // [live] rad of visual roll per g of sideways acceleration
    pitchPerG: 0.03,       // [live] rad of visual pitch per g of fore/aft acceleration
  },

  // ---- Airborne ------------------------------------------------------------
  air: {
    thrust: 0.35,           // [live] fraction of thrust available in the air
    yawAuthority: 0.8,      // [live] fraction of differential-thrust torque in the air (air control)
    yawDamping: 0.7,        // [live] 1/s, rotational damping in the air
    airborneAbove: 0.9,     // [live] m above ride height that counts as airborne
    landingTolerance: 10,   // [live] deg heading-vs-velocity misalignment that is free on landing
    landingSpeedLoss: 0.55, // [live] fraction of speed lost per radian beyond the tolerance
    landingMaxLoss: 0.45,   // [live] cap on landing speed loss
    landingWobble: 1.6,     // [live] yaw-rate kick (rad/s) per radian of misalignment
    hardLandingSpeed: 14,   // [live] m/s downward speed above which a landing costs extra
    hardLandingLoss: 0.012, // [live] fraction of speed lost per m/s above hardLandingSpeed
    cooling: 1.0,           // (step 2) cooling multiplier in the air
  },

  // ---- Beginner assist (per player, toggled on the phone / B key) ---------------
  // Off = raw handling. Assist is stable and forgiving but caps rotation and
  // prevents fast slides, so a skilled player with assist OFF is faster.
  assist: {
    yawStabilise: 7,       // [live] 1/s, how hard it pulls yaw rate to the steady value for your input
    maxYawRate: 1.2,       // [live] rad/s, assist never rotates faster than this
    slipCorrect: 2.2,      // [live] 1/s, rotates velocity toward the nose (keeps speed)
    slipCorrectKeep: 0.4,  // [live] fraction of removed sideways speed given back as forward speed
    turnScale: 0.85,       // [live] assist turns this fraction of the raw steady turn rate
  },

  // ---- Surfaces --------------------------------------------------------------
  // grip multiplies lateralGrip; drag is extra linear drag (1/s) while hovering.
  // Add mud/ice here later and reference them from the track data.
  surfaces: {
    rock: { grip: 1.0, drag: 0.0, color: '#b8693a', dust: '#c98a5a', label: 'packed rock' },
    sand: { grip: 0.6, drag: 0.45, color: '#ddb27a', dust: '#ecd0a0', label: 'loose sand' },
    salt: { grip: 0.28, drag: 0.0, color: '#efe6da', dust: '#ffffff', label: 'salt flat' },
  },

  // ---- Race / timing -----------------------------------------------------------
  race: {
    laps: 3,                 // used from step 4. Step 1 is free practice (unlimited laps).
  },

  // ---- Chase camera ----------------------------------------------------------------
  camera: {
    distance: 10.5,       // [live] m behind the pod
    height: 3.3,          // [live] m above the pod
    lookAhead: 8,         // [live] m ahead of the pod the camera aims at
    lookHeight: 1.2,      // [live] m above the pod the camera aims at
    followStiffness: 9,   // [live] 1/s, position lag (lower = more lag)
    yawStiffness: 6,      // [live] 1/s, how fast the camera swings round behind the nose
    velocityBlend: 0.25,  // [live] 0 = follow the nose, 1 = follow the travel direction
    fovBase: 70,          // [live] deg at standstill
    fovSpeed: 22,         // [live] extra deg at fovSpeedRef
    fovSpeedRef: 75,      // [live] m/s
    shakeStart: 45,       // [live] m/s where speed shake begins
    shakeAmount: 0.05,    // [live] m of shake at fovSpeedRef
    near: 0.2,
    far: 2500,
    ceilingMargin: 0.8,   // m kept below tunnel ceilings (camera clipping)
  },

  // ---- Effects -----------------------------------------------------------------
  fx: {
    dustRate: 90,          // [live] particles/s per pod at speed
    dustLife: 1.4,         // [live] s
    streakStart: 40,       // [live] m/s where speed streaks appear
  },

  // ---- Debug -------------------------------------------------------------------
  debug: {
    overlayOnStart: false, // show the debug overlay when a race starts (toggle: ` key)
  },

  // ---- Rendering -----------------------------------------------------------
  render: {
    // Max device pixel ratio by number of viewports (split screen needs less
    // to hold 60 fps). Index = player count, last entry used for higher counts.
    pixelRatioByViewports: [2, 2, 1.5, 1.25, 1.0],
    shadows: true,
    shadowMapSize: 2048,
  },
};

// Colour for slot i (golden-angle hues beyond the preset list).
export function playerColor(i) {
  const list = CONFIG.playerColors;
  if (i < list.length) return list[i];
  return `hsl(${Math.round((i * 137.508) % 360)} 80% 60%)`;
}
