import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { GET, cache } from '@/app/api/stocks/route';

function makeYahooResponse(price: number, previousClose: number, closes?: unknown[]) {
  return {
    chart: {
      result: [
        {
          meta: {
            regularMarketPrice: price,
            chartPreviousClose: previousClose,
          },
          ...(closes ? { indicators: { quote: [{ close: closes }] } } : {}),
        },
      ],
    },
  };
}

function mockFetchSuccess(
  responses: Record<string, { price: number; previousClose: number; closes?: unknown[] }>,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const symbol = Object.keys(responses).find((s) => url.includes(encodeURIComponent(s)));
      if (!symbol) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({}),
        });
      }
      const { price, previousClose, closes } = responses[symbol];
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(makeYahooResponse(price, previousClose, closes)),
      });
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

function makeRequest(symbols?: string): NextRequest {
  const params = symbols !== undefined ? `?symbols=${encodeURIComponent(symbols)}` : '';
  return new NextRequest(`http://localhost/api/stocks${params}`);
}

describe('GET /api/stocks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cache.clear();
  });

  it('fetches a single stock with correct response shape', async () => {
    mockFetchSuccess({ AAPL: { price: 150.123, previousClose: 148.5 } });

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
      AAPL: { price: 150.0, previousClose: 148.0, closes: [148.5, 149.0, 150.0] },
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
      AAPL: { price: 150.0, previousClose: 148.0, closes: [148.123456789, null, 149.987654321] },
    });

    const response = await GET(makeRequest('AAPL'));
    const json = await response.json();

    expect(json.stocks[0].sparkline).toEqual([148.123, 149.988]);
  });

  it('calculates change and changePercent correctly with rounding', async () => {
    // price=100.456, previousClose=99.123
    // change = 1.333, rounded = 1.33
    // changePercent = (1.333/99.123)*100 = 1.34468..., rounded = 1.34
    mockFetchSuccess({ TSLA: { price: 100.456, previousClose: 99.123 } });

    const response = await GET(makeRequest('TSLA'));
    const json = await response.json();

    expect(json.stocks[0].price).toBe(100.46);
    expect(json.stocks[0].change).toBe(1.33);
    expect(json.stocks[0].changePercent).toBe(1.34);
  });

  it('handles negative change (price dropped)', async () => {
    mockFetchSuccess({ MSFT: { price: 95.0, previousClose: 100.0 } });

    const response = await GET(makeRequest('MSFT'));
    const json = await response.json();

    expect(json.stocks[0].change).toBe(-5);
    expect(json.stocks[0].changePercent).toBe(-5);
  });

  it('fetches multiple stocks', async () => {
    mockFetchSuccess({
      AAPL: { price: 150.0, previousClose: 148.0 },
      GOOGL: { price: 2800.0, previousClose: 2750.0 },
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
    mockFetchSuccess({ AAPL: { price: 150.0, previousClose: 148.0 } });

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
    mockFetchSuccess({ AAPL: { price: 175.0, previousClose: 170.0 } });

    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.stocks).toHaveLength(1);
    expect(json.stocks[0].symbol).toBe('AAPL');
  });

  it('filters out empty and whitespace-only symbols', async () => {
    mockFetchSuccess({ AAPL: { price: 150.0, previousClose: 148.0 } });

    const response = await GET(makeRequest('AAPL, , ,'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.stocks).toHaveLength(1);
    expect(json.stocks[0].symbol).toBe('AAPL');
  });

  it('trims whitespace around symbols', async () => {
    mockFetchSuccess({ AAPL: { price: 150.0, previousClose: 148.0 } });

    const response = await GET(makeRequest(' AAPL '));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.stocks[0].symbol).toBe('AAPL');
  });

  it('uppercases the symbol in the response', async () => {
    mockFetchSuccess({ aapl: { price: 150.0, previousClose: 148.0 } });

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
});
