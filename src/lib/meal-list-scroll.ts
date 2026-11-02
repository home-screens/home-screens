/**
 * Where the small Meal Planner's List view rests (its home on a touch wall,
 * where a finger can move it for a minute). A week longer than the module
 * starts at today; and a wall nobody touches never scrolls back up to see
 * whose rows those are, so the top line has to name its day.
 */

export interface MealListScroll {
  /** Scroll offset: always a day heading's, so no row is cut in half. */
  top: number;
  /** Blank room to add after the last day so the list can scroll that far. */
  spacer: number;
}

/**
 * Today's heading at the top. A list that ends too soon for that stops at
 * the last day heading it can reach, as long as all of today still shows
 * under it. When even that heading would push the end of today off the
 * bottom (today is the last day or two, in a short module), the next heading
 * leads instead and the list ends in a little blank room: a day heading on
 * top and all of today, at the cost of a gap after the week's last meal.
 *
 * `headingTops` are the day headings' distances from the top of the list's
 * content, in order and measured without any spacer; `today` spans today's
 * heading to its last meal.
 */
export function mealListScrollTop(
  headingTops: readonly number[],
  today: { top: number; bottom: number },
  viewHeight: number,
  contentHeight: number,
): MealListScroll {
  const maxScroll = contentHeight - viewHeight;
  if (maxScroll <= 0) return { top: 0, spacer: 0 };
  if (today.top <= maxScroll) return { top: today.top, spacer: 0 };
  let lastReachable: number | null = null;
  for (const top of headingTops) {
    if (top <= maxScroll) {
      lastReachable = top;
      continue;
    }
    // The first heading past the end of the scroll. Today's own heading is
    // one, so there always is such a heading by here.
    if (lastReachable !== null && today.bottom - lastReachable <= viewHeight) break;
    return { top, spacer: top - maxScroll };
  }
  return { top: lastReachable ?? 0, spacer: 0 };
}

/** The List view's slot label, in em of the module's type, and never under this many px. */
export const MEAL_LIST_LABEL_EM = 0.7;
export const MEAL_LIST_LABEL_MIN_PX = 11;
/**
 * A character of a mixed-case slot name at the label's size, in em of that
 * size: a little wider than a semibold Inter letter runs, so the longest name
 * ("Petit-déjeuner", "Tussendoortje") never wraps or cuts.
 */
const LABEL_CHAR_EM = 0.62;
/** What a row needs beside the label: a picture, a dish name worth reading and its serving time, in em of the module's type. */
const ROW_ROOM_EM = 18;

/**
 * How the List view marks which meal a row is, and the width of that column
 * so every name starts on one line: the slot's whole name ("Breakfast") when
 * the list has room for it beside a readable row, its short name ("B")
 * otherwise. A single letter alone is a poor mark for a child, so the whole
 * name is the first choice. `labels` are the names the week shows.
 */
export function mealListSlotColumn(
  listWidth: number,
  fontSize: number,
  labels: { full: readonly string[]; short: readonly string[] },
): { full: boolean; widthPx: number } {
  const labelPx = Math.max(MEAL_LIST_LABEL_EM * fontSize, MEAL_LIST_LABEL_MIN_PX);
  const widthOf = (names: readonly string[]) => Math.ceil(Math.max(1, ...names.map((n) => n.length)) * LABEL_CHAR_EM * labelPx);
  const fullPx = widthOf(labels.full);
  const full = listWidth > 0 && listWidth - fullPx >= ROW_ROOM_EM * fontSize;
  return { full, widthPx: full ? fullPx : Math.max(widthOf(labels.short), Math.ceil(1.4 * labelPx)) };
}
