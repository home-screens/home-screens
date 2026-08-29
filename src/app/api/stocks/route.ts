import { NextResponse } from 'next/server';
import { cachedProxyRoute, fetchWithTimeout, parseCommaList } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface StockResult {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  sparkline?: number[];
  sparklineXs?: number[];
  sparklineWeek?: number[];
  weekChangePercent?: number;
  weekLastDayStart?: number;
}

interface YahooChart {
  meta?: {
    regularMarketPrice?: unknown;
    previousClose?: unknown;
    chartPreviousClose?: unknown;
    currentTradingPeriod?: { regular?: { start?: unknown; end?: unknown } };
    tradingPeriods?: unknown[];
  };
  timestamp?: unknown[];
  indicators?: { quote?: Array<{ close?: unknown[] }> };
}

/** A Yahoo chart payload that survived fetchLeg's `meta` guard — meta is present. */
type ChartWithMeta = YahooChart & { meta: NonNullable<YahooChart['meta']> };

/** Canonical chart set: fixed order (day before week) keeps cache keys stable. */
function parseCharts(raw: string | null): ('day' | 'week')[] {
  const wanted = new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is 'day' | 'week' => s === 'day' || s === 'week'),
  );
  if (wanted.size === 0) return ['day'];
  return (['day', 'week'] as const).filter((c) => wanted.has(c));
}

const YAHOO_PARAMS = {
  day: { interval: '5m', range: '1d' },
  week: { interval: '30m', range: '5d' },
} as const;

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Finite closes paired with their timestamps (null intervals dropped from both). */
function extractDaySeries(chart: YahooChart): { closes: number[]; xs?: number[] } {
  const closesRaw = chart.indicators?.quote?.[0]?.close ?? [];
  const stampsRaw = chart.timestamp ?? [];
  const closes: number[] = [];
  const stamps: number[] = [];
  for (let i = 0; i < closesRaw.length; i++) {
    const c = num(closesRaw[i]);
    if (c === undefined) continue;
    closes.push(Number(c.toPrecision(6)));
    const t = num(stampsRaw[i]);
    if (t !== undefined) stamps.push(t);
  }
  const xs = computeXs(stamps, closes.length, chart);
  return { closes, xs };
}

/** Week closes paired with their timestamps (null intervals dropped from both). */
function extractWeekSeries(chart: YahooChart): { closes: number[]; stamps: number[] } {
  const closesRaw = chart.indicators?.quote?.[0]?.close ?? [];
  const stampsRaw = chart.timestamp ?? [];
  const closes: number[] = [];
  const stamps: number[] = [];
  for (let i = 0; i < closesRaw.length; i++) {
    const c = num(closesRaw[i]);
    if (c === undefined) continue;
    closes.push(Number(c.toPrecision(6)));
    const t = num(stampsRaw[i]);
    if (t !== undefined) stamps.push(t);
  }
  return { closes, stamps };
}

/**
 * Day-chart x positions as 0-1 fractions of the regular session, so the line
 * stops at "now" and the remaining trading time stays empty. Omitted when the
 * data is stale (half or more timestamps outside the window — weekends,
 * pre-open) or when Yahoo gives no session bounds; the client then even-spaces.
 */
function computeXs(stamps: number[], closeCount: number, chart: YahooChart): number[] | undefined {
  const regular = chart.meta?.currentTradingPeriod?.regular;
  const start = num(regular?.start);
  const end = num(regular?.end);
  if (start === undefined || end === undefined || end <= start) return undefined;
  if (stamps.length < closeCount) return undefined; // unpaired timestamps: cannot scale honestly
  const inside = stamps.filter((t) => t >= start && t <= end);
  if (inside.length < Math.ceil(stamps.length / 2)) return undefined;
  const span = end - start;
  return stamps.map((t) =>
    Math.round(Math.min(1, Math.max(0, (t - start) / span)) * 1e4) / 1e4,
  );
}

/**
 * Fraction (0-1) where the week chart's LAST trading day begins, so the
 * client can shade that region. Derived from the per-session bounds in
 * meta.tradingPeriods against the kept closes' timestamps; undefined when
 * Yahoo gives no session bounds or the data predates the last session.
 */
