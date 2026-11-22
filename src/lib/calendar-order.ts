import { compareEventStarts } from '@/lib/calendar-utils';

/**
 * The household's own priority order for calendars.
 *
 * A day on the wall is a fixed number of rows. Which events survive that cap
 * is decided by whatever order they are in, and chronological order makes that
 * decision at random as far as the household is concerned: a bin collection at
 * 07:00 pushes a birthday off the bottom of the cell. Ordering by calendar
 * first means the calendars that matter are the ones that stay, and the ones
 * that roll off are the ones nobody minds missing.
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
 * Compare two events by the household's calendar order, then by time.
 *
 * Time is always the tiebreak, so within one calendar a day still reads in the
 * order it happens. With no order saved every event is unranked and this is
 * exactly `compareEventStarts`, which is what keeps the setting optional.
 */
export function byCalendarThenTime<T extends { start: string; sourceId?: string }>(
  order: readonly string[] | undefined,
  timezone?: string,
): (a: T, b: T) => number {
  const rank = calendarRanker(order);
  return (a, b) => {
    const difference = rank(a.sourceId) - rank(b.sourceId);
    if (difference !== 0) return difference;
    return compareEventStarts(a.start, b.start, timezone);
  };
}
