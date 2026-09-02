import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

// Helper to build an ESPN event object
function makeEspnEvent(
  overrides: {
    id?: string;
    date?: string;
    homeTeam?: string;
    awayTeam?: string;
    homeScore?: string;
    awayScore?: string;
    status?: string;
    competitors?: unknown[] | null;
  } = {},
) {
  const {
    id = '401547417',
    date = '2024-01-15T01:00Z',
    homeTeam = 'Lakers',
    awayTeam = 'Celtics',
    homeScore = '110',
    awayScore = '105',
    status = 'Final',
    competitors,
  } = overrides;

  const defaultCompetitors = [
    { homeAway: 'home', team: { displayName: homeTeam }, score: homeScore },
    { homeAway: 'away', team: { displayName: awayTeam }, score: awayScore },
  ];

  return {
    id,
    date,
    competitions: [{ competitors: competitors ?? defaultCompetitors }],
    status: { type: { description: status } },
  };
}

function makeEspnResponse(events: unknown[]) {
  return { events };
}

function mockFetchSuccess(responsesByUrl: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      for (const [pattern, body] of Object.entries(responsesByUrl)) {
        if (url.includes(pattern)) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(body),
          });
        }
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ events: [] }),
      });
    }),
  );
}

// We use dynamic imports + vi.resetModules() so the module-level cache
// is fresh for every test.
async function importRoute() {
  const mod = await import('../route');
  return mod;
}

