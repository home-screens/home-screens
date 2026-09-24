import { isKnownTimezone, wallClockParts } from './timezone';

/**
 * A zone to offer, or fill in, while the household has none saved, and where
 * it came from, so the Location page can say what it set and why: `place` is
 * the saved town's own zone, `browser` is this browser's clock, used only when
 * the town's zone is not known.
 */
export interface ZoneSuggestion {
  timezone: string;
  source: 'place' | 'browser';
}

/**
 * The saved place's zone first: a parent setting up from a laptop in another
 * zone (travelling, a work machine on UTC) must still get home's clock. This
 * browser's zone is the fallback for a place with no known zone, since whoever
 * sets up is usually at home. Null when neither is a zone this runtime knows.
 */
export function suggestHouseholdZone(
  placeZone: string | null | undefined,
  browserZone: string | null | undefined,
): ZoneSuggestion | null {
  if (placeZone && isKnownTimezone(placeZone)) return { timezone: placeZone, source: 'place' };
  if (browserZone && isKnownTimezone(browserZone)) return { timezone: browserZone, source: 'browser' };
  return null;
}

/**
 * How far `zone`'s wall clock runs ahead of `reference`'s at `at`, in minutes:
 * negative when it is behind, 0 when the two read the same. The Location page
 * uses it to say how wrong the hub's clock is for home ("5 hours ahead of
 * Prior Lake") while no zone is saved. Read from each zone's own wall clock,
 * so DST and 45-minute offsets come out as they are on that day.
 */
export function zoneGapMinutes(zone: string, reference: string, at: Date = new Date()): number {
  return wallMinutes(at, zone) - wallMinutes(at, reference);
}

/** Minutes from the epoch to `at` as read on `zone`'s wall clock. */
function wallMinutes(at: Date, zone: string): number {
  const { isoDate, minuteOfDay } = wallClockParts(at, zone);
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 60_000 + minuteOfDay;
}
