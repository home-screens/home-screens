import { cachedProxyRoute, parseCommaList } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

function parseIds(request: { nextUrl: { searchParams: URLSearchParams } }) {
  return parseCommaList(request.nextUrl.searchParams.get('ids') || 'bitcoin,ethereum').join(',');
}

const { GET, cache } = cachedProxyRoute({
  auth: 'display',
  ttlMs: 30 * 1000,
  cacheKey: (req) => parseIds(req),
  url: (req) => {
    const ids = parseIds(req);
    return `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`;
  },
  transform: (data) => {
    const prices = Object.entries(data as Record<string, { usd: number; usd_24h_change: number }>).map(
      ([id, v]) => ({
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        price: v.usd,
        change24h: Math.round((v.usd_24h_change ?? 0) * 100) / 100,
      }),
    );
    return { prices };
  },
  errorMessage: 'Failed to fetch crypto prices',
});

/** @internal */
export { GET, cache };
