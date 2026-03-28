import { cachedProxyRoute } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const { GET, cache } = cachedProxyRoute<{ events: Array<{ year: string; text: string }> }>({
  auth: 'display',
  ttlMs: 24 * 60 * 60 * 1000,
  cacheKey: () => new Date().toISOString().slice(0, 10),
  url: 'https://history.muffinlabs.com/date',
  fetchInit: { headers: { Accept: 'application/json' } },
  transform: (data) => {
    const allEvents: Array<{ year: string; text: string }> =
      (data as { data?: { Events?: Array<{ year: string; text: string }> } }).data?.Events ?? [];
    return {
      events: allEvents.slice(0, 10).map((e) => ({ year: e.year, text: e.text })),
    };
  },
  errorMessage: 'Failed to fetch historical events',
});

/** @internal */
export { GET, cache };
