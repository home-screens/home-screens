/**
 * The walk a wall takes when burn-in protection is on.
 *
 * The whole display box is translated by a few CSS pixels and the offset
 * steps once a minute, the way OLED televisions shift their picture. The
 * positions form a 5 by 5 lattice at `PIXEL_SHIFT_PITCH_PX`, visited in snake
 * order so consecutive spots are one pitch apart (a step nobody notices
 * across a room) and every pixel of a static stroke spends its time spread
 * over 25 spots instead of one.
 *
 * The step is read off the minute of the epoch rather than counted, so a
 * reload or a remount lands on the same spot as every other display, and
 * the walk never restarts at centre and overweights it.
 */

export interface PixelShiftOffset {
  x: number;
  y: number;
}

/** Pixels between neighbouring spots. */
export const PIXEL_SHIFT_PITCH_PX = 3;

/** Spots per side of the lattice; the walk spans -(side-1)/2 to +(side-1)/2 pitches. */
const SIDE = 5;

function buildPositions(): readonly PixelShiftOffset[] {
  const half = (SIDE - 1) / 2;
  const positions: PixelShiftOffset[] = [];
  for (let row = 0; row < SIDE; row++) {
    const y = (row - half) * PIXEL_SHIFT_PITCH_PX;
    // Alternate the direction row by row, so the last spot of one row is
    // directly above the first spot of the next.
    for (let i = 0; i < SIDE; i++) {
      const col = row % 2 === 0 ? i : SIDE - 1 - i;
      positions.push({ x: (col - half) * PIXEL_SHIFT_PITCH_PX, y });
    }
  }
  return positions;
}

/** Every spot the wall visits, in walk order. */
export const PIXEL_SHIFT_POSITIONS: readonly PixelShiftOffset[] = buildPositions();

/** Where the wall sits during minute `minute` of the epoch (any integer; wraps). */
export function pixelShiftOffset(minute: number): PixelShiftOffset {
  const n = PIXEL_SHIFT_POSITIONS.length;
  const index = ((Math.floor(minute) % n) + n) % n;
  return PIXEL_SHIFT_POSITIONS[index];
}

/** The minute of the epoch at `nowMs`, the walk's clock. */
export function pixelShiftMinute(nowMs: number): number {
  return Math.floor(nowMs / 60_000);
}

/** How far from centre the walk reaches on either axis. */
export const PIXEL_SHIFT_REACH_PX = ((SIDE - 1) / 2) * PIXEL_SHIFT_PITCH_PX;

/**
 * The CSS transform for a wall sitting at `offset` in a `w` by `h` viewport.
 *
 * The box is also enlarged about its centre by just enough that it still
 * covers the viewport at the walk's reach, the overscan a television applies
 * for the same reason: a bare translate uncovers a hairline of the black
 * page wrapper at two edges, invisible on a dark photo and a black line on
 * a light wall (seen on the test Pi's linen empty state). The scale is about
 * one percent on a 1080-wide display. Before the viewport is measured the
 * box is only translated; the mount effect measures it on the first frame.
 */
export function pixelShiftTransform(offset: PixelShiftOffset, w: number, h: number): string {
  const translate = `translate(${offset.x}px, ${offset.y}px)`;
  const short = Math.min(w, h);
  if (!(short > 0)) return translate;
  const scale = 1 + (2 * PIXEL_SHIFT_REACH_PX) / short;
  return `${translate} scale(${scale})`;
}
