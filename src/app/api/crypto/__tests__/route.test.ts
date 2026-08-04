import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockFetch, mockFetchError, silenceConsole } from '@/test-utils';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { GET, cache } from '@/app/api/crypto/route';

silenceConsole();

beforeEach(() => {
  vi.restoreAllMocks();
  cache.clear();
});

interface MarketOverrides {
  name?: string;
  price?: number;
  change?: number | null;
  sparkline?: unknown[];
}

function market(id: string, { name, price = 100, change = 0, sparkline = [] }: MarketOverrides = {}) {
  return {
    id,
    name: name ?? id.charAt(0).toUpperCase() + id.slice(1),
    current_price: price,
    price_change_percentage_24h: change,
    sparkline_in_7d: { price: sparkline },
  };
}

function mockCoinGeckoResponse(data: unknown) {
  mockFetch(data);
}

describe('GET /api/crypto', () => {
  it('fetches bitcoin and ethereum by default when no ids param is given', async () => {
    mockCoinGeckoResponse([
      market('bitcoin', { price: 50000, change: 2.5 }),
      market('ethereum', { price: 3000, change: -1.2 }),
    ]);

    const req = new NextRequest('http://localhost/api/crypto');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('ids=bitcoin%2Cethereum'),
      expect.anything(),
    );
    expect(json.prices).toHaveLength(2);
  });

  it('requests the markets endpoint with sparkline data', async () => {
    mockCoinGeckoResponse([market('bitcoin')]);

    const req = new NextRequest('http://localhost/api/crypto?ids=bitcoin');
    await GET(req);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/coins/markets?vs_currency=usd'),
      expect.anything(),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('sparkline=true'),
      expect.anything(),
    );
  });

  it('fetches custom ids when provided', async () => {
    mockCoinGeckoResponse([market('solana')]);

    const req = new NextRequest('http://localhost/api/crypto?ids=solana');
    await GET(req);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('ids=solana'),
      expect.anything(),
    );
  });

  it('trims whitespace from ids', async () => {
    mockCoinGeckoResponse([market('bitcoin'), market('dogecoin')]);

    const req = new NextRequest('http://localhost/api/crypto?ids=%20bitcoin%20%2C%20dogecoin%20');
    await GET(req);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('ids=bitcoin%2Cdogecoin'),
      expect.anything(),
    );
  });

  it('filters out empty strings from ids', async () => {
    mockCoinGeckoResponse([market('bitcoin'), market('ethereum')]);

    const req = new NextRequest('http://localhost/api/crypto?ids=bitcoin,,ethereum');
    await GET(req);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('ids=bitcoin%2Cethereum'),
      expect.anything(),
    );
  });

  it('returns correct shape with id, name, price, change24h, and sparkline', async () => {
    mockCoinGeckoResponse([
      market('bitcoin', { name: 'Bitcoin', price: 50000, change: 2.5, sparkline: [49000, 49500, 50000] }),
      market('ethereum', { name: 'Ethereum', price: 3000, change: -1.23 }),
    ]);

    const req = new NextRequest('http://localhost/api/crypto');
    const res = await GET(req);
    const json = await res.json();

    expect(json.prices).toEqual([
      { id: 'bitcoin', name: 'Bitcoin', price: 50000, change24h: 2.5, sparkline: [49000, 49500, 50000] },
      { id: 'ethereum', name: 'Ethereum', price: 3000, change24h: -1.23, sparkline: [] },
    ]);
  });

  it('uses the API-provided display name', async () => {
    mockCoinGeckoResponse([market('avalanche-2', { name: 'Avalanche' })]);

    const req = new NextRequest('http://localhost/api/crypto?ids=avalanche-2');
    const res = await GET(req);
    const json = await res.json();

    expect(json.prices[0].name).toBe('Avalanche');
  });

  it('falls back to a capitalized id when the name is missing', async () => {
    mockCoinGeckoResponse([{ id: 'solana', current_price: 100, price_change_percentage_24h: 0 }]);

    const req = new NextRequest('http://localhost/api/crypto?ids=solana');
    const res = await GET(req);
    const json = await res.json();

    expect(json.prices[0].name).toBe('Solana');
    expect(json.prices[0].sparkline).toEqual([]);
  });

  it('restores the requested id order over market-cap order', async () => {
    mockCoinGeckoResponse([market('bitcoin'), market('dogecoin')]);

    const req = new NextRequest('http://localhost/api/crypto?ids=dogecoin,bitcoin');
    const res = await GET(req);
    const json = await res.json();

    expect(json.prices.map((p: { id: string }) => p.id)).toEqual(['dogecoin', 'bitcoin']);
  });

  it('drops non-finite sparkline entries and trims precision to 6 significant digits', async () => {
    mockCoinGeckoResponse([
      market('bitcoin', { sparkline: [50123.456789, null, 'bad', 50200.987654] }),
    ]);

    const req = new NextRequest('http://localhost/api/crypto?ids=bitcoin');
    const res = await GET(req);
    const json = await res.json();

    expect(json.prices[0].sparkline).toEqual([50123.5, 50201]);
  });

  it('rounds change24h to 2 decimal places', async () => {
    mockCoinGeckoResponse([market('bitcoin', { price: 50000, change: 2.456789 })]);

    const req = new NextRequest('http://localhost/api/crypto?ids=bitcoin');
    const res = await GET(req);
    const json = await res.json();

    expect(json.prices[0].change24h).toBe(2.46);
  });

  it('defaults change24h to 0 when price_change_percentage_24h is null', async () => {
    mockCoinGeckoResponse([market('bitcoin', { price: 50000, change: null })]);

    const req = new NextRequest('http://localhost/api/crypto?ids=bitcoin');
    const res = await GET(req);
    const json = await res.json();

    expect(json.prices[0].change24h).toBe(0);
  });

  it('returns 502 when CoinGecko returns a non-ok response', async () => {
    mockFetchError(429);

    const req = new NextRequest('http://localhost/api/crypto');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toEqual({ error: 'Failed to fetch crypto prices' });
  });

  it('returns 500 via errorResponse when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('DNS resolution failed')));

    const req = new NextRequest('http://localhost/api/crypto');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toMatchObject({ error: 'Failed to fetch crypto prices' });
  });
});
