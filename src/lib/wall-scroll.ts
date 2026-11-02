/**
 * Rules for a list a finger can scroll on a touch wall (`WallScroller`).
 *
 * At rest a list sits where the view puts it ("home": today, now, the top of
 * the recipe book), exactly as a wall nobody touches always has. A finger
 * moves it; a minute after the last touch it glides back home on its own, so
 * the kitchen wall is never left showing next Thursday.
 */

/** A list left scrolled away goes home this long after the last touch. */
export const WALL_SCROLL_IDLE_MS = 60_000;

/** The scroll bar shows while the list moves and fades this long after it stops. */
export const WALL_SCROLL_THUMB_FADE_MS = 1_200;

/**
 * How long after a list stops moving its card gets its frosted glass back.
 * The glass is dropped while the list moves: a Pi 4 re-blurs the whole card
 * behind every scrolled frame, which took scrolling an agenda from a steady
 * 60 frames a second to frames of 130 to 220 ms; without the blur the slowest
 * frames are 20 to 70 ms.
 */
export const WALL_SCROLL_GLASS_REST_MS = 300;

/** The shortest bar drawn, in pixels, so a very long list still shows one. */
const MIN_THUMB_PX = 24;

/** Where the scroll bar sits and how long it is, or null when nothing overflows. */
export function wallScrollThumb(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  minPx = MIN_THUMB_PX,
): { top: number; height: number } | null {
  const range = scrollHeight - clientHeight;
  if (clientHeight <= 0 || range <= 1) return null;
  const height = Math.max(Math.min(minPx, clientHeight), (clientHeight * clientHeight) / scrollHeight);
  const travel = clientHeight - height;
  const ratio = Math.min(1, Math.max(0, scrollTop / range));
  return { top: ratio * travel, height };
}

/**
 * Far enough from home that the "Back to today" button is worth showing: a
 * quarter of the box, and never less than 48 pixels, so the momentum of a
 * small nudge does not flash it.
 */
export function isAwayFromHome(scrollTop: number, homeTop: number, clientHeight: number): boolean {
  return Math.abs(scrollTop - homeTop) > Math.max(48, clientHeight * 0.25);
}

/** Close enough to the end to ask for more (the next page of recipes). */
export function isNearEnd(scrollTop: number, scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight - (scrollTop + clientHeight) < clientHeight * 0.6;
}
