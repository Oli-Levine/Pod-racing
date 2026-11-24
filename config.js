// ============================================================================
//  config.js  -  every tunable value lives here.
//  Shared by the Node server, the TV page and the phone page.
//  Each build step adds its own section (handling, boost, collisions, ...).
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


  // ---- Gamepad (Xbox / any "standard" controller in the TV browser) -----------
  // Left stick up/down = left engine, right stick up/down = right engine.
  // Triggers also work: LT/RT = left/right engine forward, LB/RB = that engine in reverse.
  gamepad: {
    deadzone: 0.12,        // [live] stick centre dead zone
    triggerDeadzone: 0.05, // [live]
    curve: 1.0,            // [live] 1 = linear. >1 = finer control near zero.
    rumble: true,          // vibrate on rough landings, wall hits, bumps, slide payouts
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

  // ---- Walls, pillars, out-of-bounds ------------------------------------------------
  // Walls sit at the track edge (+ RUNOFF in the track data, currently 0). A hit is split into
  // the speed INTO the wall (bounces back) and the speed ALONG the wall (scrape loss).
  // Tables are indexed by impact angle: 0 deg = parallel scrape, 90 deg = head-on.
  wall: {
    radius: 2.0,             // [live] m, pod collision radius (against walls and pillars)
    angles:       [0,    10,   25,   45,   70,   90],    // impact angle, degrees (table x-axis)
    tangentLoss:  [0.00, 0.03, 0.10, 0.25, 0.40, 0.55],  // [live] fraction of speed ALONG the wall lost per hit
    bounce:       [0.00, 0.08, 0.18, 0.30, 0.40, 0.45],  // [live] fraction of the INTO-wall speed bounced back
    spin: 0.10,              // [live] rad/s of yaw kick per m/s into the wall when the nose hits first
    scrapeDrag: 0.35,        // [live] 1/s extra drag while touching a wall
    sparkRate: 70,           // [live] sparks per second at full scrape
    hitEventMin: 3,          // [live] m/s into-wall speed that counts as a hit (shake, haptic, popup)
    heavyHit: 18,            // [live] m/s into-wall speed shown as a HEAVY HIT
    // -- stuck / out of bounds -> auto reset to the last checkpoint --
    stuckDist: 4,            // [live] m: moving less than this from one spot counts as stuck
    stuckTime: 3.0,          // [live] s stuck (trying to move, or touching a wall) before the reset
    resetPenalty: 2.0,       // [live] s frozen after any auto reset (engines cut)
    outMargin: 6,            // [live] m beyond the wall line that counts as out of bounds
  },

  // ---- Pod-to-pod collisions ------------------------------------------------------
  // Each pod is two circles (engines in front, cockpit behind), so a hit off the centre
  // spins it. Impulses use mass (pod.mass) and yaw inertia (pod.yawInertia).
  bump: {
    frontOffset: 1.3,        // [live] m, engine circle centre ahead of the pod centre
    frontRadius: 2.3,        // [live] m
    rearOffset: -3.0,        // [live] m, cockpit circle centre
    rearRadius: 1.2,         // [live] m
    restitution: 0.35,       // [live] bounciness of pod-pod hits (0 = dead, 1 = full bounce)
    spinScale: 1.0,          // [live] multiplier on the spin from off-centre hits
    hitEventMin: 3,          // [live] m/s impact that counts as a hit (shake, haptics)
  },

  // ---- Slide-charge (skill extra) ----------------------------------------------------
  // Hold a slip angle inside [bandLow, bandHigh] with BOTH engines thrusting: a charge builds.
  // Straighten out (slip below releaseSlip) and it pays out as a speed kick. Slipping too far
  // (over-rotated) drains the charge instead: a sloppy slide gives nothing.
  slide: {
    bandLow: 9,            // [live] deg of slip where charging starts
    bandHigh: 27,          // [live] deg where it counts as over-rotated
    minSpeed: 25,          // [live] m/s needed to charge
    minThrust: 0.5,        // [live] both engines must be at least this high
    chargeRate: 1.3,       // [live] charge per second inside the band (full charge = 1.0)
    overDrain: 2.5,        // [live] charge lost per second while over-rotated
    decay: 1.0,            // [live] charge lost per second while not sliding / lifting off
    releaseSlip: 5,        // [live] deg: straighten below this to cash in
    minCharge: 0.15,       // [live] below this the release pays nothing
    payoutKick: 14,        // [live] m/s speed kick at full charge (scales with charge)
    payoutTime: 0.3,       // [live] s the kick is spread over
  },

  // ---- Slipstream (skill extra) -------------------------------------------------------
  // Following close behind another pod lowers your drag. Natural
  // catch-up: nothing changes for the leader and nobody gets rubber-banding.
  slipstream: {
    range: 40,             // [live] m behind a pod where its wake helps you
    minRange: 3,           // [live] m: closer than this (touching) gives nothing extra
    width: 6.5,            // [live] m either side of the leader's line
    minSpeed: 22,          // [live] m/s the leader must be doing
    dragCut: 0.7,          // [live] fraction of linear+aero drag removed at full strength
    buildTime: 0.7,        // [live] s to reach full strength
    fadeTime: 1.0,         // [live] s to lose it after leaving the wake
    fovBoost: 4,           // [live] extra camera FOV (deg) while in a slipstream
  },

  // ---- Boost -----------------------------------------------------------------------
  // Hold boost (X on the gamepad, Shift on the keyboard) with both engines pushing: more thrust
  // and top speed while the meter drains. Off boost the meter refills after a short delay.
  // Empty = boost is locked until the meter has refilled to relockAt.
  boost: {
    drainRate: 0.25,         // [live] meter (0..1) lost per second while boosting (0.25 = 4 s from full)
    regenRate: 0.10,         // [live] meter regained per second off boost (0.10 = 10 s from empty)
    regenDelay: 0.5,         // [live] s after releasing boost before the meter starts refilling
    airRegenMult: 1.0,       // [live] refill multiplier while airborne
    relockAt: 0.20,          // [live] after running empty, boost stays locked until the meter reaches this
    startMeter: 1.0,         // [live] meter at the start line (0..1)
    minThrottle: 0.5,        // [live] both engines must be pushed at least this hard for boost to engage
    thrust: 1.45,            // [live] thrust multiplier while boosting
    topSpeed: 1.2,           // [live] top-speed multiplier while boosting
    ramp: 0.15,              // [live] s, boost fades in/out over this
  },

  // ---- Race / timing -----------------------------------------------------------
  race: {
    laps: 3,                 // laps per race (2+ players). 0 = endless practice for everyone.
    countdown: 4,            // [live] s of start countdown (READY, 3, 2, 1, GO). Pods are held on the grid. 0 = no countdown.
    practiceWhenSolo: true,  // one player = endless practice laps (no finish / results)
    finishTimeout: 30,       // [live] s after the winner finishes before results are shown anyway
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
    wallMargin: 0.8,      // m kept inside the canyon walls (camera clipping)
  },

  // ---- Effects -----------------------------------------------------------------
  fx: {
    dustRate: 90,          // [live] particles/s per pod at speed
    dustLife: 1.4,         // [live] s
    streakStart: 40,       // [live] m/s where speed streaks appear
    wakeRate: 10,          // [live] wake particles/s behind a fast pod (more when someone drafts in it)
    wakeAlpha: 0.07,       // [live] wake haze opacity (drafting adds to it)
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
    splitShadows: true,    // shadows in split screen (one shadow pass per viewport). Turn off if 3-4 players drop below 60 fps.
    shadowMapSize: 2048,
  },
};

// Colour for slot i (golden-angle hues beyond the preset list).
export function playerColor(i) {
  const list = CONFIG.playerColors;
  if (i < list.length) return list[i];
  return `hsl(${Math.round((i * 137.508) % 360)} 80% 60%)`;
}
