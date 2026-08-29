import { NextResponse, type NextRequest } from 'next/server';
import { createTTLCache, fetchWithTimeout, withDisplayAuth } from '@/lib/api-utils';
import { readConfig } from '@/lib/config';
import { isSafeExternalUrl, isSafeLocalOrExternalUrl } from '@/lib/url-safety';
import { decodeFeedBody, parseFeed, FeedParseError } from '@/lib/news/parse-feed';
import { resolveSource } from '@/lib/news/sources';
import type { NewsFeedResult, NewsResponse } from '@/lib/news/types';
import type { NewsFeedSource, ScreenConfiguration } from '@/types/config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/news?feed=<url|virtual>&feed=...
 *
 * Fetches and parses every requested feed (RSS, RDF, Atom, JSON Feed) and
 * answers one result per feed, in request order. A feed that fails answers
 * `{ ok: false, error }` next to its healthy siblings, so one dead source
 * never blanks a module. Each feed is cached for five minutes with a single
 * in-flight fetch, so ten displays polling the same feed cost one upstream
 * call.
 *
 * Virtual sources (`local`, `topic:`, `youtube:`, `reddit:`) are resolved
 * here from the household settings; see `src/lib/news/sources.ts`.
 *
 * Home-network feeds (self-hosted readers on RFC1918 addresses) are fetched
 * only when the exact URL is present in config with `homeNetwork: true`;
 * the editor toggle is the consent, a query flag alone is not.
 */

export const MAX_FEEDS_PER_REQUEST = 12;
export const MAX_ITEMS_PER_FEED = 50;
const TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const USER_AGENT = 'HomeScreens/1.0 (+https://homescreens.dev)';
const ACCEPT = 'application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, text/xml;q=0.9, application/json;q=0.8, */*;q=0.5';

export const cache = createTTLCache<NewsFeedResult>(TTL_MS);
const inflight = new Map<string, Promise<NewsFeedResult>>();

/** Every feed URL any news module has opted into home-network fetching. */
function homeNetworkFeeds(config: ScreenConfiguration): Set<string> {
  const urls = new Set<string>();
  const visit = (screens: ScreenConfiguration['screens'] | undefined) => {
    for (const screen of screens ?? []) {
      for (const mod of screen.modules ?? []) {
        if (mod.type !== 'news' && mod.type !== 'fullscreen-news') continue;
        const feeds = (mod.config as { feeds?: NewsFeedSource[] } | undefined)?.feeds;
        if (!Array.isArray(feeds)) continue;
        for (const f of feeds) {
          if (f && f.homeNetwork === true && typeof f.url === 'string') urls.add(f.url.trim());
        }
      }
    }
  };
  visit(config.screens);
  for (const d of config.displays ?? []) visit(d.screens);
  return urls;
}

async function fetchFeed(requested: string, target: string, allowHomeNetwork: boolean): Promise<NewsFeedResult> {
  const fetchedAt = Date.now();
  const fail = (error: NewsFeedResult['error'], status?: number): NewsFeedResult =>
    ({ url: requested, ok: false, error, status, items: [], fetchedAt });

  // SSRF guard runs on every miss, so cached entries were validated when stored.
  const safe = allowHomeNetwork ? await isSafeLocalOrExternalUrl(target) : await isSafeExternalUrl(target);
  if (!safe) return fail('blocked-url');

  let res: Response;
  try {
    res = await fetchWithTimeout(target, {
      timeout: FETCH_TIMEOUT_MS,
      retries: 1,
      headers: { 'user-agent': USER_AGENT, accept: ACCEPT },
      redirect: 'follow',
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    return fail(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable');
  }
  if (!res.ok) return fail('http-error', res.status);

  const length = Number(res.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return fail('not-a-feed');
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BODY_BYTES) return fail('not-a-feed');

  try {
    const feed = parseFeed(decodeFeedBody(bytes, res.headers.get('content-type')));
    return {
      url: requested,
      ok: true,
      title: feed.title,
      format: feed.format,
      items: feed.items.slice(0, MAX_ITEMS_PER_FEED),
      fetchedAt,
    };
  } catch (err) {
    if (err instanceof FeedParseError) return fail('not-a-feed');
    throw err;
  }
}

/** Cache + single flight keyed by the resolved target (two labels for one URL share a fetch). */
function loadFeed(requested: string, target: string, allowHomeNetwork: boolean): Promise<NewsFeedResult> {
  const key = `${allowHomeNetwork ? 'lan' : 'ext'}:${target}`;
  const cached = cache.get(key);
  if (cached) return Promise.resolve({ ...cached, url: requested });
  const existing = inflight.get(key);
  if (existing) return existing.then((r) => ({ ...r, url: requested }));
  const run = fetchFeed(requested, target, allowHomeNetwork)
    .then((result) => {
      // Failures are cached too, briefly, so a dead feed is not hammered by
      // every display on every poll; the TTL is short enough to recover fast.
      cache.set(key, result);
      return result;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

export const GET = withDisplayAuth(async (request: NextRequest) => {
  const requested = request.nextUrl.searchParams.getAll('feed')
    .map((f) => f.trim())
    .filter((f, i, all) => all.indexOf(f) === i);

  const now = Date.now();
  if (requested.length === 0) {
    return NextResponse.json({ feeds: [] } satisfies NewsResponse);
  }

  let config: ScreenConfiguration | null = null;
  try {
    config = await readConfig();
  } catch {
    // Settings unavailable: virtual sources fall back to en-US, no home-network feeds.
  }
  const locale = config?.settings?.locale;
  const locationName = config?.settings?.locationName;
  const lanFeeds = config ? homeNetworkFeeds(config) : new Set<string>();

  const results = await Promise.all(requested.map(async (url, index): Promise<NewsFeedResult> => {
    if (index >= MAX_FEEDS_PER_REQUEST) return { url, ok: false, error: 'too-many-feeds', items: [], fetchedAt: now };
    if (!url) return { url, ok: false, error: 'empty-url', items: [], fetchedAt: now };
    const resolved = resolveSource(url, { locale, locationName });
    if (!resolved.url) {
      return { url, ok: false, error: resolved.kind === 'local' ? 'no-location' : 'blocked-url', items: [], fetchedAt: now };
    }
    try {
      return await loadFeed(url, resolved.url, resolved.kind === 'feed' && lanFeeds.has(url));
    } catch {
      return { url, ok: false, error: 'unreachable', items: [], fetchedAt: now };
    }
  }));

  return NextResponse.json({ feeds: results } satisfies NewsResponse);
}, 'Failed to fetch news');
