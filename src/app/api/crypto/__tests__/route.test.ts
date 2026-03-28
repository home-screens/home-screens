import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { GET, cache } from '@/app/api/crypto/route';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  cache.clear();
});

function mockCoinGeckoResponse(data: Record<string, unknown>) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => data,
  });
}

describe('GET /api/crypto', () => {
  it('fetches bitcoin and ethereum by default when no ids param is given', async () => {
    mockCoinGeckoResponse({
      bitcoin: { usd: 50000, usd_24h_change: 2.5 },
      ethereum: { usd: 3000, usd_24h_change: -1.2 },
    });

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

  it('fetches custom ids when provided', async () => {
    mockCoinGeckoResponse({
      solana: { usd: 100, usd_24h_change: 5.0 },
    });

    const req = new NextRequest('http://localhost/api/crypto?ids=solana');
    await GET(req);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('ids=solana'),
      expect.anything(),
    );
  });

  it('trims whitespace from ids', async () => {
    mockCoinGeckoResponse({
      bitcoin: { usd: 50000, usd_24h_change: 0 },
      dogecoin: { usd: 0.08, usd_24h_change: 1.1 },
    });

    const req = new NextRequest('http://localhost/api/crypto?ids=%20bitcoin%20%2C%20dogecoin%20');
    await GET(req);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('ids=bitcoin%2Cdogecoin'),
      expect.anything(),
    );
  });

  it('filters out empty strings from ids', async () => {
    mockCoinGeckoResponse({
      bitcoin: { usd: 50000, usd_24h_change: 0 },
      ethereum: { usd: 3000, usd_24h_change: 0 },
    });

    const req = new NextRequest('http://localhost/api/crypto?ids=bitcoin,,ethereum');
    await GET(req);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('ids=bitcoin%2Cethereum'),
      expect.anything(),
    );
  });

  it('returns correct shape with id, capitalized name, price, and change24h', async () => {
    mockCoinGeckoResponse({
      bitcoin: { usd: 50000, usd_24h_change: 2.5 },
      ethereum: { usd: 3000, usd_24h_change: -1.23 },
    });

    const req = new NextRequest('http://localhost/api/crypto');
    const res = await GET(req);
    const json = await res.json();

    expect(json.prices).toEqual(
      expect.arrayContaining([
        { id: 'bitcoin', name: 'Bitcoin', price: 50000, change24h: 2.5 },
        { id: 'ethereum', name: 'Ethereum', price: 3000, change24h: -1.23 },
      ]),
    );
  });

  it('capitalizes the first letter of each coin name', async () => {
    mockCoinGeckoResponse({
      solana: { usd: 100, usd_24h_change: 0 },
      cardano: { usd: 0.5, usd_24h_change: 0 },
    });

    const req = new NextRequest('http://localhost/api/crypto?ids=solana,cardano');
    const res = await GET(req);
    const json = await res.json();

    const names = json.prices.map((p: { name: string }) => p.name);
    expect(names).toContain('Solana');
    expect(names).toContain('Cardano');
  });

  it('rounds change24h to 2 decimal places', async () => {
    mockCoinGeckoResponse({
      bitcoin: { usd: 50000, usd_24h_change: 2.456789 },
    });

    const req = new NextRequest('http://localhost/api/crypto?ids=bitcoin');
    const res = await GET(req);
    const json = await res.json();

    expect(json.prices[0].change24h).toBe(2.46);
  });

  it('defaults change24h to 0 when usd_24h_change is null', async () => {
    mockCoinGeckoResponse({
      bitcoin: { usd: 50000, usd_24h_change: null },
    });

    const req = new NextRequest('http://localhost/api/crypto?ids=bitcoin');
    const res = await GET(req);
    const json = await res.json();

    expect(json.prices[0].change24h).toBe(0);
  });

  it('defaults change24h to 0 when usd_24h_change is undefined', async () => {
    mockCoinGeckoResponse({
      bitcoin: { usd: 50000 },
    });

    const req = new NextRequest('http://localhost/api/crypto?ids=bitcoin');
    const res = await GET(req);
    const json = await res.json();

    expect(json.prices[0].change24h).toBe(0);
  });

  it('returns 502 when CoinGecko returns a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });

    const req = new NextRequest('http://localhost/api/crypto');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toEqual({ error: 'Failed to fetch crypto prices' });
  });

  it('returns 500 via errorResponse when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('DNS resolution failed'));

    const req = new NextRequest('http://localhost/api/crypto');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: 'Failed to fetch crypto prices' });
  });
});
