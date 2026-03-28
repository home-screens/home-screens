import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const dummyRequest = new NextRequest('http://localhost/api/history');

function makeHistoryEvent(year: string, text: string) {
  return { year, text, links: [{ title: 'Wikipedia', link: `https://en.wikipedia.org/wiki/${text}` }] };
}

function makeHistoryResponse(events: Array<{ year: string; text: string }>) {
  return {
    date: 'March 9',
    url: 'https://history.muffinlabs.com/date/3/9',
    data: {
      Events: events.map((e) => makeHistoryEvent(e.year, e.text)),
      Births: [],
      Deaths: [],
    },
  };
}

function mockFetchSuccess(events: Array<{ year: string; text: string }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(makeHistoryResponse(events)),
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

describe('GET /api/history', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // We need to import after each reset to get a fresh module with an empty cache
  async function importGET() {
    const mod = await import('@/app/api/history/route');
    return mod.GET;
  }

  it('returns events with year and text from upstream', async () => {
    const events = [
      { year: '1959', text: 'Barbie doll goes on sale' },
      { year: '1916', text: 'Pancho Villa leads a raid' },
    ];
    mockFetchSuccess(events);

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events).toEqual([
      { year: '1959', text: 'Barbie doll goes on sale' },
      { year: '1916', text: 'Pancho Villa leads a raid' },
    ]);
  });

  it('limits events to 10 even when upstream returns more', async () => {
    const events = Array.from({ length: 15 }, (_, i) => ({
      year: `${1900 + i}`,
      text: `Event ${i + 1}`,
    }));
    mockFetchSuccess(events);

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(json.events).toHaveLength(10);
    expect(json.events[0].year).toBe('1900');
    expect(json.events[9].year).toBe('1909');
  });

  it('maps only year and text fields, stripping links and other data', async () => {
    mockFetchSuccess([{ year: '2000', text: 'Something happened' }]);

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    const event = json.events[0];
    expect(Object.keys(event)).toEqual(['year', 'text']);
  });

  it('returns empty events array when upstream has no Events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: {} }),
        }),
      ),
    );

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events).toEqual([]);
  });

  it('returns 502 when upstream API returns non-ok response', async () => {
    mockFetchUpstreamFailure(503);

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual({ error: 'Failed to fetch historical events' });
  });

  it('returns 500 with error message when network request fails', async () => {
    mockFetchNetworkError('ECONNREFUSED');

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'Failed to fetch historical events' });
  });

  it('sends correct URL and Accept header to upstream API', async () => {
    mockFetchSuccess([{ year: '2020', text: 'Test' }]);

    const GET = await importGET();
    await GET(dummyRequest);

    expect(fetch).toHaveBeenCalledWith('https://history.muffinlabs.com/date', expect.objectContaining({
      headers: { Accept: 'application/json' },
    }));
  });

  it('serves cached response on second call for the same day', async () => {
    mockFetchSuccess([{ year: '1999', text: 'Cached event' }]);

    const GET = await importGET();

    // First call fetches from upstream
    const response1 = await GET(dummyRequest);
    const json1 = await response1.json();
    expect(json1.events).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const response2 = await GET(dummyRequest);
    const json2 = await response2.json();
    expect(json2.events).toEqual([{ year: '1999', text: 'Cached event' }]);
    expect(fetch).toHaveBeenCalledTimes(1); // not called again
  });
});

// afterEach must be at module level for the describe block above
import { afterEach } from 'vitest';
