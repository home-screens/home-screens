import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { GET, clearStockCaches } from '@/app/api/stocks/route';

interface YahooLeg {
  price: number;
  previousClose?: number; // yesterday's close (any range)
  chartPreviousClose?: number; // close before the chart window
  shortName?: string; // company name from Yahoo meta
  closes?: unknown[];
  timestamps?: unknown[];
  regularStart?: number;
  regularEnd?: number;
  gmtoffset?: number; // exchange UTC offset in seconds (Yahoo meta)
  tradingPeriods?: Array<Array<{ start: number }>>;
}

function makeYahooResponse(leg: YahooLeg) {
  return {
    chart: {
      result: [
        {
          meta: {
            regularMarketPrice: leg.price,
            ...(leg.previousClose !== undefined ? { previousClose: leg.previousClose } : {}),
            ...(leg.chartPreviousClose !== undefined
              ? { chartPreviousClose: leg.chartPreviousClose }
              : {}),
            ...(leg.shortName !== undefined ? { shortName: leg.shortName } : {}),
            ...(leg.regularStart !== undefined
              ? {
                  currentTradingPeriod: {
                    regular: { start: leg.regularStart, end: leg.regularEnd },
                  },
                }
              : {}),
            ...(leg.gmtoffset !== undefined ? { gmtoffset: leg.gmtoffset } : {}),
            ...(leg.tradingPeriods ? { tradingPeriods: leg.tradingPeriods } : {}),
          },
          ...(leg.timestamps ? { timestamp: leg.timestamps } : {}),
          ...(leg.closes ? { indicators: { quote: [{ close: leg.closes }] } } : {}),
        },
      ],
    },
  };
}

function mockFetchSuccess(responses: Record<string, Record<string, YahooLeg>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const symbol = Object.keys(responses).find((s) => url.includes(encodeURIComponent(s)));
      const range = url.includes('range=5d') ? 'week' : 'day';
      const leg = symbol ? responses[symbol][range] : undefined;
      if (!leg) {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeYahooResponse(leg)) });
    }),
  );
}

function mockFetchAllFail() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      }),
    ),
  );
}

function makeRequest(symbols?: string, charts?: string): NextRequest {
  const params = new URLSearchParams();
  if (symbols !== undefined) params.set('symbols', symbols);
  if (charts !== undefined) params.set('charts', charts);
  const qs = params.toString();
  return new NextRequest(`http://localhost/api/stocks${qs ? `?${qs}` : ''}`);
}

