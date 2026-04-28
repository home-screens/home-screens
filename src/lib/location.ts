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
 * Resolve the configured location, preferring the top-level
 * `settings.latitude/longitude` fields and falling back to the legacy
 * `settings.weather.latitude/longitude`. Returns null when neither pair is
 * set or when both coordinates are 0.
 *
 * For server-side route handlers that accept a `?lat=&lon=` override and
 * return string-typed values, see `getLocationFromConfig` in
 * `src/lib/api-utils.ts` — that helper keeps the URL-override semantic and
 * does not apply the (0, 0) zero-guard since some weather providers want raw
 * coordinates to fail loudly.
 */
export function getLocation(settings: GlobalSettings | null | undefined): Location | null {
  if (!settings) return null;
  const lat = settings.latitude ?? settings.weather?.latitude;
  const lon = settings.longitude ?? settings.weather?.longitude;
  if (!hasValidLocation(lat, lon)) return null;
  return { lat: lat as number, lon: lon as number };
}
