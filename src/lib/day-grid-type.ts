/**
 * The type size of a full-screen calendar's day grids (Month, Rolling weeks),
 * in px: the size a cell's lines are drawn off (event names at 0.55 of it,
 * day numbers at 0.85, the weekday row at 0.7).
 *
 * Sized from the screen's short side alone, as the other views are, a Month
 * grid on a 1080-wide wall drew event names at about 7 px in cells that were
 * mostly empty. So it starts from the cell: a sixth of its width, or of its
 * height when the cell is the shorter way round (a landscape month). The
 * module's text size still moves it, by the square root of its step, because
 * the cell, not the screen, is what runs out: a name has to fit across a
 * seventh of the wall. It never passes a quarter of the cell's width or a
 * fifth of its height, so 4X Large still leaves room for the day and a few
 * names, and it never drops below the size the text setting alone gave.
 */

/** A sixth of the cell's width at Medium: event names about 15 px in a 154 px portrait cell. */
const WIDTH_SHARE = 6;
/** The same off the height, for a cell wider than it is tall. */
const HEIGHT_SHARE = 6.5;
/** Never more than a quarter of the width: a name still shows a word or two. */
const MAX_WIDTH_SHARE = 4;
/** Never more than a fifth of the height: the day, its badge and a few names. */
const MAX_HEIGHT_SHARE = 5;

export interface DayGridCell {
  /** One day cell's width and height, px. */
  width: number;
  height: number;
  /** The module's text size times its density (1 at Medium and snug). */
  textScale: number;
  /** What the text setting alone gives: the screen's short side / 100 times `textScale`. */
  settingFont: number;
}

export function dayGridFontSize({ width, height, textScale, settingFont }: DayGridCell): number {
  if (!(width > 0) || !(height > 0)) return settingFont;
  const fromCell = Math.min(width / WIDTH_SHARE, height / HEIGHT_SHARE) * Math.sqrt(Math.max(textScale, 0));
  const ceiling = Math.min(width / MAX_WIDTH_SHARE, height / MAX_HEIGHT_SHARE);
  return Math.max(settingFont, Math.min(fromCell, ceiling));
}
