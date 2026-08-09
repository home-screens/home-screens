import type { WeatherConfig } from '@/types/config';

/** ~110m precision — enough to identify a place, short enough for a header. */
export function formatCoords(lat: number, lon: number): string {
  return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
}

/**
 * Resolve the header text for the weather module's "show location" option:
 * custom label -> geocoded place name -> formatted coordinates.
 *
 * Returns null when the option is off. The trailing "no coordinates" null is
 * unreachable in practice and that is by design: `getLocation()` treats missing
 * coordinates *and* the (0, 0) sentinel as unset, and WeatherModule
 * short-circuits to its "Location not set" state in that case, so the views
 * never render. The branch exists so the helper is total and unit-testable.
 */
export function resolveWeatherLocationLabel(
  config: Pick<WeatherConfig, 'showLocation' | 'locationLabel'>,
  locationName?: string,
  coords?: { lat: number; lon: number } | null,
): string | null {
  if (!config.showLocation) return null;
  const custom = config.locationLabel?.trim();
  if (custom) return custom;
  const name = locationName?.trim();
  if (name) return name;
  return coords ? formatCoords(coords.lat, coords.lon) : null;
}
