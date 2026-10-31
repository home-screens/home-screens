/**
 * Where the small Meal Planner's List view scrolls to. Nobody scrolls a wall,
 * so a week longer than the module starts at today; and nobody can scroll
 * back up to see whose rows those are, so the top line has to name its day.
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
