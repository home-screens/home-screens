import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { GET, cache } from '@/app/api/jokes/route';

const dummyRequest = new NextRequest('http://localhost/api/jokes');

function mockFetchSuccess(joke: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 'abc123', joke, status: 200 }),
      }),
    ),
  );
}

function mockFetchUpstreamFailure(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: false,
        status,
        json: () => Promise.resolve({}),
      }),
    ),
  );
}

function mockFetchNetworkError(message: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error(message))),
  );
}

describe('GET /api/jokes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cache.clear();
  });

  it('returns a joke on successful upstream response', async () => {
    mockFetchSuccess('Why did the scarecrow win an award? He was outstanding in his field.');

    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ joke: 'Why did the scarecrow win an award? He was outstanding in his field.' });
  });

  it('returns only the joke field, stripping other upstream data', async () => {
    mockFetchSuccess('Test joke');

    const response = await GET(dummyRequest);
    const json = await response.json();

    // Should not include id, status, or other fields from the upstream API
    expect(Object.keys(json)).toEqual(['joke']);
  });

  it('sends correct URL and Accept header to upstream API', async () => {
    mockFetchSuccess('A joke');

    await GET(dummyRequest);

    expect(fetch).toHaveBeenCalledWith('https://icanhazdadjoke.com', expect.objectContaining({
      headers: { Accept: 'application/json' },
    }));
  });

  it('returns 502 when upstream API returns non-ok response', async () => {
    mockFetchUpstreamFailure(503);

    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual({ error: 'Failed to fetch joke' });
  });

  it('returns 502 when upstream returns 429 (rate limited)', async () => {
    mockFetchUpstreamFailure(429);

    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual({ error: 'Failed to fetch joke' });
  });

  it('returns 500 with error message when network request fails', async () => {
    mockFetchNetworkError('DNS resolution failed');

    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toMatchObject({ error: 'Failed to fetch joke' });
  });

  it('returns 500 with fallback message for non-Error throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject('string error')),
    );

    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'Failed to fetch joke' });
  });
});
