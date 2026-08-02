import { cachedProxyRoute, fetchWithTimeout } from '@/lib/api-utils';
import type { HistoryEvent, HistoryResponse } from '@/lib/history-types';

export const dynamic = 'force-dynamic';

async function fetchMuffinLabs(): Promise<HistoryEvent[]> {
  try {
    const res = await fetchWithTimeout('https://history.muffinlabs.com/date', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const events: Array<{ year: string; text: string }> = data?.data?.Events ?? [];
    return events.slice(0, 10).map((e) => ({ year: e.year, text: e.text, source: 'muffinlabs' as const }));
  } catch {
    return [];
  }
}

async function fetchWikipedia(): Promise<HistoryEvent[]> {
  try {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const res = await fetchWithTimeout(
      `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${mm}/${dd}`,
      { headers: { Accept: 'application/json' } },
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

const { GET, cache } = cachedProxyRoute<HistoryResponse>({
  auth: 'display',
  ttlMs: 24 * 60 * 60 * 1000,
  cacheKey: (request) => {
    const sources = request.nextUrl.searchParams.get('sources') ?? 'muffinlabs,wikipedia';
    return `${new Date().toISOString().slice(0, 10)}:${sources}`;
  },
  execute: async (request) => {
    const sourcesParam = request.nextUrl.searchParams.get('sources') ?? 'muffinlabs,wikipedia';
    const sources = sourcesParam.split(',');

    const fetches = await Promise.all([
      sources.includes('muffinlabs') ? fetchMuffinLabs() : [],
      sources.includes('wikipedia') ? fetchWikipedia() : [],
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

    return { events: shuffle(deduped) };
  },
  errorMessage: 'Failed to fetch historical events',
});

/** @internal */
export { GET, cache };