describe('GET /api/stocks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearStockCaches();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('fetches a single stock with correct response shape', async () => {
    mockFetchSuccess({ AAPL: { day: { price: 150.123, chartPreviousClose: 148.5 } } });

    const response = await GET(makeRequest('AAPL'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.stocks).toHaveLength(1);
    expect(json.stocks[0]).toEqual({
      symbol: 'AAPL',
      price: 150.12,
      change: 1.62,
      changePercent: 1.09,
      sparkline: [],
    });
  });

  it('requests an intraday range and returns the close series as a sparkline', async () => {
    mockFetchSuccess({
      AAPL: { day: { price: 150.0, chartPreviousClose: 148.0, closes: [148.5, 149.0, 150.0] } },
    });

    const response = await GET(makeRequest('AAPL'));
    const json = await response.json();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('interval=5m&range=1d'),
      expect.anything(),
    );
    expect(json.stocks[0].sparkline).toEqual([148.5, 149, 150]);
  });

  it('drops null closes and trims sparkline precision to 6 significant digits', async () => {
    mockFetchSuccess({
      AAPL: {
        day: { price: 150.0, chartPreviousClose: 148.0, closes: [148.123456789, null, 149.987654321] },
      },
    });

    const response = await GET(makeRequest('AAPL'));
    const json = await response.json();

    expect(json.stocks[0].sparkline).toEqual([148.123, 149.988]);
  });

  it('calculates change and changePercent correctly with rounding', async () => {
    // price=100.456, previousClose=99.123
    // change = 1.333, rounded = 1.33
    // changePercent = (1.333/99.123)*100 = 1.34468..., rounded = 1.34
    mockFetchSuccess({ TSLA: { day: { price: 100.456, chartPreviousClose: 99.123 } } });

    const response = await GET(makeRequest('TSLA'));
    const json = await response.json();

    expect(json.stocks[0].price).toBe(100.46);
    expect(json.stocks[0].change).toBe(1.33);
    expect(json.stocks[0].changePercent).toBe(1.34);
  });

  it('handles negative change (price dropped)', async () => {
    mockFetchSuccess({ MSFT: { day: { price: 95.0, chartPreviousClose: 100.0 } } });

    const response = await GET(makeRequest('MSFT'));
    const json = await response.json();

    expect(json.stocks[0].change).toBe(-5);
    expect(json.stocks[0].changePercent).toBe(-5);
  });

  it('fetches multiple stocks', async () => {
    mockFetchSuccess({
      AAPL: { day: { price: 150.0, chartPreviousClose: 148.0 } },
      GOOGL: { day: { price: 2800.0, chartPreviousClose: 2750.0 } },
    });

    const response = await GET(makeRequest('AAPL,GOOGL'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.stocks).toHaveLength(2);
    expect(json.stocks[0].symbol).toBe('AAPL');
    expect(json.stocks[1].symbol).toBe('GOOGL');
  });

  it('handles partial failure — returns only successful stocks', async () => {
    // Only AAPL succeeds; BADTICKER will not match any key
    mockFetchSuccess({ AAPL: { day: { price: 150.0, chartPreviousClose: 148.0 } } });

    const response = await GET(makeRequest('AAPL,BADTICKER'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.stocks).toHaveLength(1);
    expect(json.stocks[0].symbol).toBe('AAPL');
  });

  it('returns 502 when all stocks fail', async () => {
    mockFetchAllFail();

    const response = await GET(makeRequest('AAPL,GOOGL'));
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.error).toBe('Failed to fetch any stock data');
  });

  it('defaults to AAPL when no symbols param provided', async () => {
    mockFetchSuccess({ AAPL: { day: { price: 175.0, chartPreviousClose: 170.0 } } });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.stocks).toHaveLength(1);
    expect(json.stocks[0].symbol).toBe('AAPL');
  });

  it('filters out empty and whitespace-only symbols', async () => {
    mockFetchSuccess({ AAPL: { day: { price: 150.0, chartPreviousClose: 148.0 } } });

    const response = await GET(makeRequest('AAPL, , ,'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.stocks).toHaveLength(1);
    expect(json.stocks[0].symbol).toBe('AAPL');
  });

  it('trims whitespace around symbols', async () => {
    mockFetchSuccess({ AAPL: { day: { price: 150.0, chartPreviousClose: 148.0 } } });

    const response = await GET(makeRequest(' AAPL '));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.stocks[0].symbol).toBe('AAPL');
  });

  it('uppercases the symbol in the response', async () => {
    mockFetchSuccess({ aapl: { day: { price: 150.0, chartPreviousClose: 148.0 } } });

    const response = await GET(makeRequest('aapl'));
    const json = await response.json();

    expect(json.stocks[0].symbol).toBe('AAPL');
  });

  it('returns 502 when fetch rejects (network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Network error'))),
    );

    const response = await GET(makeRequest('AAPL'));
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.error).toBe('Failed to fetch any stock data');
  });

  it('returns 502 when response has no chart data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ chart: { result: [] } }),
        }),
      ),
    );

    const response = await GET(makeRequest('AAPL'));
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.error).toBe('Failed to fetch any stock data');
  });

  // ── chart sets ──

  it('parses charts=week and fetches the 5d range at 30m granularity', async () => {
    mockFetchSuccess({
      AAPL: { week: { price: 150, previousClose: 148, chartPreviousClose: 140, closes: [140.5, 145, 150] } },
    });

    const response = await GET(makeRequest('AAPL', 'week'));
    const json = await response.json();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('interval=30m&range=5d'),
      expect.anything(),
    );
    expect(json.stocks[0]).toEqual({
      symbol: 'AAPL',
      // previousClose (148) wins over chartPreviousClose (140): daily numbers stay daily
      price: 150,
      change: 2,
      changePercent: 1.35,
      sparklineWeek: [140.5, 145, 150],
      weekChangePercent: 7.14,
    });
  });

  it('charts=day,week fetches both ranges and returns both series', async () => {
    mockFetchSuccess({
      AAPL: {
        day: { price: 150, previousClose: 148, closes: [148.5, 150] },
        week: { price: 150, previousClose: 148, chartPreviousClose: 140, closes: [140, 150] },
      },
    });

    const response = await GET(makeRequest('AAPL', 'day,week'));
    const json = await response.json();

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    expect(calls.some((u) => u.includes('range=1d'))).toBe(true);
    expect(calls.some((u) => u.includes('range=5d'))).toBe(true);
    expect(json.stocks[0].sparkline).toEqual([148.5, 150]);
    expect(json.stocks[0].sparklineWeek).toEqual([140, 150]);
    expect(json.stocks[0].weekChangePercent).toBe(7.14);
  });

  it('drops unknown charts members and defaults to day', async () => {
    mockFetchSuccess({ AAPL: { day: { price: 150, chartPreviousClose: 148 } } });

    const response = await GET(makeRequest('AAPL', 'month,banana'));
    const json = await response.json();

    expect(json.stocks[0].sparkline).toEqual([]);
    expect(json.stocks[0].sparklineWeek).toBeUndefined();
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    expect(calls.some((u) => u.includes('range=5d'))).toBe(false);
  });

  it('keeps a symbol when only one leg of a both-request succeeds', async () => {
    mockFetchSuccess({
      AAPL: { week: { price: 150, previousClose: 148, chartPreviousClose: 140, closes: [140, 150] } },
    });

    const response = await GET(makeRequest('AAPL', 'day,week'));
    const json = await response.json();

    expect(json.stocks).toHaveLength(1);
    expect(json.stocks[0].sparkline).toBeUndefined();
    expect(json.stocks[0].sparklineWeek).toEqual([140, 150]);
    // The partial leg is named, not silently dropped, and logged.
    expect(json.stocks[0].missingCharts).toEqual(['day']);
    expect(json.failedSymbols).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('AAPL day chart failed'));
  });

  it('week-only without previousClose reports no daily change instead of the week move', async () => {
    // Yahoo's 5d chartPreviousClose is the close before the whole week. Using
    // it as today's baseline would turn a -0.24% day into a +0.50% "today".
    mockFetchSuccess({
      VFIAX: { week: { price: 712.67, chartPreviousClose: 709.14, closes: [709, 712.67] } },
    });

    const response = await GET(makeRequest('VFIAX', 'week'));
    const json = await response.json();

    expect(json.stocks[0].change).toBeNull();
    expect(json.stocks[0].changePercent).toBeNull();
    expect(json.stocks[0].weekChangePercent).toBe(0.5);
    expect(json.stocks[0].sparklineWeek).toEqual([709, 712.67]);
  });

  it('day leg keeps chartPreviousClose as the daily baseline (pre-open safe)', async () => {
    // Under 1d, chartPreviousClose is the prior session's close, the baseline
    // the route has always used. previousClose is only a fallback.
    mockFetchSuccess({
      AAPL: { day: { price: 150, previousClose: 150, chartPreviousClose: 148 } },
    });

    const response = await GET(makeRequest('AAPL', 'day'));
    const json = await response.json();

    expect(json.stocks[0].change).toBe(2);
    expect(json.stocks[0].changePercent).toBe(1.35);
  });

  it('reports where the week chart last day begins', async () => {
    mockFetchSuccess({
      AAPL: {
        week: {
          price: 150, previousClose: 148, chartPreviousClose: 140,
          closes: [140, 141, 142, 143, 144],
          timestamps: [100, 200, 300, 400, 500],
          tradingPeriods: [[{ start: 100 }], [{ start: 200 }], [{ start: 300 }]],
        },
      },
    });

    const response = await GET(makeRequest('AAPL', 'week'));
    const json = await response.json();

    // Last session starts at 300 → first stamp ≥ 300 is index 2 → 2/(5-1) = 0.5
    expect(json.stocks[0].weekLastDayStart).toBe(0.5);
  });

  it('omits weekLastDayStart without trading periods', async () => {
    mockFetchSuccess({
      AAPL: { week: { price: 150, previousClose: 148, chartPreviousClose: 140, closes: [140, 150], timestamps: [100, 200] } },
    });
    const response = await GET(makeRequest('AAPL', 'week'));
    const json = await response.json();
    expect(json.stocks[0].weekLastDayStart).toBeUndefined();
  });

  it('includes the company name from meta.shortName', async () => {
    mockFetchSuccess({
      AAPL: { day: { price: 150, previousClose: 148, shortName: 'Apple Inc.' } },
    });

    const response = await GET(makeRequest('AAPL'));
    const json = await response.json();
    expect(json.stocks[0].name).toBe('Apple Inc.');
  });

  it('reports week day-boundary fractions from trading periods', async () => {
    mockFetchSuccess({
      AAPL: {
        week: {
          price: 150, previousClose: 148, chartPreviousClose: 140,
          closes: [140, 141, 142, 143, 144],
          timestamps: [100, 200, 300, 400, 500],
          tradingPeriods: [[{ start: 300 }, { start: 100 }, { start: 450 }]],
        },
      },
    });

    const response = await GET(makeRequest('AAPL', 'week'));
    const json = await response.json();
    // Sessions start at 100/300/450 (scrambled above; starts get sorted before
    // scanning); stamps >= 300 first at index 2, >= 450 at index 4. The 450
    // day begins at the very last bar (fraction 1) and draws no gridline.
    expect(json.stocks[0].weekDayBoundaries).toEqual([0.5]);
  });

  it('drops a last day that begins at the final bar (no fraction-1 outputs)', async () => {
    mockFetchSuccess({
      AAPL: {
        week: {
          price: 150, previousClose: 148, chartPreviousClose: 140,
          closes: [140, 141, 142, 143, 144],
          timestamps: [100, 200, 300, 400, 500],
          tradingPeriods: [[{ start: 100 }, { start: 500 }]],
        },
      },
    });

    const response = await GET(makeRequest('AAPL', 'week'));
    const json = await response.json();
    // The new day owns only the last bar: neither a band nor a gridline draws
    // at the chart's right border.
    expect(json.stocks[0].weekLastDayStart).toBeUndefined();
    expect(json.stocks[0].weekDayBoundaries).toBeUndefined();
  });

  it('reports boundaries and lastDayStart from one consistent scan', async () => {
    mockFetchSuccess({
      AAPL: {
        week: {
          price: 150, previousClose: 148, chartPreviousClose: 140,
          closes: [140, 141, 142, 143],
          timestamps: [100, 200, 300, 400],
          tradingPeriods: [[{ start: 100 }, { start: 300 }, { start: 500 }]],
        },
      },
    });

    const response = await GET(makeRequest('AAPL', 'week'));
    const json = await response.json();
    // Session 300 begins at index 2 (2/3); session 500 has no bar yet, so it
    // contributes neither a boundary nor a lastDayStart.
    expect(json.stocks[0].weekDayBoundaries).toEqual([0.6667]);
    expect(json.stocks[0].weekLastDayStart).toBeUndefined();
  });

  it('omits weekDayBoundaries when no session start lands past the first bar', async () => {
    mockFetchSuccess({
      AAPL: {
        week: {
          price: 150, previousClose: 148, chartPreviousClose: 140,
          closes: [140, 141, 142],
          timestamps: [100, 200, 300],
          tradingPeriods: [[{ start: 90 }, { start: 95 }]],
        },
      },
    });

    const response = await GET(makeRequest('AAPL', 'week'));
    const json = await response.json();
    expect(json.stocks[0].weekDayBoundaries).toBeUndefined();
  });

  // ── day-chart time fractions ──

  it('scales day x-positions to the regular session window', async () => {
    mockFetchSuccess({
      AAPL: {
        day: {
          price: 150, previousClose: 148,
          closes: [148.5, 149, 150],
          timestamps: [1000, 1300, 1600],   // session 1000–2000
          regularStart: 1000, regularEnd: 2000,
        },
      },
    });

    const response = await GET(makeRequest('AAPL'));
    const json = await response.json();

    expect(json.stocks[0].sparklineXs).toEqual([0, 0.3, 0.6]);
  });

  it('keeps x-fractions aligned with closes when nulls are dropped', async () => {
    mockFetchSuccess({
      AAPL: {
        day: {
          price: 150, previousClose: 148,
          closes: [148.5, null, 150],
          timestamps: [1000, 1300, 1600],
          regularStart: 1000, regularEnd: 2000,
        },
      },
    });

    const response = await GET(makeRequest('AAPL'));
    const json = await response.json();

    expect(json.stocks[0].sparkline).toEqual([148.5, 150]);
    expect(json.stocks[0].sparklineXs).toEqual([0, 0.6]);
  });

  it('omits sparklineXs when the series predates the session window (stale data)', async () => {
    mockFetchSuccess({
      AAPL: {
        day: {
          price: 150, previousClose: 148,
          closes: [148.5, 149, 150],
          timestamps: [100, 200, 300],      // all far outside 1000–2000
          regularStart: 1000, regularEnd: 2000,
        },
      },
    });

    const response = await GET(makeRequest('AAPL'));
    const json = await response.json();

    expect(json.stocks[0].sparkline).toEqual([148.5, 149, 150]);
    expect(json.stocks[0].sparklineXs).toBeUndefined();
  });

  it('omits sparklineXs when the response has no trading period', async () => {
    mockFetchSuccess({
      AAPL: { day: { price: 150, previousClose: 148, closes: [148.5, 150], timestamps: [10, 20] } },
    });

    const response = await GET(makeRequest('AAPL'));
    const json = await response.json();

    expect(json.stocks[0].sparklineXs).toBeUndefined();
  });

  // ── day-chart hour marks ──

  it('reports whole-hour marks exchange-locally for a 9:30-16:00 session', async () => {
    // Session epoch 55800-79200 at gmtoffset -4h is 09:30-16:00 local:
    // whole local hours strictly inside are 10:00..15:00.
    mockFetchSuccess({
      AAPL: {
        day: {
          price: 150, previousClose: 148,
          closes: [148.5, 149, 150],
          timestamps: [55800, 67500, 79200],
          regularStart: 55800, regularEnd: 79200, gmtoffset: -14400,
        },
      },
    });

    const response = await GET(makeRequest('AAPL'));
    const json = await response.json();

    expect(json.stocks[0].sparklineHourMarks).toEqual([0.0769, 0.2308, 0.3846, 0.5385, 0.6923, 0.8462]);
  });

  it('reports whole-hour marks for a non-US session in its own hours', async () => {
    // Session epoch 25200-55800 at gmtoffset +2h is 09:00-17:30 local (XETRA-like):
    // whole local hours strictly inside are 10:00..17:00 — not the US 10:00-15:00
    // set, and no mark at the 09:00 open (fraction 0).
    mockFetchSuccess({
      SAP: {
        day: {
          price: 150, previousClose: 148,
          closes: [148.5, 149, 150],
          timestamps: [25200, 40500, 55800],
          regularStart: 25200, regularEnd: 55800, gmtoffset: 7200,
        },
      },
    });

    const response = await GET(makeRequest('SAP'));
    const json = await response.json();

    expect(json.stocks[0].sparklineHourMarks).toEqual([0.1176, 0.2353, 0.3529, 0.4706, 0.5882, 0.7059, 0.8235, 0.9412]);
  });

  it('omits hour marks when Yahoo gives no exchange offset', async () => {
    mockFetchSuccess({
      AAPL: {
        day: {
          price: 150, previousClose: 148,
          closes: [148.5, 149, 150],
          timestamps: [55800, 67500, 79200],
          regularStart: 55800, regularEnd: 79200,
        },
      },
    });

    const response = await GET(makeRequest('AAPL'));
    const json = await response.json();

    expect(json.stocks[0].sparklineHourMarks).toBeUndefined();
  });

  it('omits hour marks when the data is stale (no session window)', async () => {
    mockFetchSuccess({
      AAPL: {
        day: {
          price: 150, previousClose: 148,
          closes: [148.5, 149, 150],
          timestamps: [100, 200, 300],
          regularStart: 55800, regularEnd: 79200, gmtoffset: -14400,
        },
      },
    });

    const response = await GET(makeRequest('AAPL'));
    const json = await response.json();

    expect(json.stocks[0].sparklineXs).toBeUndefined();
    expect(json.stocks[0].sparklineHourMarks).toBeUndefined();
  });

  // ── upstream dedupe ──

  it('reuses a fetched leg across chart sets instead of refetching it', async () => {
    mockFetchSuccess({
      AAPL: {
        day: { price: 150, previousClose: 148, closes: [148.5, 150] },
        week: { price: 150, previousClose: 148, chartPreviousClose: 140, closes: [140, 150] },
      },
    });

    // A ticker (day) and a cards tile (day,week) share the 1d chart.
    const dayOnly = await (await GET(makeRequest('AAPL', 'day'))).json();
    const both = await (await GET(makeRequest('AAPL', 'day,week'))).json();
    const weekOnly = await (await GET(makeRequest('AAPL', 'week'))).json();

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    expect(calls.filter((u) => u.includes('range=1d'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('range=5d'))).toHaveLength(1);
    expect(dayOnly.stocks[0].sparklineWeek).toBeUndefined();
    expect(both.stocks[0].sparkline).toEqual([148.5, 150]);
    expect(both.stocks[0].sparklineWeek).toEqual([140, 150]);
    expect(weekOnly.stocks[0].sparkline).toBeUndefined();
  });

  it('collapses concurrent requests for the same leg into one upstream call', async () => {
    mockFetchSuccess({ AAPL: { day: { price: 150, chartPreviousClose: 148 } } });

    await Promise.all([
      GET(makeRequest('AAPL', 'day')),
      GET(makeRequest('AAPL', 'day,week')),
      GET(makeRequest('AAPL,MSFT', 'day')),
    ]);

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    expect(calls.filter((u) => u.includes('AAPL') && u.includes('range=1d'))).toHaveLength(1);
  });

  // ── 429 back-off ──

  it('pauses every Yahoo call after a 429 instead of retrying each poll', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          headers: { get: () => '0' },
          json: () => Promise.resolve({}),
        }),
      ),
    );

    const first = await GET(makeRequest('AAPL,MSFT', 'day,week'));
    expect(first.status).toBe(502);
    const callsAfterFirst = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('rate limited'));

    // Within the back-off window nothing reaches Yahoo, even for new symbols.
    const second = await GET(makeRequest('GOOGL', 'day'));
    expect(second.status).toBe(502);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);
  });
});
