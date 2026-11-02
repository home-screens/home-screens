/**
 * Which list views a finger may scroll on the wall, and where the views whose
 * resting place is not simply the top sit (`WallScroller`'s `home`).
 */

/**
 * A finger scrolls a module's list views only on a real display with taps
 * switched on for that module ("Tap an event to see details" on the
 * calendars, "Tap on the Wall" on the meal planners). The editor preview
 * renders without the module's screen and id, so it never scrolls and looks
 * exactly as it always has.
 */
export function wallScrollOn(tapsOn: boolean, screenId: string | undefined, moduleId: string | undefined): boolean {
  return tapsOn && !!screenId && !!moduleId;
}

/**
 * Where a list sits at rest when one row of it has to show (today's row in a
 * week that no longer fits its box): the top while that row shows from
 * there, otherwise that row at the top, or as near as the list's end allows.
 *
 * `top` and `bottom` are the row's edges against the top of the list's
 * content; `maxScroll` is how far the list scrolls at all.
 */
export function homeShowingRow(top: number, bottom: number, viewHeight: number, maxScroll: number): number {
  if (maxScroll <= 0 || bottom <= viewHeight) return 0;
  return Math.max(0, Math.min(top, maxScroll));
}
