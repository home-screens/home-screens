import { NextResponse } from 'next/server';
import { cachedProxyRoute, createTTLCache, fetchWithTimeout, parseCommaList } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

type Chart = 'day' | 'week';

interface StockResult {
  symbol: string;
  /** Company name from Yahoo meta.shortName, when the leg carried one. */
  name?: string;
  price: number;
  /** Today's move; null when Yahoo gives no prior-session close to measure from. */
  change: number | null;
  changePercent: number | null;
  sparkline?: number[];
  sparklineXs?: number[];
  /** X fractions (0-1) of the day chart's whole trading hours, exchange-local. */
  sparklineHourMarks?: number[];
  sparklineWeek?: number[];
  weekChangePercent?: number;
  weekLastDayStart?: number;
  /** X fractions (0-1) where each new trading day begins in the week series. */
  weekDayBoundaries?: number[];
  /** Requested charts whose upstream fetch failed; the symbol is still served from the legs that worked. */
  missingCharts?: Chart[];
}

interface YahooChart {
  meta?: {
    regularMarketPrice?: unknown;
    previousClose?: unknown;
    chartPreviousClose?: unknown;
    shortName?: unknown;
    currentTradingPeriod?: { regular?: { start?: unknown; end?: unknown } };
    /** Exchange UTC offset in seconds (Yahoo meta). */
    gmtoffset?: unknown;
    tradingPeriods?: unknown[];
  };
  timestamp?: unknown[];
  indicators?: { quote?: Array<{ close?: unknown[] }> };
}

/** A Yahoo chart payload that survived fetchLeg's `meta` guard — meta is present. */
type ChartWithMeta = YahooChart & { meta: NonNullable<YahooChart['meta']> };