function computeWeekLastDayStart(chart: YahooChart, stamps: number[], closeCount: number): number | undefined {
  const periods: unknown = chart.meta?.tradingPeriods;
  if (!Array.isArray(periods) || stamps.length < closeCount || closeCount < 2) return undefined;
  const starts = periods
    .flatMap((day) => (Array.isArray(day) ? day : [day]))
    .map((p) => num((p as { start?: unknown })?.start))
    .filter((s): s is number => s !== undefined);
  if (starts.length === 0) return undefined;
  const lastStart = Math.max(...starts);
  const firstIndex = stamps.findIndex((t) => t >= lastStart);
  if (firstIndex < 0) return undefined;
  return Math.round((firstIndex / (closeCount - 1)) * 1e4) / 1e4;
}

async function fetchLeg(symbol: string, chart: 'day' | 'week'): Promise<ChartWithMeta> {
  const { interval, range } = YAHOO_PARAMS[chart];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Failed to fetch ${symbol}`);
  const data = await res.json();
  const result = data.chart?.result?.[0];
  if (!result?.meta) throw new Error(`No data for ${symbol}`);
  return result as ChartWithMeta;
}

async function fetchStock(symbol: string, charts: ('day' | 'week')[]): Promise<StockResult> {
  const legs = await Promise.allSettled(
    charts.map((chart) => fetchLeg(symbol, chart).then((yc) => ({ chart, yc }))),
  );
  const ok = legs.filter(
    (l): l is PromiseFulfilledResult<{ chart: 'day' | 'week'; yc: ChartWithMeta }> => l.status === 'fulfilled',
  );
  const day = ok.find((l) => l.value.chart === 'day')?.value.yc;
  const week = ok.find((l) => l.value.chart === 'week')?.value.yc;
  const base = day ?? week;
  if (!base) throw new Error(`No data for ${symbol}`);

  const meta = base.meta;
  const price = num(meta.regularMarketPrice);
  // previousClose is yesterday's close under any range; chartPreviousClose
  // becomes the pre-window close under 5d, which would corrupt daily numbers.
  const previousClose = num(meta.previousClose) ?? num(meta.chartPreviousClose);
  if (price === undefined || previousClose === undefined) throw new Error(`No data for ${symbol}`);
  const change = price - previousClose;
  const changePercent = (change / previousClose) * 100;

  const result: StockResult = {
    symbol: symbol.toUpperCase(),
    price: Math.round(price * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
  };

  if (day) {
    const { closes, xs } = extractDaySeries(day);
    result.sparkline = closes;
    if (xs) result.sparklineXs = xs;
  }
  if (week) {
    const { closes, stamps } = extractWeekSeries(week);
    result.sparklineWeek = closes;
    const lastDayStart = computeWeekLastDayStart(week, stamps, closes.length);
    if (lastDayStart !== undefined) result.weekLastDayStart = lastDayStart;
    const weekBaseline = num(week.meta.chartPreviousClose);
    if (weekBaseline !== undefined) {
      result.weekChangePercent = Math.round(((price - weekBaseline) / weekBaseline) * 100 * 100) / 100;
    }
  }
  return result;
}

const { GET, cache } = cachedProxyRoute<Record<string, unknown>>({
  auth: 'display',
  ttlMs: 30 * 1000,
  cacheKey: (req) => {
    const symbolsParam = req.nextUrl.searchParams.get('symbols') || 'AAPL';
    const charts = parseCharts(req.nextUrl.searchParams.get('charts'));
    return `${parseCommaList(symbolsParam).join(',')}|${charts.join(',')}`;
  },
  execute: async (req) => {
    const symbolsParam = req.nextUrl.searchParams.get('symbols') || 'AAPL';
    const symbols = parseCommaList(symbolsParam);
    const charts = parseCharts(req.nextUrl.searchParams.get('charts'));

    const results = await Promise.allSettled(symbols.map((s) => fetchStock(s, charts)));
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
