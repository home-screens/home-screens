/** Client-side helpers for media URLs carrying `mt` access tokens.
 *
 * List endpoints mint a fresh token on every poll, so the same asset's URL
 * changes even though nothing about the asset did. Consumers that must not
 * react to token-only changes (a <video src> swap aborts the decoder and
 * restarts playback) compare on the token-stripped URL and read the token
 * expiry to decide when a refresh is genuinely needed.
 */

function parseUrl(url: string): URL | null {
  try {
    // Base handles the app-relative URLs the API returns; absolute URLs ignore it.
    return new URL(url, 'http://media-url.local');
  } catch {
    return null;
  }
}

/** Canonical form of a media URL with the `mt` token removed — for identity
 *  comparison only, not for fetching. */
export function stripMediaToken(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) return url;
  parsed.searchParams.delete('mt');
  return parsed.href;
}

/** Epoch-ms expiry embedded in the URL's `mt` token (`${exp}.${sig}`),
 *  or null when there is no token / it is malformed. */
export function mediaTokenExpiryMs(url: string): number | null {
  const token = parseUrl(url)?.searchParams.get('mt');
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const exp = Number(token.slice(0, dot));
  return Number.isFinite(exp) ? exp : null;
}
