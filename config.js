// ============================================================================
//  config.js  -  every tunable value lives here.
//  Shared by the Node server, the TV page and the phone page.
//  Each build step adds its own section (handling, heat, collisions, ...).
//  Step 0 only needs players / network / controller / render.
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

  // ---- Rendering -----------------------------------------------------------
  render: {
    // Max device pixel ratio by number of viewports (split screen needs less
    // to hold 60 fps). Index = player count, last entry used for higher counts.
    pixelRatioByViewports: [2, 2, 1.5, 1.25, 1.0],
  },
};

// Colour for slot i (golden-angle hues beyond the preset list).
export function playerColor(i) {
  const list = CONFIG.playerColors;
  if (i < list.length) return list[i];
  return `hsl(${Math.round((i * 137.508) % 360)} 80% 60%)`;
}
