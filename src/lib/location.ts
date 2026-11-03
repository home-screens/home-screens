import type { GlobalSettings } from '@/types/config';

export interface Location {
  lat: number;
  lon: number;
}

/**
 * Predicate form for callers that have already extracted lat/lon as separate
 * primitives (e.g. Zustand selectors that read each field individually so
 * Object.is equality avoids re-renders on unrelated settings changes).
 *
 * Treats (0, 0) as the "unset" sentinel because that's what the seed config
 * and the LocationSection's first-time defaults write.
 */
export function hasValidLocation(
  lat: number | null | undefined,
  lon: number | null | undefined,
): boolean {
  if (lat == null || lon == null) return false;
  return !(lat === 0 && lon === 0);
}

/**
 * The household location, `settings.latitude/longitude`. Null when the pair
 * is unset or both coordinates are 0 (the seed value). Every reader of the
 * location goes through this or `hasValidLocation`; the server routes that
 * take a `?lat=&lon=` override wrap it in `getLocationFromConfig`
 * (`src/lib/api-utils.ts`).
 */
export function getLocation(settings: GlobalSettings | null | undefined): Location | null {
  if (!settings) return null;
  const { latitude: lat, longitude: lon } = settings;
  if (!hasValidLocation(lat, lon)) return null;
  return { lat, lon };
}
