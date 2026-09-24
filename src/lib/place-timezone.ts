import { createResolverCache, fetchWithTimeout } from './api-utils';
import { isKnownTimezone } from './timezone';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rounded to 0.01 degrees, about a kilometre: close enough that a town looked
 * up twice, or by name and then by GPS, shares one entry, and far finer than
 * any zone border that matters to a household.
 */
function placeKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/**
 * Open-Meteo's forecast API names the IANA zone of any coordinates with
 * `timezone=auto` and needs no key. Zone borders almost never move, so a
 * found zone is kept for a month; a place with no zone is retried after five
 * minutes, and an outage throws and is not remembered at all.
 */
const zones = createResolverCache<string>(30 * DAY_MS, 5 * 60_000, async (key) => {
  const [lat, lon] = key.split(',');
  const res = await fetchWithTimeout(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto`,
  );
  if (!res.ok) throw new Error(`Time zone lookup failed: ${res.status}`);
  const data = (await res.json()) as { timezone?: unknown };
  return typeof data.timezone === 'string' && isKnownTimezone(data.timezone) ? data.timezone : null;
});

/** Are these usable coordinates on the globe? */
export function isValidCoordinate(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/**
 * The IANA zone a place keeps its clocks in, or null when it cannot be told
 * right now. Never throws: every caller has a fallback, and a failed lookup
 * must not fail the town search it rides along with.
 */
export async function placeTimezone(lat: number, lon: number): Promise<string | null> {
  if (!isValidCoordinate(lat, lon)) return null;
  try {
    return await zones.fetch(placeKey(lat, lon));
  } catch {
    return null;
  }
}

/** Test seam: forget every cached zone. */
export function __resetPlaceTimezonesForTests(): void {
  zones.clear();
}