describe('sports API route', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ----------------------------------------------------------------
  // LEAGUE_MAP coverage
  // ----------------------------------------------------------------
  describe('LEAGUE_MAP routing', () => {
    const leagueToPath: [string, string][] = [
      ['nfl', 'football/nfl'],
      ['nba', 'basketball/nba'],
      ['mlb', 'baseball/mlb'],
      ['nhl', 'hockey/nhl'],
      ['mls', 'soccer/usa.1'],
      ['epl', 'soccer/eng.1'],
    ];

    it.each(leagueToPath)(
      'fetches the correct ESPN path for %s',
      async (league, expectedPath) => {
        mockFetchSuccess({
          [expectedPath]: makeEspnResponse([
            makeEspnEvent({ id: `${league}-1` }),
          ]),
        });

        const { GET } = await importRoute();
        const req = new NextRequest(
          `http://localhost/api/sports?leagues=${league}`,
        );
        const res = await GET(req);
        const json = await res.json();

        expect(json.games).toHaveLength(1);
        expect(json.games[0].league).toBe(league.toUpperCase());

        const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(fetchCall).toContain(expectedPath);
      },
    );
  });

  // ----------------------------------------------------------------
  // Data transformation
  // ----------------------------------------------------------------
  describe('ESPN data transformation', () => {
    it('parses a standard game correctly', async () => {
      mockFetchSuccess({
        'basketball/nba': makeEspnResponse([
          makeEspnEvent({
            id: '100',
            date: '2024-03-01T19:30Z',
            homeTeam: 'Warriors',
            awayTeam: 'Nuggets',
            homeScore: '118',
            awayScore: '112',
            status: 'Final',
          }),
        ]),
      });

      const { GET } = await importRoute();
      const req = new NextRequest(
        'http://localhost/api/sports?leagues=nba',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(json.games).toEqual([
        {
          id: '100',
          league: 'NBA',
          homeTeam: 'Warriors',
          awayTeam: 'Nuggets',
          homeTeamAbbr: '',
          awayTeamAbbr: '',
          homeTeamLogo: '',
          awayTeamLogo: '',
          homeTeamColor: '666666',
          awayTeamColor: '666666',
          homeScore: 118,
          awayScore: 112,
          homeRecord: '',
          awayRecord: '',
          status: 'Final',
          detail: '',
          state: 'pre',
          startTime: '2024-03-01T19:30Z',
          broadcast: '',
        },
      ]);
    });

    it('converts string scores to numbers', async () => {
      mockFetchSuccess({
        'basketball/nba': makeEspnResponse([
          makeEspnEvent({ homeScore: '99', awayScore: '101' }),
        ]),
      });

      const { GET } = await importRoute();
      const req = new NextRequest(
        'http://localhost/api/sports?leagues=nba',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(typeof json.games[0].homeScore).toBe('number');
      expect(typeof json.games[0].awayScore).toBe('number');
      expect(json.games[0].homeScore).toBe(99);
      expect(json.games[0].awayScore).toBe(101);
    });

    it('uppercases the league name in response', async () => {
      mockFetchSuccess({
        'football/nfl': makeEspnResponse([makeEspnEvent()]),
      });

      const { GET } = await importRoute();
      const req = new NextRequest(
        'http://localhost/api/sports?leagues=nfl',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(json.games[0].league).toBe('NFL');
    });

    it('returns multiple games from a single league', async () => {
      mockFetchSuccess({
        'basketball/nba': makeEspnResponse([
          makeEspnEvent({ id: '1', homeTeam: 'Lakers', awayTeam: 'Celtics' }),
          makeEspnEvent({ id: '2', homeTeam: 'Heat', awayTeam: 'Bucks' }),
        ]),
      });

      const { GET } = await importRoute();
      const req = new NextRequest(
        'http://localhost/api/sports?leagues=nba',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(json.games).toHaveLength(2);
      expect(json.games[0].id).toBe('1');
      expect(json.games[1].id).toBe('2');
    });
  });

  // ----------------------------------------------------------------
  // Missing / malformed data defaults
  // ----------------------------------------------------------------
  describe('missing data defaults', () => {
    it('defaults to TBD when competitors are missing entirely', async () => {
      const eventNoCompetitors = {
        id: '200',
        date: '2024-06-01T20:00Z',
        competitions: [{ competitors: [] }],
        status: { type: { description: 'Scheduled' } },
      };

      mockFetchSuccess({
        'basketball/nba': makeEspnResponse([eventNoCompetitors]),
      });

      const { GET } = await importRoute();
      const req = new NextRequest(
        'http://localhost/api/sports?leagues=nba',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(json.games[0].homeTeam).toBe('TBD');
      expect(json.games[0].awayTeam).toBe('TBD');
      expect(json.games[0].homeScore).toBe(0);
      expect(json.games[0].awayScore).toBe(0);
    });

    it('defaults to TBD when team object is missing', async () => {
      const eventNoTeam = {
        id: '201',
        date: '2024-06-01T20:00Z',
        competitions: [{
          competitors: [
            { homeAway: 'home', score: '50' },
            { homeAway: 'away', score: '45' },
          ],
        }],
        status: { type: { description: 'In Progress' } },
      };

      mockFetchSuccess({
        'basketball/nba': makeEspnResponse([eventNoTeam]),
      });

      const { GET } = await importRoute();
      const req = new NextRequest(
        'http://localhost/api/sports?leagues=nba',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(json.games[0].homeTeam).toBe('TBD');
      expect(json.games[0].awayTeam).toBe('TBD');
      // Scores still parsed since they're on the competitor
      expect(json.games[0].homeScore).toBe(50);
      expect(json.games[0].awayScore).toBe(45);
    });

    it('defaults score to 0 when score is missing', async () => {
      const eventNoScore = {
        id: '202',
        date: '2024-06-01T20:00Z',
        competitions: [{
          competitors: [
            { homeAway: 'home', team: { displayName: 'Team A' } },
            { homeAway: 'away', team: { displayName: 'Team B' } },
          ],
        }],
        status: { type: { description: 'Scheduled' } },
      };

      mockFetchSuccess({
        'basketball/nba': makeEspnResponse([eventNoScore]),
      });

      const { GET } = await importRoute();
      const req = new NextRequest(
        'http://localhost/api/sports?leagues=nba',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(json.games[0].homeScore).toBe(0);
      expect(json.games[0].awayScore).toBe(0);
      expect(json.games[0].homeTeam).toBe('Team A');
      expect(json.games[0].awayTeam).toBe('Team B');
    });

    it('defaults status to Scheduled when status is missing', async () => {
      const eventNoStatus = {
        id: '203',
        date: '2024-06-01T20:00Z',
        competitions: [{
          competitors: [
            { homeAway: 'home', team: { displayName: 'Team A' }, score: '0' },
            { homeAway: 'away', team: { displayName: 'Team B' }, score: '0' },
          ],
        }],
        // no status field at all
      };

      mockFetchSuccess({
        'basketball/nba': makeEspnResponse([eventNoStatus]),
      });

      const { GET } = await importRoute();
      const req = new NextRequest(
        'http://localhost/api/sports?leagues=nba',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(json.games[0].status).toBe('Scheduled');
    });

    it('defaults status when status.type is missing', async () => {
      const eventPartialStatus = {
        id: '204',
        date: '2024-06-01T20:00Z',
        competitions: [{
          competitors: [
            { homeAway: 'home', team: { displayName: 'Team A' }, score: '0' },
            { homeAway: 'away', team: { displayName: 'Team B' }, score: '0' },
          ],
        }],
        status: {},
      };

      mockFetchSuccess({
        'basketball/nba': makeEspnResponse([eventPartialStatus]),
      });

      const { GET } = await importRoute();
      const req = new NextRequest(
        'http://localhost/api/sports?leagues=nba',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(json.games[0].status).toBe('Scheduled');
    });

    it('handles missing competitions array', async () => {
      const eventNoCompetitions = {
        id: '205',
        date: '2024-06-01T20:00Z',
        // no competitions field
        status: { type: { description: 'Scheduled' } },
      };

      mockFetchSuccess({
        'basketball/nba': makeEspnResponse([eventNoCompetitions]),
      });

      const { GET } = await importRoute();
      const req = new NextRequest(
        'http://localhost/api/sports?leagues=nba',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(json.games[0].homeTeam).toBe('TBD');
      expect(json.games[0].awayTeam).toBe('TBD');
      expect(json.games[0].homeScore).toBe(0);
      expect(json.games[0].awayScore).toBe(0);
    });

    it('handles empty events array from ESPN', async () => {
      mockFetchSuccess({
        'basketball/nba': makeEspnResponse([]),
      });

      const { GET } = await importRoute();
      const req = new NextRequest(
        'http://localhost/api/sports?leagues=nba',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(json.games).toEqual([]);
    });

    it('handles missing events key in ESPN response', async () => {
      mockFetchSuccess({
        'basketball/nba': {},
      });

      const { GET } = await importRoute();
      const req = new NextRequest(
        'http://localhost/api/sports?leagues=nba',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(json.games).toEqual([]);
    });
  });

  // ----------------------------------------------------------------
  // Multiple leagues and unknown leagues
  // ----------------------------------------------------------------
  describe('multiple and unknown leagues', () => {
    it('returns games from multiple leagues flattened', async () => {
      mockFetchSuccess({
        'basketball/nba': makeEspnResponse([
          makeEspnEvent({ id: 'nba-1', homeTeam: 'Lakers', awayTeam: 'Celtics' }),
        ]),
        'football/nfl': makeEspnResponse([
          makeEspnEvent({ id: 'nfl-1', homeTeam: 'Chiefs', awayTeam: 'Eagles' }),
          makeEspnEvent({ id: 'nfl-2', homeTeam: 'Bills', awayTeam: 'Dolphins' }),
        ]),
      });

      const { GET } = await importRoute();
      const req = new NextRequest(
        'http://localhost/api/sports?leagues=nba,nfl',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(json.games).toHaveLength(3);
      expect(json.games.map((g: { league: string }) => g.league)).toContain('NBA');
      expect(json.games.map((g: { league: string }) => g.league)).toContain('NFL');
    });

    it('returns empty for an unknown league without erroring', async () => {
      mockFetchSuccess({
        'basketball/nba': makeEspnResponse([
          makeEspnEvent({ id: 'nba-1' }),
        ]),
      });

      const { GET } = await importRoute();
      const req = new NextRequest(
        'http://localhost/api/sports?leagues=nba,curling',
      );
      const res = await GET(req);
      const json = await res.json();

      // Only NBA game, curling returns []
      expect(json.games).toHaveLength(1);
      expect(json.games[0].league).toBe('NBA');
      // fetch should only be called once (for nba), not for curling
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('returns empty games array when all leagues are unknown', async () => {
      mockFetchSuccess({});

      const { GET } = await importRoute();
      const req = new NextRequest(
        'http://localhost/api/sports?leagues=curling,quidditch',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(json.games).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------
  // Default leagues parameter
  // ----------------------------------------------------------------
  describe('default leagues parameter', () => {
    it('uses nfl,nba when no leagues param provided', async () => {
      mockFetchSuccess({
        'football/nfl': makeEspnResponse([
          makeEspnEvent({ id: 'nfl-1' }),
        ]),
        'basketball/nba': makeEspnResponse([
          makeEspnEvent({ id: 'nba-1' }),
        ]),
      });

      const { GET } = await importRoute();
      const req = new NextRequest('http://localhost/api/sports');
      const res = await GET(req);
      const json = await res.json();

      expect(json.games).toHaveLength(2);
      const leagues = json.games.map((g: { league: string }) => g.league).sort();
      expect(leagues).toEqual(['NBA', 'NFL']);
    });
  });

  // ----------------------------------------------------------------
  // Cache behavior
  // ----------------------------------------------------------------
  describe('caching', () => {
    it('serves cached data within TTL (fetch called only once)', async () => {
      mockFetchSuccess({
        'basketball/nba': makeEspnResponse([
          makeEspnEvent({ id: 'nba-1', homeScore: '100', awayScore: '95' }),
        ]),
      });

      const { GET } = await importRoute();

      // First call - fetches from ESPN
      const req1 = new NextRequest('http://localhost/api/sports?leagues=nba');
      const res1 = await GET(req1);
      const json1 = await res1.json();
      expect(json1.games).toHaveLength(1);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Advance time but stay within TTL
      vi.advanceTimersByTime(30_000);

      // Second call - should use cache
      const req2 = new NextRequest('http://localhost/api/sports?leagues=nba');
      const res2 = await GET(req2);
      const json2 = await res2.json();
      expect(json2.games).toHaveLength(1);
      expect(json2.games[0].homeScore).toBe(100);

      // fetch still only called once
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after TTL expires', async () => {
      mockFetchSuccess({
        'basketball/nba': makeEspnResponse([
          makeEspnEvent({ id: 'nba-1', homeScore: '100', awayScore: '95' }),
        ]),
      });

      const { GET } = await importRoute();

      // First call
      const req1 = new NextRequest('http://localhost/api/sports?leagues=nba');
      await GET(req1);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Advance past TTL (60 seconds)
      vi.advanceTimersByTime(61_000);

      // Second call - cache expired, should re-fetch
      const req2 = new NextRequest('http://localhost/api/sports?leagues=nba');
      await GET(req2);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('uses sorted league key for cache (nba,nfl same as nfl,nba)', async () => {
      mockFetchSuccess({
        'basketball/nba': makeEspnResponse([
          makeEspnEvent({ id: 'nba-1' }),
        ]),
        'football/nfl': makeEspnResponse([
          makeEspnEvent({ id: 'nfl-1' }),
        ]),
      });

      const { GET } = await importRoute();

      // First call: nba,nfl
      const req1 = new NextRequest('http://localhost/api/sports?leagues=nba,nfl');
      await GET(req1);
      expect(fetch).toHaveBeenCalledTimes(2); // one for nba, one for nfl

      // Second call: nfl,nba (reversed order) — should hit cache
      const req2 = new NextRequest('http://localhost/api/sports?leagues=nfl,nba');
      await GET(req2);
      expect(fetch).toHaveBeenCalledTimes(2); // no additional calls
    });
  });

  // ----------------------------------------------------------------
  // Error handling
  // ----------------------------------------------------------------
  describe('error handling', () => {
    it('returns error response when ESPN fetch fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: false,
            status: 400,
            json: () => Promise.resolve({}),
          }),
        ),
      );

      const { GET } = await importRoute();
      const req = new NextRequest('http://localhost/api/sports?leagues=nba');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBeDefined();
    });

    it('returns error response when fetch throws a network error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('Network failure'))),
      );

      const { GET } = await importRoute();
      const req = new NextRequest('http://localhost/api/sports?leagues=nba');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBeDefined();
    });
  });
});
