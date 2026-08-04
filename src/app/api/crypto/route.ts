import { cachedProxyRoute, parseCommaList } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

function parseIds(request: { nextUrl: { searchParams: URLSearchParams } }) {
  return parseCommaList(request.nextUrl.searchParams.get('ids') || 'bitcoin,ethereum').join(',');
}

interface CoinGeckoMarket {
  id: string;
  name?: string;
  current_price: number;
  price_change_percentage_24h?: number | null;
  sparkline_in_7d?: { price?: unknown[] };
}

const { GET, cache } = cachedProxyRoute({
  auth: 'display',
  ttlMs: 30 * 1000,
  cacheKey: (req) => parseIds(req),
  url: (req) => {
    const ids = parseIds(req);
    return `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&sparkline=true&price_change_percentage=24h`;
  },
  transform: (data, req) => {
    // /coins/markets returns market-cap order; restore the user's configured order.
    const rank = new Map(parseIds(req).split(',').map((id, i) => [id, i]));
    const prices = (data as CoinGeckoMarket[])
      .map((coin) => ({
        id: coin.id,
        name: coin.name || coin.id.charAt(0).toUpperCase() + coin.id.slice(1),
        price: coin.current_price,
        change24h: Math.round((coin.price_change_percentage_24h ?? 0) * 100) / 100,
        sparkline: (coin.sparkline_in_7d?.price ?? [])
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
          .map((v) => Number(v.toPrecision(6))),
      }))
      .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
    return { prices };
  },
  errorMessage: 'Failed to fetch crypto prices',
});

/** @internal */
export { GET, cache };
