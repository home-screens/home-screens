/** Shared URL builders for module data fetching + prefetch registry.
 *
 * Both module components and the prefetch system import from here,
 * ensuring the prefetched URL always matches what the module requests.
 */

// Typed config interfaces lack index signatures, making Record<string, unknown>
// incompatible — `any` is an intentional variance escape for structural compatibility.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyConfig = Record<string, any>;

export function stocksUrl(config: AnyConfig): string | null {
  const symbols = config.symbols as string | undefined;
  return symbols ? `/api/stocks?symbols=${encodeURIComponent(symbols)}` : null;
}

export function cryptoUrl(config: AnyConfig): string | null {
  const ids = config.ids as string | undefined;
  return ids ? `/api/crypto?ids=${encodeURIComponent(ids)}` : null;
}

export function newsUrl(config: AnyConfig): string {
  const feed = config.feedUrl as string | undefined;
  return `/api/news?feed=${encodeURIComponent(feed || '')}`;
}

export function airQualityUrl(): string {
  return '/api/air-quality';
}

export function sportsUrl(config: AnyConfig): string {
  const leagues = (config.leagues as string[] | undefined) ?? ['nfl', 'nba'];
  return `/api/sports?leagues=${encodeURIComponent(leagues.join(','))}`;
}

export function standingsUrl(config: AnyConfig): string {
  const league = (config.league as string | undefined) ?? 'nfl';
  const grouping = (config.grouping as string | undefined) ?? 'division';
  return `/api/standings?league=${encodeURIComponent(league)}&grouping=${encodeURIComponent(grouping)}`;
}

export function trafficUrl(config: AnyConfig): string | null {
  const routes = config.routes as unknown[] | undefined;
  return routes?.length
    ? `/api/traffic?routes=${encodeURIComponent(JSON.stringify(routes))}`
    : null;
}

export function todoistUrl(): string {
  return '/api/todoist';
}

export function rainMapUrl(): string {
  return '/api/rain-map';
}

export function historyUrl(config: AnyConfig): string {
  const sources: string[] = [];
  if (config.sourceMuffinLabs !== false) sources.push('muffinlabs');
  if (config.sourceWikipedia !== false) sources.push('wikipedia');
  return `/api/history?sources=${sources.join(',')}`;
}

export function quoteUrl(): string {
  return '/api/quote';
}

export function dadJokeUrl(): string {
  return '/api/jokes';
}

export function photoSlideshowUrl(config: AnyConfig): string {
  if (config.source === 'immich') {
    const params = new URLSearchParams();
    if (config.immichAlbumId) params.set('albumId', config.immichAlbumId as string);
    if (config.immichPersonId) params.set('personId', config.immichPersonId as string);
    if (config.immichFavoritesOnly) params.set('favorites', 'true');
    if (config.immichCount) params.set('count', String(config.immichCount));
    return `/api/immich/photos?${params}`;
  }
  const dir = config.directory as string | undefined;
  return dir ? `/api/backgrounds?directory=${encodeURIComponent(dir)}` : '/api/backgrounds';
}

export function choresUrl(): string {
  return '/api/chores';
}

export function choresDataUrl(): string {
  return '/api/chores/data';
}

export function rewardsUrl(): string {
  return '/api/rewards';
}

export function mealsDataUrl(): string {
  return '/api/meals/data';
}

export function todoStateUrl(): string {
  return '/api/todo/state';
}

/** Registry of URL builders + TTLs for prefetching.
 *  TTLs are aligned with the corresponding server-side cache durations
 *  so the client doesn't consider data fresh when the server has newer data,
 *  or refetch needlessly when the server will return the same cached response.
 */
export const FETCH_KEY_REGISTRY: Record<string, {
  buildUrl: (config: AnyConfig) => string | null;
  ttlMs: number;
}> = {
  'stock-ticker': { buildUrl: stocksUrl, ttlMs: 30_000 },        // server: 30s
  crypto:         { buildUrl: cryptoUrl, ttlMs: 30_000 },         // server: 30s
  news:           { buildUrl: newsUrl, ttlMs: 300_000 },           // server: 5min
  'air-quality':  { buildUrl: airQualityUrl, ttlMs: 300_000 },    // server: 5min
  sports:         { buildUrl: sportsUrl, ttlMs: 60_000 },          // no server cache
  standings:      { buildUrl: standingsUrl, ttlMs: 300_000 },      // no server cache
  traffic:        { buildUrl: trafficUrl, ttlMs: 300_000 },        // no server cache
  todoist:        { buildUrl: todoistUrl, ttlMs: 60_000 },         // server: 1min
  'rain-map':     { buildUrl: rainMapUrl, ttlMs: 600_000 },        // no server cache
  history:        { buildUrl: historyUrl, ttlMs: 3_600_000 },      // no server cache
  quote:          { buildUrl: quoteUrl, ttlMs: 3_600_000 },        // server: 1hr
  'dad-joke':     { buildUrl: dadJokeUrl, ttlMs: 60_000 },         // server: 1min
  'photo-slideshow': { buildUrl: photoSlideshowUrl, ttlMs: 600_000 }, // no server cache
  'fullscreen-photo': { buildUrl: photoSlideshowUrl, ttlMs: 600_000 }, // reuses same backgrounds API
  // 5s poll (instead of 30s) so cross-device toggles — e.g. a kid checks off a
  // chore on their phone's /chores page — surface on the wall dashboard within
  // ~5s instead of 30s. The same-device case is already instant because
  // useChoreData's POST response overwrites local state directly.
  'chore-chart':             { buildUrl: choresUrl, ttlMs: 5_000 },             // server: no cache
  'fullscreen-chore-chart':  { buildUrl: choresUrl, ttlMs: 5_000 },             // shared useChoreData hook
  'meal-planner':            { buildUrl: mealsDataUrl, ttlMs: 60_000 },         // server: no cache
  'fullscreen-meal-planner': { buildUrl: mealsDataUrl, ttlMs: 60_000 },         // server: no cache
  // Only interactive todos poll runtime completion state; read-only todos carry
  // their completion inline in config and need no fetch. 5s poll (like chores)
  // so a tap on one display surfaces on another within ~5s; the same-device
  // case is already instant via the toggle POST response.
  todo:                      { buildUrl: (c) => (c.interactive ? todoStateUrl() : null), ttlMs: 5_000 },
};

/** Allow plugins to register their own fetch key entries for prefetching. */
export function registerFetchKey(
  type: string,
  entry: { buildUrl: (config: AnyConfig) => string | null; ttlMs: number },
): void {
  FETCH_KEY_REGISTRY[type] = entry;
}

/** Remove a dynamically registered fetch key (used when unloading plugins). */
export function deregisterFetchKey(type: string): void {
  delete FETCH_KEY_REGISTRY[type];
}
