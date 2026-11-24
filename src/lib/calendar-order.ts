/**
 * The household's own priority order for calendars.
 *
 * A day on the wall is a fixed number of rows. Which events survive that cap
 * is decided by whatever order they are in, and chronological order makes that
 * decision at random as far as the household is concerned: a bin collection at
 * 07:00 pushes a birthday off the bottom of the cell. Choosing by calendar
 * means the calendars that matter are the ones that stay, and the ones that
 * roll off are the ones nobody minds missing. The order only chooses: the
 * rows that stay are still drawn in time order (`keepMostWanted`).
 *
 * The order is a list of source ids, held separately from `calendarOverrides`
 * rather than as a field on it. That record is keyed by source id, and object
 * key order is not something to hang a visible, drag-to-change setting on.
 *
 * A calendar missing from the list sorts after every listed one, keeping its
 * place in time among the others. That is what makes the setting safe to leave
 * half-finished: dragging one calendar to the top is a complete instruction,
 * not the start of ranking all of them.
 */

/** Sorts after every ranked calendar, without overflowing on arithmetic. */
const UNRANKED = Number.MAX_SAFE_INTEGER;

/**
 * A rank lookup for one order list. Built once per render rather than indexing
 * the array per comparison, which would make sorting a busy month quadratic.
 */
export function calendarRanker(
  order: readonly string[] | undefined,
): (sourceId: string | undefined) => number {
  if (!order?.length) return () => UNRANKED;
  const ranks = new Map<string, number>();
  order.forEach((id, index) => {
    // First mention wins, so a duplicated id cannot demote its own calendar.
    if (!ranks.has(id)) ranks.set(id, index);
  });
  return (sourceId) => (sourceId === undefined ? UNRANKED : ranks.get(sourceId) ?? UNRANKED);
}

/**
 * The positions in `items`, most wanted first: anything `pinned` ahead (an
 * all-day event keeps its row before any timed one, whatever its calendar),
 * then the household's calendar order, then the order given. With no order
 * saved this is the order given, so every cut below is a plain "first n".
 */
export function wantedFirst<T>(
  items: readonly T[],
  rank: ((sourceId: string | undefined) => number) | undefined,
  sourceIdOf: (item: T) => string | undefined,
  pinned: (item: T) => boolean = () => false,
): number[] {
  const positions = items.map((_, index) => index);
  if (!rank) return positions;
  const keys = items.map((item) => ({ pinned: pinned(item), rank: rank(sourceIdOf(item)) }));
  return positions.sort((a, b) => {
    if (keys[a].pinned !== keys[b].pinned) return keys[a].pinned ? -1 : 1;
    if (keys[a].rank !== keys[b].rank) return keys[a].rank < keys[b].rank ? -1 : 1;
    return a - b;
  });
}

/**
 * The `count` most wanted of `items`, still in the order given.
 *
 * This is the whole of what the calendar order does to a day: it decides
 * which events keep a row when there is not room for all of them. The rows
 * that are kept still read in time order, so a day never runs 4 PM, 6 PM,
 * 1 PM because of which calendar each event is on.
 */
export function keepMostWanted<T>(items: readonly T[], count: number, wanted: readonly number[]): T[] {
  return wanted.slice(0, Math.max(0, count)).sort((a, b) => a - b).map((index) => items[index]);
}