/** Canonical chart set: fixed order (day before week) keeps cache keys stable. */
function parseCharts(raw: string | null): Chart[] {
  const wanted = new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is Chart => s === 'day' || s === 'week'),
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
function extractDaySeries(chart: YahooChart): { closes: number[]; xs?: number[]; hourMarks?: number[] } {
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
  const scaled = computeXs(stamps, closes.length, chart);
  return scaled === undefined
    ? { closes }
    : { closes, xs: scaled.xs, hourMarks: scaled.hourMarks };
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
 * The same guard carries the hour marks: without honest x positions there is
 * no honest place for hour gridlines either.
 */
function computeXs(
  stamps: number[],
  closeCount: number,
  chart: YahooChart,
): { xs: number[]; hourMarks?: number[] } | undefined {
  const regular = chart.meta?.currentTradingPeriod?.regular;
  const start = num(regular?.start);
  const end = num(regular?.end);
  if (start === undefined || end === undefined || end <= start) return undefined;
  if (stamps.length < closeCount) return undefined; // unpaired timestamps: cannot scale honestly
  const inside = stamps.filter((t) => t >= start && t <= end);
  if (inside.length < Math.ceil(stamps.length / 2)) return undefined;
  const span = end - start;
  const xs = stamps.map((t) =>
    Math.round(Math.min(1, Math.max(0, (t - start) / span)) * 1e4) / 1e4,
  );
  const gmtoffset = num(chart.meta?.gmtoffset);
  const hourMarks = gmtoffset === undefined ? undefined : computeHourMarks(start, end, span, gmtoffset);
  return hourMarks?.length ? { xs, hourMarks } : { xs };
}

/**
 * Whole trading hours strictly inside the session as 0-1 x fractions — local
 * to the exchange via its gmtoffset, so a US 9:30-16:00 session marks
 * 10:00-15:00 while a 09:00-17:30 European one marks 10:00-17:00. A session
 * that opens exactly on the hour contributes no fraction-0 mark.
 */
function computeHourMarks(start: number, end: number, span: number, gmtoffset: number): number[] {
  // Local wall-clock = epoch + gmtoffset; a whole local hour begins where
  // that sum is a multiple of 3600.
  const intoHour = (((start + gmtoffset) % 3600) + 3600) % 3600;
  const marks: number[] = [];
  for (let t = start + ((3600 - intoHour) % 3600); t < end; t += 3600) {
    const frac = Math.round(((t - start) / span) * 1e4) / 1e4;
    if (frac > 0 && frac < 1) marks.push(frac);
  }
  return marks;
}

/**
 * Where each new trading day begins in the week series, as 0-1 fractions
 * against the kept closes' timestamps, from the per-session bounds in
 * meta.tradingPeriods. One pass owns both outputs so they can never disagree:
 * `lastDayStart` (the client's highlight band) is the final boundary whenever
 * it lands inside the series. A day that begins at the very last bar
 * (fraction 1) draws neither a band nor a gridline — the chart edge is not a
 * divider. Members are undefined when Yahoo gives no session bounds or the
 * data predates the last session.
 */
function computeWeekBoundaries(
  chart: YahooChart,
  stamps: number[],
  closeCount: number,
): { lastDayStart?: number; dayBoundaries?: number[] } {
  const periods: unknown = chart.meta?.tradingPeriods;
  if (!Array.isArray(periods) || stamps.length < closeCount || closeCount < 2) return {};
  const starts = periods
    .flatMap((day) => (Array.isArray(day) ? day : [day]))
    .map((p) => num((p as { start?: unknown })?.start))
    .filter((s): s is number => s !== undefined)
    .sort((a, b) => a - b);
  if (starts.length === 0) return {};
  const frac = (idx: number) => Math.round((idx / (closeCount - 1)) * 1e4) / 1e4;
  const out: number[] = [];
  // Sorted starts: once one lands past the data, so do all after it, and the
  // last start (the band's) is then unplaced too.
  let lastFrac: number | undefined;
  for (const start of starts) {
    const idx = stamps.findIndex((t) => t >= start);
    if (idx < 0) { lastFrac = undefined; break; }
    lastFrac = frac(idx);
    if (lastFrac > 0 && lastFrac < 1 && (out.length === 0 || lastFrac > out[out.length - 1])) out.push(lastFrac);
  }
  return {
    ...(lastFrac !== undefined && lastFrac < 1 ? { lastDayStart: lastFrac } : {}),
    ...(out.length > 0 ? { dayBoundaries: out } : {}),
  };
}

const LEG_TTL_MS = 30 * 1000;
const BACKOFF_BASE_MS = 30 * 1000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;

/**
 * Per-(symbol, chart) cache + single-flight. The route response cache is keyed
 * by symbols AND chart set, so a cards tile asking for `day,week` and a ticker
 * asking for `day` would otherwise each hit Yahoo for the same 1d chart. Legs
 * are the unit Yahoo actually serves, so they are the unit we dedupe on.
 */
const legCache = createTTLCache<ChartWithMeta>(LEG_TTL_MS);
const legInflight = new Map<string, Promise<ChartWithMeta>>();

/**
 * Store-wide 429 back-off. One rate-limit response pauses every Yahoo call
 * (all symbols, both legs) for a growing window instead of letting each leg's
 * own retry loop and each display's 30s poll keep hammering the limiter.
 * A successful fetch resets the escalation.
 */
let rateLimitedUntil = 0;
let rateLimitStrikes = 0;

function noteRateLimited(): void {
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** rateLimitStrikes, BACKOFF_MAX_MS);
  rateLimitStrikes++;
  rateLimitedUntil = Date.now() + delay;
  console.warn(`[stocks] Yahoo rate limited; pausing all stock fetches for ${Math.round(delay / 1000)}s`);
}

async function fetchLegUncached(symbol: string, chart: Chart): Promise<ChartWithMeta> {
  if (Date.now() < rateLimitedUntil) {
    throw new Error(`Rate limited: pausing ${symbol} ${chart} fetch`);
  }
  const { interval, range } = YAHOO_PARAMS[chart];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetchWithTimeout(url);
  if (res.status === 429) {
    noteRateLimited();
    throw new Error(`Rate limited fetching ${symbol}`);
  }
  if (!res.ok) throw new Error(`Failed to fetch ${symbol}`);
  const data = await res.json();
  const result = data.chart?.result?.[0];
  if (!result?.meta) throw new Error(`No data for ${symbol}`);
  rateLimitStrikes = 0;
  return result as ChartWithMeta;
}

