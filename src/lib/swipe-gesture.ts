/**
 * Pure classification for the display's flick-to-navigate gesture.
 *
 * A completed pointer gesture (down point → up point) is a horizontal flick
 * when it is fast, long enough, and horizontally dominant. Everything else —
 * taps, press-and-holds, slow drags, vertical scrolls — returns null.
 *
 * Coordinates are viewport px (clientX/Y). displayTransform is applied at the
 * compositor (wlr-randr), so pointer coordinates arrive already rotated into
 * the portrait/landscape frame — do NOT compensate for it here. Thresholds
 * are viewport px on purpose: they gate physical finger travel, independent
 * of the design-space scale factor.
 */

export interface SwipePoint {
  x: number;
  y: number;
  /** Event timeStamp in ms. */
  t: number;
}

export type SwipeDirection = 'left' | 'right';

/**
 * Minimum horizontal travel. 4× Chromium's ~15px touch slop, so a tap (which
 * stays inside the slop) and a flick can never be confused.
 */
export const SWIPE_MIN_DISTANCE_PX = 60;

/**
 * Maximum gesture duration. Combined with the distance floor this is an
 * implicit velocity minimum — a slow deliberate drag is not a flick.
 */
export const SWIPE_MAX_DURATION_MS = 500;

/**
 * Vertical travel may be at most this fraction of horizontal travel (2:1
 * horizontal dominance), rejecting diagonal scroll-ish gestures.
 */
export const SWIPE_MAX_CROSS_RATIO = 0.5;

export function classifySwipe(start: SwipePoint, end: SwipePoint): SwipeDirection | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (end.t - start.t > SWIPE_MAX_DURATION_MS) return null; // a drag, not a flick
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return null; // a tap or a hold
  if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_CROSS_RATIO) return null; // vertical-ish: scrolling
  return dx < 0 ? 'left' : 'right';
}
