// ============================================================================
//  Test track data. A testing ground, not a real track: one closed loop that
//  contains a sample of every feature real tracks will need.
//
//  Positions along the track are given as CONTROL POINT INDEX (fractional ok),
//  e.g. 12.5 = halfway between control points 12 and 13. Lateral offsets (d)
//  are metres from the centre line, + = right when driving the right way.
// ============================================================================

// [x, z, elevation y, width, bank degrees (tilts INTO the turn automatically)]
export const CONTROL_POINTS = [
  [0, -300, 0, 30, 0],     // 0  main straight (start grid)
  [0, -150, 0, 30, 0],     // 1  (start/finish line is at 1.35, on the dead-straight part)
  [0, 50, 0, 30, 0],       // 2  main straight (slipstream / top speed)
  [0, 230, 0, 28, 0],      // 3  braking zone
  [-8, 285, 0, 20, 0],     // 4  TIGHT HAIRPIN
  [-35, 305, 0, 18, 0],    // 5
  [-62, 290, 0, 18, 0],    // 6
  [-70, 255, 0, 20, 0],    // 7
  [-75, 200, 0, 20, 0],    // 8  FAST CHICANE
  [-100, 165, 0, 20, 0],   // 9
  [-95, 120, 0, 20, 0],    // 10
  [-120, 80, 1, 20, 0],    // 11
  [-180, 60, 8, 22, 0],    // 12 CLIMB + small bumps
  [-240, 60, 17, 22, 0],   // 13
  [-295, 70, 24, 22, 0],   // 14 BLIND CREST
  [-345, 95, 14, 22, 0],   // 15 DOWNHILL RUN
  [-390, 130, 2, 22, 0],   // 16 ramp
  [-430, 175, 0, 22, 0],   // 17 GAP JUMP
  [-460, 230, 0, 24, 0],   // 18 landing
  [-460, 300, 0, 24, 20],  // 19 BANKED TURN
  [-425, 360, 0, 24, 22],  // 20
  [-360, 395, 0, 24, 12],  // 21
  [-260, 420, 0, 26, 4],   // 22 LONG FAST SWEEPER (salt flat + sand outside)
  [-140, 435, 0, 26, 4],   // 23
  [-20, 435, 0, 26, 4],    // 24
  [100, 420, 0, 26, 4],    // 25
  [200, 380, 0, 26, 4],    // 26
  [260, 300, 0, 24, 0],    // 27 SPLIT: safe wide line goes right, shortcut is the branch
  [345, 215, 0, 24, 0],    // 28
  [360, 110, 0, 24, 0],    // 29
  [290, 25, 0, 22, 0],     // 30 rejoin
  [250, -40, 0, 12, 0],    // 31 NARROW CANYON
  [215, -110, 0, 11, 0],   // 32
  [160, -170, 0, 22, 0],   // 33 PILLAR SLALOM
  [100, -215, 0, 22, 0],   // 34
  [65, -280, 0, 20, 0],    // 35 TUNNEL / overhang
  [55, -370, 0, 22, 0],    // 36
  [20, -420, 0, 24, 0],    // 37
  [-12, -390, 0, 26, 0],   // 38 back onto the main straight
];

export const START_LINE = 1.35;    // control point index of the start/finish line
export const RUNOFF = 0;           // m of sand run-off beyond each track edge before the walls (0 = walls at the edge)

// Risky narrow shortcut: a separate path from CP 27 to CP 30.
export const SHORTCUT = {
  from: 27, to: 30, width: 9,
  points: [[272, 200], [280, 110]], // x, z between the junctions (elevation follows the main track)
  bumps: { from: 0.15, to: 0.45, amp: 0.4, wavelength: 7 },   // fractions of the shortcut length
  sand: { from: 0.5, to: 0.75 },
};

// Height features on the main path.
export const FEATURES = {
  bumps: [{ from: 12.3, to: 13.6, amp: 0.45, wavelength: 11 }],
  // Ramp jump over a gap: kicker rises `rise` m, then a pit `depth` m deep, then an exit slope.
  jump: { rampStart: 16.5, gapStart: 16.85, gapEnd: 17.25, exitEnd: 17.6, rise: 1.8, depth: 7 },
  tunnel: { from: 35.05, to: 35.5, ceiling: 7.5 },
};

// Surface patches: from/to = control point index, dMin/dMax = lateral metres.
// Track surface defaults to packed rock, run-off defaults to sand.
export const SURFACE_PATCHES = [
  { from: 22.6, to: 24.4, dMin: -7, dMax: 7, surface: 'salt' },     // salt flat mid-sweeper
  { from: 22.0, to: 26.0, dMin: -13, dMax: -8, surface: 'sand' },   // outside of the sweeper
  { from: 9.4, to: 10.4, dMin: 4, dMax: 10, surface: 'sand' },      // chicane corner-cut trap
  { from: 16.85, to: 17.25, dMin: -40, dMax: 40, surface: 'sand' }, // pit under the jump
];

// Rock pillars for the slalom: [control point index, lateral offset m, radius m]
export const PILLARS = [
  [33.15, -4, 1.6], [33.35, 5, 1.6], [33.55, -5, 1.6], [33.75, 4.5, 1.6], [33.95, -4.5, 1.6], [34.2, 4, 1.6], [34.45, -3.5, 1.6],
];

// Invisible checkpoints in order (control point index). The first is the finish line.
// None sit inside the split, so both routes count.
export const CHECKPOINTS = [START_LINE, 3.6, 8, 11.5, 15, 18.5, 21.5, 24.5, 31, 34, 37];
// Sector ends, as indices into CHECKPOINTS (last sector always ends at the finish).
export const SECTOR_ENDS = [4, 7];

// Teleport spots for testing (debug overlay open, press the key). [key, name, control point index]
export const TEST_SPOTS = [
  ['1', 'main straight', 1.0], ['2', 'hairpin', 3.4], ['3', 'chicane', 7.6], ['4', 'climb + bumps', 11.6],
  ['5', 'blind crest', 13.6], ['6', 'downhill + jump', 15.2], ['7', 'banked turn', 18.4], ['8', 'sweeper (salt/sand)', 21.8],
  ['9', 'split route', 26.3], ['0', 'canyon, slalom, tunnel', 30.4],
];