function fetchLeg(symbol: string, chart: Chart): Promise<ChartWithMeta> {
  const key = `${symbol.toUpperCase()}|${chart}`;
  const cached = legCache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = legInflight.get(key);
  if (existing) return existing;
  const promise = fetchLegUncached(symbol, chart)
    .then((leg) => {
      legCache.set(key, leg);
      return leg;
    })
    .finally(() => {
      if (legInflight.get(key) === promise) legInflight.delete(key);
    });
  legInflight.set(key, promise);
  return promise;
}

/**
 * The prior-session close that today's change is measured from. Under the 1d
 * range Yahoo's chartPreviousClose IS the prior session's close (the order the
 * route has always used); under 5d it is the close before the whole week, so
 * the week leg may only contribute previousClose. No baseline means no daily
 * change, never a week-sized one dressed up as today's.
 */
function dailyBaseline(day: ChartWithMeta | undefined, week: ChartWithMeta | undefined): number | undefined {
  if (day) return num(day.meta.chartPreviousClose) ?? num(day.meta.previousClose);
  if (week) return num(week.meta.previousClose);
  return undefined;
}

async function fetchStock(symbol: string, charts: Chart[]): Promise<StockResult> {
  const legs = await Promise.allSettled(
    charts.map((chart) => fetchLeg(symbol, chart).then((yc) => ({ chart, yc }))),
  );
  const ok = legs.filter(
    (l): l is PromiseFulfilledResult<{ chart: Chart; yc: ChartWithMeta }> => l.status === 'fulfilled',
  );
  const missingCharts = charts.filter((_, i) => legs[i].status === 'rejected');
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg.status === 'rejected') {
      const reason = leg.reason instanceof Error ? leg.reason.message : String(leg.reason);
      console.warn(`[stocks] ${symbol} ${charts[i]} chart failed: ${reason}`);
    }
  }
  const day = ok.find((l) => l.value.chart === 'day')?.value.yc;
  const week = ok.find((l) => l.value.chart === 'week')?.value.yc;
  const base = day ?? week;
  if (!base) throw new Error(`No data for ${symbol}`);

  const price = num(base.meta.regularMarketPrice);
  if (price === undefined) throw new Error(`No data for ${symbol}`);
  const baseline = dailyBaseline(day, week);
  const change = baseline === undefined ? null : price - baseline;
  const changePercent = baseline === undefined || change === null ? null : (change / baseline) * 100;

  const result: StockResult = {
    symbol: symbol.toUpperCase(),
    price: Math.round(price * 100) / 100,
    change: change === null ? null : Math.round(change * 100) / 100,
    changePercent: changePercent === null ? null : Math.round(changePercent * 100) / 100,
  };

  const shortName = typeof base.meta.shortName === 'string' ? base.meta.shortName.trim() : '';
  if (shortName) result.name = shortName;

  if (day) {
    const { closes, xs, hourMarks } = extractDaySeries(day);
    result.sparkline = closes;
    if (xs) result.sparklineXs = xs;
    if (hourMarks) result.sparklineHourMarks = hourMarks;
  }
  if (week) {
    const { closes, stamps } = extractWeekSeries(week);
    result.sparklineWeek = closes;
    const { lastDayStart, dayBoundaries } = computeWeekBoundaries(week, stamps, closes.length);
    if (lastDayStart !== undefined) result.weekLastDayStart = lastDayStart;
    if (dayBoundaries !== undefined) result.weekDayBoundaries = dayBoundaries;
    const weekBaseline = num(week.meta.chartPreviousClose);
    if (weekBaseline !== undefined) {
      result.weekChangePercent = Math.round(((price - weekBaseline) / weekBaseline) * 100 * 100) / 100;
    }
  }
  if (missingCharts.length > 0) result.missingCharts = missingCharts;
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

/** @internal Clears the response cache, the per-leg cache and the 429 back-off. */
function clearStockCaches(): void {
  cache.clear();
  legCache.clear();
  legInflight.clear();
  rateLimitedUntil = 0;
  rateLimitStrikes = 0;
}

/** @internal */
export { GET, cache, clearStockCaches };
