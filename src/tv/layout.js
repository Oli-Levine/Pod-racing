// Split-screen layout. Returns viewport rects in 0..1 units (origin top-left).
//   1 player  -> full screen
//   2 players -> horizontal split (stacked top / bottom)
//   3-4       -> quad split (3 leaves one quadrant empty)
//   more      -> ceil(sqrt(n)) columns grid
export function splitLayout(n) {
  if (n <= 1) return [{ x: 0, y: 0, w: 1, h: 1 }];
  if (n === 2) return [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }];
  const cols = n <= 4 ? 2 : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => ({
    x: (i % cols) / cols, y: Math.floor(i / cols) / rows, w: 1 / cols, h: 1 / rows,
  }));
}
