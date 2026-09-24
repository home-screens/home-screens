import { NextResponse } from 'next/server';
import { cachedProxyRoute, fetchWithTimeout } from '@/lib/api-utils';
import { householdToday } from '@/lib/household-day';
import type { HistoryEvent, HistoryResponse } from '@/lib/history-types';
import pkg from '../../../../package.json';

export const dynamic = 'force-dynamic';

// Wikimedia buckets clients by User-Agent and drops anything that doesn't
// match their policy format (`name/version (contact)`) into the most
// restrictive rate-limit tier, which answers every request with a 429.
// Node's default agent lands in that tier, so the header is required.
const WIKIMEDIA_USER_AGENT = `home-screens/${pkg.version} (github.com/home-screens/home-screens)`;

// Both sources are best-effort and the result is cached for a day, so a
// failing upstream should be abandoned immediately rather than retried.
// Wikimedia's 429 carries `Retry-After: 1000`, which the shared retry helper
// clamps to 60s per attempt and would otherwise spend two minutes sleeping on
// while `Promise.all` holds the whole route open.
const NO_RETRY = { retries: 0 } as const;

/** Month and day of a `YYYY-MM-DD` string, as numbers. */
function monthDay(date: string): { month: number; day: number } {
  const [, m, d] = date.split('-').map(Number);
  return { month: m, day: d };
}

// Muffin Labs is always asked for an explicit date: its bare `/date` means
// the day on its own server, which is not the household's day.
async function fetchMuffinLabs(date: string): Promise<HistoryEvent[]> {
  try {
    const { month, day } = monthDay(date);
    const res = await fetchWithTimeout(`https://history.muffinlabs.com/date/${month}/${day}`, {
      headers: { Accept: 'application/json' },
      ...NO_RETRY,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const events: Array<{ year: string; text: string }> = data?.data?.Events ?? [];
    return events.slice(0, 10).map((e) => ({ year: e.year, text: e.text, source: 'muffinlabs' as const }));
  } catch {
    return [];
  }
}

async function fetchWikipedia(date: string): Promise<HistoryEvent[]> {
  try {
    const { month, day } = monthDay(date);
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const res = await fetchWithTimeout(
      `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${mm}/${dd}`,
      {
        headers: { Accept: 'application/json', 'User-Agent': WIKIMEDIA_USER_AGENT },
        ...NO_RETRY,
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const events: Array<{ year: number; text: string }> = data?.events ?? [];
    return events.slice(0, 10).map((e) => ({ year: String(e.year), text: e.text, source: 'wikipedia' as const }));
  } catch {
    return [];
  }
}

/** Shuffle array in place (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * The day a display asks for, when it is within a day of the household's
 * today, else the household's today. Displays name the household day they
 * show (`day=`), so one whose clock turns midnight a few seconds before the
 * hub's still gets the new day's events rather than caching yesterday's
 * under today's URL for an hour. The one-day limit keeps a badly set clock
 * from pulling in some other date.
 */
function dayToServe(asked: string | null, today: string): string {
  if (!asked || !/^\d{4}-\d{2}-\d{2}$/.test(asked)) return today;
  const gapDays = Math.abs(Date.parse(`${asked}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return gapDays <= 1 ? asked : today;
}

// "Today" is the household's day from Settings, worked out once per request
// and used for the cache key and both upstream dates alike. Mixing the UTC day
// (key) with the hub's own clock (Wikipedia) and the upstream server's day
// (Muffin Labs) cached one day's events under the next day's key for 24 h.
const { GET, cache } = cachedProxyRoute<HistoryResponse, { date: string; sources: string[] }>({
  auth: 'display',
  ttlMs: 24 * 60 * 60 * 1000,
  prepare: async (request) => {
    const sourcesParam = request.nextUrl.searchParams.get('sources') ?? 'muffinlabs,wikipedia';
    return { date: dayToServe(request.nextUrl.searchParams.get('day'), await householdToday()), sources: sourcesParam.split(',') };
  },
  cacheKey: ({ date, sources }) => `${date}:${sources.join(',')}`,
  execute: async ({ date, sources }) => {
    const fetches = await Promise.all([
      sources.includes('muffinlabs') ? fetchMuffinLabs(date) : [],
      sources.includes('wikipedia') ? fetchWikipedia(date) : [],
    ]);
    const [muffinEvents, wikiEvents] = fetches;

    // Deduplicate by year — prefer Wikipedia (richer text)
    const seen = new Set<string>();
    const deduped: HistoryEvent[] = [];
    for (const e of [...wikiEvents, ...muffinEvents]) {
      if (!seen.has(e.year)) {
        seen.add(e.year);
        deduped.push(e);
      }
    }

    // Both sources swallow their own failures and return [], so an empty
    // result means every enabled source failed — never that the day has no
    // history. Returning a NextResponse keeps it out of the 24h cache (the
    // helper only caches plain values), so the next poll retries instead of
    // the module sitting empty until the next day. Displays that
    // already have events keep showing them, since useFetchData holds the
    // last successful payload across a failed refresh.
    if (deduped.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch historical events' }, { status: 502 });
    }

    return { date, events: shuffle(deduped) };
  },
  errorMessage: 'Failed to fetch historical events',
});

/** @internal */
export { GET, cache };
