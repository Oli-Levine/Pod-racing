// WebSocket protocol (JSON text frames). One socket per page: /ws?role=tv|controller
//
// PHONE -> SERVER
//   {t:'hello', pid|null, assist}      join / rejoin. pid is the stored player id.
//   {t:'in', s, l, r, o, v, c, a}      ~60 Hz input. s=sequence, l/r=thrust -0.4..1,
//                                      o=overdrive bitmask (1=left,2=right),
//                                      v=vent held, c=vent press counter, a=assist on
//   {t:'ping', c, rtt}                 c=client clock echo, rtt=last measured round trip
//   {t:'ready', v}                     ready toggle (lobby)
//   {t:'leave'}                        give up slot (lobby only)
//   {t:'start'}                        host (lowest occupied slot) asks TV to start
//
// SERVER -> PHONE
//   {t:'welcome', pid, slot, color, rejoined}
//   {t:'rejected', reason}             'full' | 'race'
//   {t:'pong', c}
//   {t:'lobby', ...snapshot}           also sent to un-joined phones
//   {t:'fx', ...}                      relayed from TV (heat tint, haptics - later steps)
//
// TV -> SERVER
//   {t:'phase', phase}                 'lobby' | 'racing'
//   {t:'toPlayer', slot, msg}          relay msg to one phone
//   {t:'localJoin', key} / {t:'localLeave', key}   a controller on the TV takes / frees a slot
//
// SERVER -> TV
//   {t:'lobby', phase, max, host, players:[{slot,occupied,connected,ready,ping,assist,color,local}]}
//   {t:'inputs', i:[[slot,s,l,r,o,v,c,a], ...]}   latest input per player, 60 Hz batches
//   {t:'startReq', slot}

export const WS_PATH = '/ws';
export const PHASE = { LOBBY: 'lobby', RACING: 'racing' };
