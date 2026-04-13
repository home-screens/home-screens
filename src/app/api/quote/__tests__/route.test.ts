import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockFetch, mockFetchError, silenceConsole } from '@/test-utils';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { GET, cache } from '@/app/api/quote/route';

silenceConsole();

const dummyRequest = new NextRequest('http://localhost/api/quote');

function makeZenQuotesResponse(quote: string, author: string) {
  return [{ q: quote, a: author, h: '<blockquote>...</blockquote>' }];
}

function mockFetchSuccess(quote: string, author: string) {
  mockFetch(makeZenQuotesResponse(quote, author));
}

function mockFetchUpstreamFailure(status: number) {
  mockFetchError(status);
}

function mockFetchNetworkError(message: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error(message))),
  );
}

describe('GET /api/quote', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cache.clear();
  });

  it('returns quote and author from the first array element', async () => {
    mockFetchSuccess('The only way to do great work is to love what you do.', 'Steve Jobs');

    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      quote: 'The only way to do great work is to love what you do.',
      author: 'Steve Jobs',
    });
  });

  it('extracts only quote and author, not other upstream fields', async () => {
    mockFetchSuccess('Test quote', 'Test Author');

    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(Object.keys(json)).toEqual(['quote', 'author']);
  });

  it('calls the correct ZenQuotes API URL', async () => {
    mockFetchSuccess('Quote', 'Author');

    await GET(dummyRequest);

    expect(fetch).toHaveBeenCalledWith('https://zenquotes.io/api/random', expect.anything());
  });

  it('returns 502 when upstream API returns non-ok response', async () => {
    mockFetchUpstreamFailure(500);

    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual({ error: 'Failed to fetch quote' });
  });

  it('returns 502 when upstream returns 403 (forbidden)', async () => {
    mockFetchUpstreamFailure(403);

    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual({ error: 'Failed to fetch quote' });
  });

  it('returns 500 with error message when network request fails', async () => {
    mockFetchNetworkError('Connection timed out');

    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toMatchObject({ error: 'Failed to fetch quote' });
  });

  it('returns 500 with fallback message for non-Error throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(null)),
    );

    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'Failed to fetch quote' });
  });
});
