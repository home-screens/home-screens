import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const dummyRequest = new NextRequest('http://localhost/api/history');

function makeMuffinLabsResponse(events: Array<{ year: string; text: string }>) {
  return {
    date: 'March 9',
    url: 'https://history.muffinlabs.com/date/3/9',
    data: {
      Events: events.map((e) => ({
        year: e.year,
        text: e.text,
        links: [{ title: 'Wikipedia', link: `https://en.wikipedia.org/wiki/${e.text}` }],
      })),
      Births: [],
      Deaths: [],
    },
  };
}

function makeWikipediaResponse(events: Array<{ year: number; text: string }>) {
  return {
    events: events.map((e) => ({
      year: e.year,
      text: e.text,
      pages: [{ title: e.text }],
    })),
  };
}

function mockBothSources(
  muffinEvents: Array<{ year: string; text: string }>,
  wikiEvents: Array<{ year: number; text: string }>,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('history.muffinlabs.com')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeMuffinLabsResponse(muffinEvents)),
        });
      }
      if (url.includes('wikimedia.org')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeWikipediaResponse(wikiEvents)),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    }),
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

  async function importGET() {
    const mod = await import('@/app/api/history/route');
    return mod.GET;
  }

  it('returns events from both sources with source field', async () => {
    mockBothSources(
      [{ year: '1959', text: 'Barbie doll goes on sale' }],
      [{ year: 1916, text: 'Pancho Villa leads a raid' }],
    );

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events).toHaveLength(2);

    const sources = json.events.map((e: { source: string }) => e.source).sort();
    expect(sources).toEqual(['muffinlabs', 'wikipedia']);

    const years = json.events.map((e: { year: string }) => e.year).sort();
    expect(years).toEqual(['1916', '1959']);
  });

  it('deduplicates events by year, preferring Wikipedia', async () => {
    mockBothSources(
      [{ year: '1959', text: 'MuffinLabs version of 1959 event' }],
      [{ year: 1959, text: 'Wikipedia version of 1959 event' }],
    );

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(json.events).toHaveLength(1);
    expect(json.events[0].source).toBe('wikipedia');
    expect(json.events[0].text).toBe('Wikipedia version of 1959 event');
  });

  it('returns events from MuffinLabs alone when Wikipedia fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('history.muffinlabs.com')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve(
                makeMuffinLabsResponse([{ year: '2000', text: 'Something happened' }]),
              ),
          });
        }
        return Promise.reject(new Error('ECONNREFUSED'));
      }),
    );

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events).toHaveLength(1);
    expect(json.events[0].source).toBe('muffinlabs');
  });

  it('returns events from Wikipedia alone when MuffinLabs fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('wikimedia.org')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve(
                makeWikipediaResponse([{ year: 2020, text: 'Wiki event' }]),
              ),
          });
        }
        return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
      }),
    );

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events).toHaveLength(1);
    expect(json.events[0].source).toBe('wikipedia');
  });

  it('returns empty events when both sources fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.events).toEqual([]);
  });

  it('limits each source to 10 events', async () => {
    const muffinEvents = Array.from({ length: 15 }, (_, i) => ({
      year: `${1900 + i}`,
      text: `MuffinLabs Event ${i + 1}`,
    }));
    const wikiEvents = Array.from({ length: 15 }, (_, i) => ({
      year: 1950 + i,
      text: `Wikipedia Event ${i + 1}`,
    }));
    mockBothSources(muffinEvents, wikiEvents);

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    // 10 from each source, all unique years → 20 total
    expect(json.events.length).toBeLessThanOrEqual(20);
    expect(json.events.length).toBeGreaterThanOrEqual(10);
  });

  it('fetches Wikipedia with correct date path', async () => {
    mockBothSources([], []);

    const GET = await importGET();
    await GET(dummyRequest);

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const wikiCall = calls.find((c: string[]) => c[0].includes('wikimedia.org'));
    expect(wikiCall).toBeDefined();
    expect(wikiCall![0]).toContain('/03/09');
  });

  it('serves cached response on second call for the same day', async () => {
    mockBothSources(
      [{ year: '1999', text: 'Cached event' }],
      [{ year: 2001, text: 'Wiki cached' }],
    );

    const GET = await importGET();

    const response1 = await GET(dummyRequest);
    const json1 = await response1.json();
    expect(json1.events.length).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(2); // both sources

    const response2 = await GET(dummyRequest);
    const json2 = await response2.json();
    expect(json2.events).toEqual(json1.events);
    expect(fetch).toHaveBeenCalledTimes(2); // not called again
  });

  it('only fetches MuffinLabs when sources=muffinlabs', async () => {
    mockBothSources(
      [{ year: '1959', text: 'Barbie doll goes on sale' }],
      [{ year: 1916, text: 'Pancho Villa leads a raid' }],
    );

    const GET = await importGET();
    const request = new NextRequest('http://localhost/api/history?sources=muffinlabs');
    const response = await GET(request);
    const json = await response.json();

    expect(json.events).toHaveLength(1);
    expect(json.events[0].source).toBe('muffinlabs');
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.every((c: string[]) => !c[0].includes('wikimedia.org'))).toBe(true);
  });

  it('only fetches Wikipedia when sources=wikipedia', async () => {
    mockBothSources(
      [{ year: '1959', text: 'Barbie doll goes on sale' }],
      [{ year: 1916, text: 'Pancho Villa leads a raid' }],
    );

    const GET = await importGET();
    const request = new NextRequest('http://localhost/api/history?sources=wikipedia');
    const response = await GET(request);
    const json = await response.json();

    expect(json.events).toHaveLength(1);
    expect(json.events[0].source).toBe('wikipedia');
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.every((c: string[]) => !c[0].includes('muffinlabs.com'))).toBe(true);
  });
});
