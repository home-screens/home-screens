/**
 * Which radar server the rain map reads from.
 *
 * The rain map was built on RainViewer's public API. RainViewer wound that
 * API down through 2025 (nowcast, satellite and every zoom above 7 removed on
 * 2026-01-01) and the frame-list endpoint stopped answering on 2026-09-04.
 * LibreWXR (github.com/JoshuaKimsey/LibreWXR) is an open source, self-hostable
 * server with the same v2 wire format: the same weather-maps.json index and
 * the same `{host}{path}/{size}/{z}/{x}/{y}/{color}/{smooth}_{snow}.png` tile
 * URL, plus nowcast frames, zoom to 12 and every colour scheme restored. Its
 * public instance is the default; a household running its own copy points the
 * hub at it from Settings > Weather.
 */

export const DEFAULT_RADAR_SERVER_URL = 'https://api.librewxr.net';

/** Path of the frame index on every v2-compatible radar server. */
export const RADAR_INDEX_PATH = '/public/weather-maps.json';

/**
 * Normalise a configured radar server URL: trimmed, no trailing slash, and
 * only http(s). Returns null for anything unusable (blank, another scheme,
 * not a URL at all) so the caller can fall back to the default.
 */
export function normalizeRadarServerUrl(value: string | undefined | null): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // Origin plus any base path a reverse proxy mounts the server under.
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** The radar server the hub should read from: the configured one, else the default. */
export function resolveRadarServerUrl(configured: string | undefined | null): string {
  return normalizeRadarServerUrl(configured) ?? DEFAULT_RADAR_SERVER_URL;
}
