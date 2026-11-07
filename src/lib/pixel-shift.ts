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

// ── Wandering inside a box ───────────────────────────────────────────

/**
 * The widest an element wanders along its long axis, either side of its
 * centre: the photo clock across its band, the Display Control dock along
 * its pill. The measured room caps it further.
 */
export const WANDER_REACH_X_PX = 30;
/** The widest an element wanders across its short axis, either side of its centre. */
export const WANDER_REACH_Y_PX = 12;

/**
 * Where a wandering element's offset is measured from.
 *
 * `start`: the element was authored against its leading edge (the photo
 * clock, left-aligned in its band), so it only drifts away from that edge,
 * 0 to twice the reach, never into the padding behind it.
 *
 * `centre`: the element was authored centred (the dock pill), so it drifts
 * either way, minus the reach to plus the reach.
 *
 * Only the horizontal axis takes an anchor; the vertical one is always
 * centred, since neither element was authored against its top or bottom.
 */
export type WanderAnchor = 'start' | 'centre';

/**
 * A triangle wave of amplitude `reach` that moves one pixel per minute:
 * 0 up to +reach, down through 0 to -reach, back to 0, over 4 * reach
 * minutes. Zero everywhere for a reach of zero.
 */
function triangle(minute: number, reach: number): number {
  if (reach <= 0) return 0;
  const period = 4 * reach;
  const t = ((Math.floor(minute) % period) + period) % period;
  if (t < reach) return t;
  if (t < 3 * reach) return 2 * reach - t;
  return t - period;
}

/**
 * Where a static element with room to move sits during `minute` of the
 * epoch: a pair of triangle waves at one pixel per minute, the horizontal
 * one placed by `anchor` and the vertical one centred (-reachY to +reachY).
 * Unequal reaches give the two waves different periods, so the path sweeps
 * the rectangle over a few hours rather than one diagonal. A stroke 10 px
 * wide then lights any pixel about a sixth of the time instead of all of it.
 * Reaches are whole pixels; the caller floors what it measured.
 */
export function wanderOffset(
  minute: number,
  reachX: number,
  reachY: number,
  anchor: WanderAnchor = 'start',
): PixelShiftOffset {
  const dx = triangle(minute, reachX);
  return {
    x: anchor === 'start' && reachX > 0 ? reachX + dx : dx,
    y: triangle(minute, reachY),
  };
}
