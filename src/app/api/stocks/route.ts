import { NextResponse } from 'next/server';
import { cachedProxyRoute, fetchWithTimeout, parseCommaList } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface StockResult {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  sparkline: number[];
}

async function fetchStock(symbol: string): Promise<StockResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Failed to fetch ${symbol}`);

  const data = await res.json();
  if (!data.chart?.result?.[0]?.meta) throw new Error(`No data for ${symbol}`);
  const result = data.chart.result[0];
  const meta = result.meta;
  const price = meta.regularMarketPrice;
  const previousClose = meta.chartPreviousClose ?? meta.previousClose;
  const change = price - previousClose;
  const changePercent = (change / previousClose) * 100;

  // Intraday close series for the sparkline; halted/empty intervals come back null.
  const closes: unknown[] = result.indicators?.quote?.[0]?.close ?? [];
  const sparkline = closes
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .map((v) => Number(v.toPrecision(6)));

  return {
    symbol: symbol.toUpperCase(),
    price: Math.round(price * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    sparkline,
  };
}

const { GET, cache } = cachedProxyRoute<Record<string, unknown>>({
  auth: 'display',
  ttlMs: 30 * 1000,
  cacheKey: (req) => {
    const symbolsParam = req.nextUrl.searchParams.get('symbols') || 'AAPL';
    return parseCommaList(symbolsParam).join(',');
  },
  execute: async (req) => {
    const symbolsParam = req.nextUrl.searchParams.get('symbols') || 'AAPL';
    const symbols = parseCommaList(symbolsParam);

    const results = await Promise.allSettled(symbols.map(fetchStock));
    const stocks = results
      .filter((r): r is PromiseFulfilledResult<StockResult> => r.status === 'fulfilled')
      .map((r) => r.value);

    if (stocks.length === 0) {
      return NextResponse.json({ error: 'Failed to fetch any stock data' }, { status: 502 });
    }

    const result: Record<string, unknown> = { stocks };
    const failedSymbols = symbols.filter((_, i) => results[i].status === 'rejected');
    if (failedSymbols.length > 0) result.failedSymbols = failedSymbols;
    return result;
  },
  errorMessage: 'Failed to fetch stocks',
});

/** @internal */
export { GET, cache };
