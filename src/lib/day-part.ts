/**
 * Which part of the day an hour falls in. One rule for the greeting, the
 * affirmations, the Text module's greeting word and the time-of-day
 * backgrounds, so "evening" starts at the same hour everywhere.
 */
export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

/** Morning from 5, afternoon from 12, evening from 17, night from 21. */
export function dayPartFor(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}
