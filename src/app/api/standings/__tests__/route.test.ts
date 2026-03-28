import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the route handler
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn((...args: unknown[]) => (globalThis.fetch as (...a: unknown[]) => unknown)(...args)),
  };
});

vi.mock('@/lib/espn', () => ({
  LEAGUE_MAP: {
    nfl: 'football/nfl',
    nba: 'basketball/nba',
    wnba: 'basketball/wnba',
    mlb: 'baseball/mlb',
    nhl: 'hockey/nhl',
    mls: 'soccer/usa.1',
    epl: 'soccer/eng.1',
    laliga: 'soccer/esp.1',
    bundesliga: 'soccer/ger.1',
    seriea: 'soccer/ita.1',
    ligue1: 'soccer/fra.1',
    liga_mx: 'soccer/mex.1',
  },
}));

const { GET, cache, colorCache } = await import('@/app/api/standings/route');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface StatInput {
  [key: string]: number | string;
}

function makeTeamEntry(abbr: string, name: string, stats: StatInput) {
  return {
    team: {
      displayName: name,
      abbreviation: abbr,
      shortDisplayName: name.split(' ').pop(),
      name: name.split(' ').pop(),
      logos: [{ href: `https://a.espncdn.com/${abbr}.png` }],
      color: '000000',
    },
    stats: Object.entries(stats).map(([k, v]) => ({
      name: k,
      abbreviation: k,
      value: typeof v === 'number' ? v : undefined,
      displayValue: String(v),
    })),
  };
}

/**
 * Build a realistic ESPN standings API response.
 *
 * - 'flat': single group with standings.entries at root level (soccer-style)
 * - 'conference': children[] each with standings.entries (NBA-style)
 * - 'division': children[] each with sub-children[] that have standings.entries (NFL-style)
 */
function makeESPNStandingsResponse(
  structure: 'flat' | 'conference' | 'division',
  entries: Record<string, unknown>[],
  options?: {
    confNames?: string[];
    divisionLayout?: Record<string, Record<string, unknown>[]>;
  },
) {
  if (structure === 'flat') {
    return {
      name: 'League Table',
      standings: { entries },
    };
  }

  if (structure === 'conference') {
    const confNames = options?.confNames ?? ['Eastern Conference', 'Western Conference'];
    const half = Math.ceil(entries.length / confNames.length);
    return {
      children: confNames.map((name, i) => ({
        name,
        standings: {
          entries: entries.slice(i * half, (i + 1) * half),
        },
      })),
    };
  }

  // 'division' — conferences with division children
  if (options?.divisionLayout) {
    return {
      children: Object.entries(options.divisionLayout).map(([confName, divs]) => ({
        name: confName,
        children: divs.map((div) => ({
          name: div.name,
          standings: { entries: div.entries },
        })),
      })),
    };
  }

  // Default: 2 conferences, 2 divisions each, split entries evenly
  const quarter = Math.ceil(entries.length / 4);
  return {
    children: [
      {
        name: 'American Football Conference',
        children: [
          { name: 'AFC East', standings: { entries: entries.slice(0, quarter) } },
          { name: 'AFC North', standings: { entries: entries.slice(quarter, quarter * 2) } },
        ],
      },
      {
        name: 'National Football Conference',
        children: [
          { name: 'NFC East', standings: { entries: entries.slice(quarter * 2, quarter * 3) } },
          { name: 'NFC North', standings: { entries: entries.slice(quarter * 3) } },
        ],
      },
    ],
  };
}

function makeTeamsResponse(teams: Array<{ abbr: string; color: string }>) {
  return {
    sports: [
      {
        leagues: [
          {
            teams: teams.map((t) => ({
              team: { abbreviation: t.abbr, color: t.color },
            })),
          },
        ],
      },
    ],
  };
}

function makeRequest(league?: string, grouping?: string): NextRequest {
  const params = new URLSearchParams();
  if (league) params.set('league', league);
  if (grouping) params.set('grouping', grouping);
  return new NextRequest(`http://localhost/api/standings?${params}`);
}

/**
 * Helper to set up global.fetch for both the standings API and teams API calls.
 */
function mockFetchCalls(
  standingsData: unknown,
  teamsData?: unknown,
  options?: { standingsOk?: boolean; standingsStatus?: number },
) {
  const ok = options?.standingsOk ?? true;
  const status = options?.standingsStatus ?? 200;
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/teams')) {
      if (!teamsData) return Promise.resolve({ ok: false, status: 500 });
      return Promise.resolve({ ok: true, json: async () => teamsData });
    }
    // standings endpoint
    return Promise.resolve({
      ok,
      status,
      json: async () => standingsData,
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
  cache.clear();
  colorCache.clear();
});

describe('GET /api/standings', () => {
  // =========================================================================
  // Basic validation
  // =========================================================================

  describe('basic validation', () => {
    it('returns 400 for an unknown league', async () => {
      const req = makeRequest('curling');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('Unknown league');
      expect(json.error).toContain('curling');
    });

    it('defaults to NFL when no league param is provided', async () => {
      const buf = makeTeamEntry('BUF', 'Buffalo Bills', {
        wins: 13, losses: 4, playoffSeed: 1, winPercent: 0.765,
        ties: 0, pointsFor: 490, pointsAgainst: 310, pointDifferential: 180,
        streak: 'W5', divisionRecord: '5-1',
      });
      const data = makeESPNStandingsResponse('flat', [buf]);
      mockFetchCalls(data);

      const req = makeRequest(); // no league param
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      // Should have fetched the NFL standings URL
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('football/nfl/standings'),
      );
      expect(json.groups).toBeDefined();
    });
  });

  // =========================================================================
  // Standings parsing
  // =========================================================================

  describe('standings parsing', () => {
    it('parses flat structure (single group, no children)', async () => {
      const arsenal = makeTeamEntry('ARS', 'Arsenal', {
        wins: 22, losses: 3, ties: 5, points: 71, gamesPlayed: 30,
        playoffSeed: 1, winPercent: 0.733, pointsFor: 65, pointsAgainst: 20, pointDifferential: 45,
      });
      const liverpool = makeTeamEntry('LIV', 'Liverpool', {
        wins: 20, losses: 4, ties: 6, points: 66, gamesPlayed: 30,
        playoffSeed: 2, winPercent: 0.667, pointsFor: 60, pointsAgainst: 25, pointDifferential: 35,
      });

      const data = makeESPNStandingsResponse('flat', [liverpool, arsenal]);
      mockFetchCalls(data);

      const req = makeRequest('epl', 'league');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.groups).toHaveLength(1);
      // Arsenal has seed 1, Liverpool seed 2 — sorting by seed puts Arsenal first
      expect(json.groups[0].entries[0].teamAbbr).toBe('ARS');
      expect(json.groups[0].entries[1].teamAbbr).toBe('LIV');
    });

    it('parses hierarchical structure with conferences (no divisions)', async () => {
      const bos = makeTeamEntry('BOS', 'Boston Celtics', {
        wins: 58, losses: 24, playoffSeed: 1, winPercent: 0.707,
        gamesBehind: 0, streak: 'W6', 'Last Ten Games': '8-2',
        homeRecord: '35-6', awayRecord: '23-18', pointDifferential: 550,
      });
      const den = makeTeamEntry('DEN', 'Denver Nuggets', {
        wins: 54, losses: 28, playoffSeed: 1, winPercent: 0.659,
        gamesBehind: 0, streak: 'W3', 'Last Ten Games': '7-3',
        homeRecord: '32-9', awayRecord: '22-19', pointDifferential: 400,
      });

      const data = makeESPNStandingsResponse('conference', [bos, den], {
        confNames: ['Eastern Conference', 'Western Conference'],
      });
      mockFetchCalls(data);

      const req = makeRequest('nba', 'conference');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.groups).toHaveLength(2);
      expect(json.groups[0].name).toBe('Eastern Conference');
      expect(json.groups[0].entries[0].teamAbbr).toBe('BOS');
      expect(json.groups[1].name).toBe('Western Conference');
      expect(json.groups[1].entries[0].teamAbbr).toBe('DEN');
    });

    it('parses conferences with divisions (hierarchical with sub-children)', async () => {
      const buf = makeTeamEntry('BUF', 'Buffalo Bills', {
        wins: 13, losses: 4, playoffSeed: 1, winPercent: 0.765,
        ties: 0, pointsFor: 490, pointsAgainst: 310, pointDifferential: 180,
        streak: 'W5', divisionRecord: '5-1',
      });
      const mia = makeTeamEntry('MIA', 'Miami Dolphins', {
        wins: 11, losses: 6, playoffSeed: 2, winPercent: 0.647,
        ties: 0, pointsFor: 420, pointsAgainst: 350, pointDifferential: 70,
        streak: 'L1', divisionRecord: '4-2',
      });
      const dal = makeTeamEntry('DAL', 'Dallas Cowboys', {
        wins: 12, losses: 5, playoffSeed: 1, winPercent: 0.706,
        ties: 0, pointsFor: 460, pointsAgainst: 330, pointDifferential: 130,
        streak: 'W3', divisionRecord: '5-1',
      });
      const phi = makeTeamEntry('PHI', 'Philadelphia Eagles', {
        wins: 10, losses: 7, playoffSeed: 2, winPercent: 0.588,
        ties: 0, pointsFor: 380, pointsAgainst: 350, pointDifferential: 30,
        streak: 'W1', divisionRecord: '3-3',
      });

      const data = makeESPNStandingsResponse('division', [buf, mia, dal, phi], {
        divisionLayout: {
          'American Football Conference': [
            { name: 'AFC East', entries: [buf, mia] },
          ],
          'National Football Conference': [
            { name: 'NFC East', entries: [dal, phi] },
          ],
        },
      });
      mockFetchCalls(data);

      // Use 'conference' grouping to check conference merging from divisions
      const req = makeRequest('nfl', 'conference');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.groups).toHaveLength(2);
      expect(json.groups[0].name).toBe('American Football Conference');
      expect(json.groups[0].entries).toHaveLength(2);
      expect(json.groups[1].name).toBe('National Football Conference');
      expect(json.groups[1].entries).toHaveLength(2);
    });
  });

  // =========================================================================
  // Sport-specific stats
  // =========================================================================

  describe('sport-specific stats', () => {
    it('NFL entries include ties, pointsFor, pointsAgainst, differential, streak, divRecord', async () => {
      const kc = makeTeamEntry('KC', 'Kansas City Chiefs', {
        wins: 14, losses: 3, ties: 1, playoffSeed: 1, winPercent: 0.824,
        pointsFor: 500, pointsAgainst: 280, pointDifferential: 220,
        streak: 'W8', divisionRecord: '6-0',
      });
      const data = makeESPNStandingsResponse('flat', [kc]);
      mockFetchCalls(data);

      const req = makeRequest('nfl', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entry = json.groups[0].entries[0];

      expect(entry.ties).toBe(1);
      expect(entry.pointsFor).toBe(500);
      expect(entry.pointsAgainst).toBe(280);
      expect(entry.differential).toBe(220);
      expect(entry.streak).toBe('W8');
      expect(entry.divRecord).toBe('6-0');
      // NFL should NOT have these NBA/default stats
      expect(entry.gamesBack).toBeUndefined();
      expect(entry.last10).toBeUndefined();
    });

    it('NHL entries include otLosses, points, streak, homeRecord, awayRecord, last10', async () => {
      const bos = makeTeamEntry('BOS', 'Boston Bruins', {
        wins: 50, losses: 18, otLosses: 8, points: 108, gamesPlayed: 76,
        playoffSeed: 1, winPercent: 0.658,
        streak: 'W4', pointDifferential: 85,
        homeRecord: '28-8-3', awayRecord: '22-10-5', 'Last Ten Games': '7-2-1',
      });
      const data = makeESPNStandingsResponse('flat', [bos]);
      mockFetchCalls(data);

      const req = makeRequest('nhl', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entry = json.groups[0].entries[0];

      expect(entry.otLosses).toBe(8);
      expect(entry.points).toBe(108);
      expect(entry.gamesPlayed).toBe(76);
      expect(entry.streak).toBe('W4');
      expect(entry.differential).toBe(85);
      expect(entry.homeRecord).toBe('28-8-3');
      expect(entry.awayRecord).toBe('22-10-5');
      expect(entry.last10).toBe('7-2-1');
      // NHL should NOT have these
      expect(entry.ties).toBeUndefined();
      expect(entry.gamesBack).toBeUndefined();
    });

    it('Soccer entries include draws, points, gamesPlayed, goalDiff', async () => {
      const manCity = makeTeamEntry('MCI', 'Manchester City', {
        wins: 24, losses: 4, ties: 6, points: 78, gamesPlayed: 34,
        playoffSeed: 1, winPercent: 0.706,
        pointsFor: 80, pointsAgainst: 30, pointDifferential: 50,
      });
      const data = makeESPNStandingsResponse('flat', [manCity]);
      mockFetchCalls(data);

      const req = makeRequest('epl', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entry = json.groups[0].entries[0];

      expect(entry.draws).toBe(6);
      expect(entry.points).toBe(78);
      expect(entry.gamesPlayed).toBe(34);
      expect(entry.pointsFor).toBe(80);
      expect(entry.pointsAgainst).toBe(30);
      expect(entry.goalDiff).toBe(50);
      // Soccer should NOT have these
      expect(entry.otLosses).toBeUndefined();
      expect(entry.gamesBack).toBeUndefined();
      expect(entry.last10).toBeUndefined();
    });

    it('Soccer winPct is calculated as points/(gamesPlayed*3)', async () => {
      const inter = makeTeamEntry('INT', 'Inter Milan', {
        wins: 20, losses: 3, ties: 7, points: 67, gamesPlayed: 30,
        playoffSeed: 1, winPercent: 0.667,
        pointsFor: 55, pointsAgainst: 18, pointDifferential: 37,
      });
      const data = makeESPNStandingsResponse('flat', [inter]);
      mockFetchCalls(data);

      const req = makeRequest('seriea', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entry = json.groups[0].entries[0];

      // winPct should be overridden: 67 / (30*3) = 67/90 ~ 0.7444
      expect(entry.winPct).toBeCloseTo(67 / 90, 4);
    });

    it('NBA/MLB entries include gamesBack, streak, last10, homeRecord, awayRecord, differential', async () => {
      const nyy = makeTeamEntry('NYY', 'New York Yankees', {
        wins: 92, losses: 60, playoffSeed: 1, winPercent: 0.605,
        gamesBehind: 0, streak: 'W4', 'Last Ten Games': '7-3',
        homeRecord: '50-28', awayRecord: '42-32', pointDifferential: 120,
        pointsFor: 750, pointsAgainst: 630,
      });
      const data = makeESPNStandingsResponse('flat', [nyy]);
      mockFetchCalls(data);

      const req = makeRequest('mlb', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entry = json.groups[0].entries[0];

      expect(entry.gamesBack).toBe(0);
      expect(entry.streak).toBe('W4');
      expect(entry.last10).toBe('7-3');
      expect(entry.homeRecord).toBe('50-28');
      expect(entry.awayRecord).toBe('42-32');
      expect(entry.differential).toBe(120);
      expect(entry.pointsFor).toBe(750);
      expect(entry.pointsAgainst).toBe(630);
      // MLB should NOT have these
      expect(entry.ties).toBeUndefined();
      expect(entry.otLosses).toBeUndefined();
      expect(entry.draws).toBeUndefined();
    });

    it('NHL entries fall back to alternative stat names (overtimeLosses, Road, last10Record)', async () => {
      const tor = makeTeamEntry('TOR', 'Toronto Maple Leafs', {
        wins: 42, losses: 26, overtimeLosses: 10, points: 94, gamesPlayed: 78,
        playoffSeed: 3, winPercent: 0.538,
        streak: 'L2', pointsDiff: 30,
        Home: '24-11-5', Road: '18-15-5', last10Record: '6-3-1',
      });
      const data = makeESPNStandingsResponse('flat', [tor]);
      mockFetchCalls(data);

      const req = makeRequest('nhl', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entry = json.groups[0].entries[0];

      expect(entry.otLosses).toBe(10);
      expect(entry.differential).toBe(30);
      expect(entry.homeRecord).toBe('24-11-5');
      expect(entry.awayRecord).toBe('18-15-5');
      expect(entry.last10).toBe('6-3-1');
    });

    it('NBA entries fall back to alternative stat names (Home, Away)', async () => {
      const lal = makeTeamEntry('LAL', 'Los Angeles Lakers', {
        wins: 47, losses: 35, playoffSeed: 7, winPercent: 0.573,
        gamesBehind: 11, streak: 'L1', 'Last Ten Games': '5-5',
        Home: '28-13', Away: '19-22', pointsDiff: -20,
      });
      const data = makeESPNStandingsResponse('flat', [lal]);
      mockFetchCalls(data);

      const req = makeRequest('nba', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entry = json.groups[0].entries[0];

      expect(entry.homeRecord).toBe('28-13');
      expect(entry.awayRecord).toBe('19-22');
      expect(entry.differential).toBe(-20);
    });
  });

  // =========================================================================
  // Sorting
  // =========================================================================

  describe('sorting', () => {
    it('entries are sorted by playoffSeed ascending', async () => {
      const seed3 = makeTeamEntry('TB', 'Tampa Bay Buccaneers', {
        wins: 10, losses: 7, playoffSeed: 3, winPercent: 0.588,
        ties: 0, pointsFor: 350, pointsAgainst: 320, pointDifferential: 30,
      });
      const seed1 = makeTeamEntry('PHI', 'Philadelphia Eagles', {
        wins: 14, losses: 3, playoffSeed: 1, winPercent: 0.824,
        ties: 0, pointsFor: 500, pointsAgainst: 280, pointDifferential: 220,
      });
      const seed2 = makeTeamEntry('DAL', 'Dallas Cowboys', {
        wins: 12, losses: 5, playoffSeed: 2, winPercent: 0.706,
        ties: 0, pointsFor: 450, pointsAgainst: 330, pointDifferential: 120,
      });
      // Feed in wrong order; sorting should fix it
      const data = makeESPNStandingsResponse('flat', [seed3, seed1, seed2]);
      mockFetchCalls(data);

      const req = makeRequest('nfl', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entries = json.groups[0].entries;

      expect(entries[0].teamAbbr).toBe('PHI');
      expect(entries[1].teamAbbr).toBe('DAL');
      expect(entries[2].teamAbbr).toBe('TB');
    });

    it('entries with same playoffSeed are sorted by points descending', async () => {
      const teamA = makeTeamEntry('BOS', 'Boston Bruins', {
        wins: 45, losses: 20, points: 100, playoffSeed: 1, winPercent: 0.692,
        otLosses: 5, gamesPlayed: 70,
      });
      const teamB = makeTeamEntry('TOR', 'Toronto Maple Leafs', {
        wins: 45, losses: 20, points: 105, playoffSeed: 1, winPercent: 0.692,
        otLosses: 5, gamesPlayed: 70,
      });
      const data = makeESPNStandingsResponse('flat', [teamA, teamB]);
      mockFetchCalls(data);

      const req = makeRequest('nhl', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entries = json.groups[0].entries;

      // TOR has 105 points > BOS 100 points, both seed 1
      expect(entries[0].teamAbbr).toBe('TOR');
      expect(entries[1].teamAbbr).toBe('BOS');
    });

    it('entries with same playoffSeed and points are sorted by wins descending', async () => {
      // Use same winPct so the tiebreaker falls through to wins in both
      // sortStandingsEntries and the league-grouping re-sort
      const teamA = makeTeamEntry('CAR', 'Carolina Hurricanes', {
        wins: 48, losses: 22, points: 100, playoffSeed: 2, winPercent: 0.650,
        otLosses: 2, gamesPlayed: 72,
      });
      const teamB = makeTeamEntry('NJ', 'New Jersey Devils', {
        wins: 44, losses: 26, points: 100, playoffSeed: 2, winPercent: 0.650,
        otLosses: 6, gamesPlayed: 76,
      });
      const data = makeESPNStandingsResponse('flat', [teamB, teamA]);
      mockFetchCalls(data);

      const req = makeRequest('nhl', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entries = json.groups[0].entries;

      // Same seed=2, same points=100, same winPct=0.650, CAR has 48 wins > NJ 44 wins
      expect(entries[0].teamAbbr).toBe('CAR');
      expect(entries[1].teamAbbr).toBe('NJ');
    });
  });

  // =========================================================================
  // Grouping modes
  // =========================================================================

  describe('grouping modes', () => {
    // Shared NFL entries for grouping tests
    function makeNFLEntries() {
      return {
        buf: makeTeamEntry('BUF', 'Buffalo Bills', {
          wins: 13, losses: 4, playoffSeed: 1, winPercent: 0.765,
          ties: 0, pointsFor: 490, pointsAgainst: 310, pointDifferential: 180,
          streak: 'W5', divisionRecord: '5-1',
        }),
        mia: makeTeamEntry('MIA', 'Miami Dolphins', {
          wins: 11, losses: 6, playoffSeed: 5, winPercent: 0.647,
          ties: 0, pointsFor: 420, pointsAgainst: 350, pointDifferential: 70,
          streak: 'L1', divisionRecord: '4-2',
        }),
        bal: makeTeamEntry('BAL', 'Baltimore Ravens', {
          wins: 12, losses: 5, playoffSeed: 3, winPercent: 0.706,
          ties: 0, pointsFor: 480, pointsAgainst: 320, pointDifferential: 160,
          streak: 'W3', divisionRecord: '5-1',
        }),
        pit: makeTeamEntry('PIT', 'Pittsburgh Steelers', {
          wins: 9, losses: 8, playoffSeed: 7, winPercent: 0.529,
          ties: 0, pointsFor: 340, pointsAgainst: 360, pointDifferential: -20,
          streak: 'W1', divisionRecord: '3-3',
        }),
        dal: makeTeamEntry('DAL', 'Dallas Cowboys', {
          wins: 12, losses: 5, playoffSeed: 2, winPercent: 0.706,
          ties: 0, pointsFor: 460, pointsAgainst: 330, pointDifferential: 130,
          streak: 'W3', divisionRecord: '5-1',
        }),
        phi: makeTeamEntry('PHI', 'Philadelphia Eagles', {
          wins: 11, losses: 6, playoffSeed: 6, winPercent: 0.647,
          ties: 0, pointsFor: 400, pointsAgainst: 350, pointDifferential: 50,
          streak: 'L2', divisionRecord: '4-2',
        }),
      };
    }

    it('grouping=division uses static DIVISION_MAP to split teams into divisions', async () => {
      const t = makeNFLEntries();
      // Put all entries in a conference-level structure (which parseStandings reads)
      // The division grouping code then redistributes using DIVISION_MAP
      const data = makeESPNStandingsResponse('conference', [
        t.buf, t.mia, t.bal, t.pit, t.dal, t.phi,
      ], { confNames: ['AFC', 'NFC'] });
      mockFetchCalls(data);

      const req = makeRequest('nfl', 'division');
      const res = await GET(req);
      const json = await res.json();

      // NFL DIVISION_MAP has 8 divisions; only those with matching entries will appear
      const divNames = json.groups.map((g: { name: string }) => g.name);
      expect(divNames).toContain('AFC East'); // BUF, MIA
      expect(divNames).toContain('AFC North'); // BAL, PIT
      expect(divNames).toContain('NFC East'); // DAL, PHI

      const afcEast = json.groups.find((g: { name: string }) => g.name === 'AFC East');
      expect(afcEast.entries).toHaveLength(2);
      // BUF has seed 1, MIA has seed 5 — after division re-sort, BUF is ranked 1, MIA ranked 2
      expect(afcEast.entries[0].teamAbbr).toBe('BUF');
      expect(afcEast.entries[0].rank).toBe(1);
      expect(afcEast.entries[1].teamAbbr).toBe('MIA');
      expect(afcEast.entries[1].rank).toBe(2);
    });

    it('grouping=conference merges divisions into conferences', async () => {
      const t = makeNFLEntries();
      const data = makeESPNStandingsResponse('division', [], {
        divisionLayout: {
          'American Football Conference': [
            { name: 'AFC East', entries: [t.buf, t.mia] },
            { name: 'AFC North', entries: [t.bal, t.pit] },
          ],
          'National Football Conference': [
            { name: 'NFC East', entries: [t.dal, t.phi] },
          ],
        },
      });
      mockFetchCalls(data);

      const req = makeRequest('nfl', 'conference');
      const res = await GET(req);
      const json = await res.json();

      expect(json.groups).toHaveLength(2);
      const afc = json.groups.find((g: { name: string }) => g.name === 'American Football Conference');
      const nfc = json.groups.find((g: { name: string }) => g.name === 'National Football Conference');

      // AFC: 4 teams (BUF, MIA, BAL, PIT) merged from 2 divisions
      expect(afc.entries).toHaveLength(4);
      // NFC: 2 teams (DAL, PHI)
      expect(nfc.entries).toHaveLength(2);

      // Entries are re-ranked after merge
      expect(afc.entries[0].rank).toBe(1);
      expect(afc.entries[1].rank).toBe(2);
      expect(afc.entries[2].rank).toBe(3);
      expect(afc.entries[3].rank).toBe(4);
    });

    it('grouping=conference re-sorts entries by winPct then wins after merge', async () => {
      const t = makeNFLEntries();
      const data = makeESPNStandingsResponse('division', [], {
        divisionLayout: {
          'American Football Conference': [
            { name: 'AFC East', entries: [t.buf, t.mia] },
            { name: 'AFC North', entries: [t.bal, t.pit] },
          ],
        },
      });
      mockFetchCalls(data);

      const req = makeRequest('nfl', 'conference');
      const res = await GET(req);
      const json = await res.json();

      const afc = json.groups[0];
      // Sort: by winPct desc, then wins desc
      // BUF 0.765, BAL 0.706, MIA 0.647, PIT 0.529
      expect(afc.entries[0].teamAbbr).toBe('BUF');
      expect(afc.entries[1].teamAbbr).toBe('BAL');
      expect(afc.entries[2].teamAbbr).toBe('MIA');
      expect(afc.entries[3].teamAbbr).toBe('PIT');
    });

    it('grouping=league flattens all groups into a single list', async () => {
      const t = makeNFLEntries();
      const data = makeESPNStandingsResponse('conference', [
        t.buf, t.mia, t.bal, t.pit, t.dal, t.phi,
      ], { confNames: ['AFC', 'NFC'] });
      mockFetchCalls(data);

      const req = makeRequest('nfl', 'league');
      const res = await GET(req);
      const json = await res.json();

      expect(json.groups).toHaveLength(1);
      expect(json.groups[0].name).toBe('NFL');
      expect(json.groups[0].league).toBe('NFL');
      expect(json.groups[0].entries).toHaveLength(6);

      // All entries are re-ranked 1..6
      json.groups[0].entries.forEach((e: { rank: number }, i: number) => {
        expect(e.rank).toBe(i + 1);
      });
    });

    it('grouping=division for league without DIVISION_MAP keeps original groups', async () => {
      const atl = makeTeamEntry('ATL', 'Atlanta United', {
        wins: 14, losses: 8, ties: 10, points: 52, gamesPlayed: 32,
        playoffSeed: 3, winPercent: 0.4375,
        pointsFor: 45, pointsAgainst: 35, pointDifferential: 10,
      });
      const data = makeESPNStandingsResponse('flat', [atl]);
      mockFetchCalls(data);

      const req = makeRequest('mls', 'division');
      const res = await GET(req);
      const json = await res.json();

      // MLS has no DIVISION_MAP, so original flat group is kept
      expect(res.status).toBe(200);
      expect(json.groups).toHaveLength(1);
      expect(json.groups[0].entries[0].teamAbbr).toBe('ATL');
    });

    it('grouping=conference with no children structure keeps original groups', async () => {
      const atl = makeTeamEntry('ATL', 'Atlanta United', {
        wins: 14, losses: 8, ties: 10, points: 52, gamesPlayed: 32,
        playoffSeed: 3, winPercent: 0.4375,
        pointsFor: 45, pointsAgainst: 35, pointDifferential: 10,
      });
      const data = makeESPNStandingsResponse('flat', [atl]);
      mockFetchCalls(data);

      const req = makeRequest('epl', 'conference');
      const res = await GET(req);
      const json = await res.json();

      // Flat structure (no children) — conference grouping can't restructure
      expect(res.status).toBe(200);
      expect(json.groups).toHaveLength(1);
    });
  });

  // =========================================================================
  // Team colors
  // =========================================================================

  describe('team colors', () => {
    it('team colors from teams API are merged into entries', async () => {
      const buf = makeTeamEntry('BUF', 'Buffalo Bills', {
        wins: 13, losses: 4, playoffSeed: 1, winPercent: 0.765,
        ties: 0, pointsFor: 490, pointsAgainst: 310, pointDifferential: 180,
        streak: 'W5', divisionRecord: '5-1',
      });
      const data = makeESPNStandingsResponse('flat', [buf]);
      const teamsData = makeTeamsResponse([
        { abbr: 'BUF', color: '00338D' },
      ]);
      mockFetchCalls(data, teamsData);

      const req = makeRequest('nfl', 'league');
      const res = await GET(req);
      const json = await res.json();

      // Color from teams API should override the default '000000' from standings
      expect(json.groups[0].entries[0].teamColor).toBe('00338D');
    });

    it('gracefully handles teams API failure (still returns standings)', async () => {
      const buf = makeTeamEntry('BUF', 'Buffalo Bills', {
        wins: 13, losses: 4, playoffSeed: 1, winPercent: 0.765,
        ties: 0, pointsFor: 490, pointsAgainst: 310, pointDifferential: 180,
        streak: 'W5', divisionRecord: '5-1',
      });
      const data = makeESPNStandingsResponse('flat', [buf]);
      // Teams endpoint will fail (no teamsData provided — mockFetchCalls returns ok:false)
      mockFetchCalls(data);

      const req = makeRequest('nfl', 'league');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.groups[0].entries[0].teamAbbr).toBe('BUF');
      // Falls back to the color in the standings data
      expect(json.groups[0].entries[0].teamColor).toBe('000000');
    });

    it('only overrides color for teams that exist in teams API response', async () => {
      const buf = makeTeamEntry('BUF', 'Buffalo Bills', {
        wins: 13, losses: 4, playoffSeed: 1, winPercent: 0.765,
        ties: 0, pointsFor: 490, pointsAgainst: 310, pointDifferential: 180,
      });
      const mia = makeTeamEntry('MIA', 'Miami Dolphins', {
        wins: 11, losses: 6, playoffSeed: 2, winPercent: 0.647,
        ties: 0, pointsFor: 420, pointsAgainst: 350, pointDifferential: 70,
      });
      const data = makeESPNStandingsResponse('flat', [buf, mia]);
      // Only provide color for BUF, not MIA
      const teamsData = makeTeamsResponse([{ abbr: 'BUF', color: '00338D' }]);
      mockFetchCalls(data, teamsData);

      const req = makeRequest('nfl', 'league');
      const res = await GET(req);
      const json = await res.json();

      expect(json.groups[0].entries[0].teamColor).toBe('00338D');
      expect(json.groups[0].entries[1].teamColor).toBe('000000'); // unchanged
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  describe('error handling', () => {
    it('returns 502 when ESPN standings API fails', async () => {
      mockFetchCalls(null, null, { standingsOk: false, standingsStatus: 503 });

      const req = makeRequest('nfl', 'league');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(502);
      expect(json.error).toContain('Failed to fetch');
      expect(json.error).toContain('nfl');
    });

    it('returns 500 on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

      const req = makeRequest('nba');
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe('Failed to fetch standings');
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('entries with missing stats get sensible defaults', async () => {
      // Entry with no stats at all
      const empty = {
        team: {
          displayName: 'Mystery Team',
          abbreviation: 'MYS',
          shortDisplayName: 'Mystery',
          name: 'Mystery',
          logos: [{ href: 'https://a.espncdn.com/MYS.png' }],
          color: 'AABBCC',
        },
        stats: [],
      };
      const data = makeESPNStandingsResponse('flat', [empty]);
      mockFetchCalls(data);

      const req = makeRequest('nba', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entry = json.groups[0].entries[0];

      expect(entry.wins).toBe(0);
      expect(entry.losses).toBe(0);
      expect(entry.winPct).toBe(0); // 0+0=0, so fallback to 0
      expect(entry.teamAbbr).toBe('MYS');
      expect(entry.team).toBe('Mystery Team');
      expect(entry.rank).toBe(1);
    });

    it('entries with missing team data get fallback values', async () => {
      const noTeam = {
        stats: [
          { name: 'wins', abbreviation: 'wins', value: 5, displayValue: '5' },
          { name: 'losses', abbreviation: 'losses', value: 3, displayValue: '3' },
        ],
      };
      const data = makeESPNStandingsResponse('flat', [noTeam]);
      mockFetchCalls(data);

      const req = makeRequest('nba', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entry = json.groups[0].entries[0];

      expect(entry.team).toBe('Unknown');
      expect(entry.teamAbbr).toBe('???');
      expect(entry.teamLogo).toBe('');
      expect(entry.teamColor).toBe('666666');
    });

    it('empty standings.entries produces no parsed groups', async () => {
      const data = { standings: { entries: [] } };
      mockFetchCalls(data);

      // Use 'division' on a league with no DIVISION_MAP so the original empty
      // allGroups from parseStandings is preserved (league grouping would wrap it)
      const req = makeRequest('epl', 'division');
      const res = await GET(req);
      const json = await res.json();

      // parseStandings flat path skips group when entries.length === 0
      expect(json.groups).toHaveLength(0);
    });

    it('entries without logos array still parse correctly', async () => {
      const noLogos = {
        team: {
          displayName: 'No Logo FC',
          abbreviation: 'NLF',
          shortDisplayName: 'No Logo',
          name: 'No Logo',
          // No logos array
        },
        stats: [
          { name: 'wins', abbreviation: 'wins', value: 10, displayValue: '10' },
          { name: 'losses', abbreviation: 'losses', value: 5, displayValue: '5' },
        ],
      };
      const data = makeESPNStandingsResponse('flat', [noLogos]);
      mockFetchCalls(data);

      const req = makeRequest('nba', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entry = json.groups[0].entries[0];

      expect(entry.teamLogo).toBe('');
      expect(entry.teamAbbr).toBe('NLF');
    });

    it('clincher value of empty string is normalized to undefined', async () => {
      const team = makeTeamEntry('BOS', 'Boston Celtics', {
        wins: 60, losses: 22, playoffSeed: 1, winPercent: 0.732,
        clincher: '',
        gamesBehind: 0, streak: 'W5',
      });
      const data = makeESPNStandingsResponse('flat', [team]);
      mockFetchCalls(data);

      const req = makeRequest('nba', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entry = json.groups[0].entries[0];

      expect(entry.clincher).toBeUndefined();
    });

    it('clincher value is preserved when non-empty', async () => {
      const team = makeTeamEntry('BOS', 'Boston Celtics', {
        wins: 60, losses: 22, playoffSeed: 1, winPercent: 0.732,
        clincher: 'z',
        gamesBehind: 0, streak: 'W5',
      });
      const data = makeESPNStandingsResponse('flat', [team]);
      mockFetchCalls(data);

      const req = makeRequest('nba', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entry = json.groups[0].entries[0];

      expect(entry.clincher).toBe('z');
    });

    it('entries without playoffSeed sort after those with seeds', async () => {
      const seeded = makeTeamEntry('BOS', 'Boston Celtics', {
        wins: 50, losses: 22, playoffSeed: 5, winPercent: 0.694,
        gamesBehind: 8,
      });
      const unseeded = makeTeamEntry('WAS', 'Washington Wizards', {
        wins: 15, losses: 57, winPercent: 0.208,
        gamesBehind: 43,
      });
      const data = makeESPNStandingsResponse('flat', [unseeded, seeded]);
      mockFetchCalls(data);

      const req = makeRequest('nba', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entries = json.groups[0].entries;

      // BOS has seed 5, WAS has no seed (defaults to 999)
      expect(entries[0].teamAbbr).toBe('BOS');
      expect(entries[1].teamAbbr).toBe('WAS');
    });

    it('handles winPct fallback when winPercent stat is absent', async () => {
      const team = makeTeamEntry('DET', 'Detroit Pistons', {
        wins: 30, losses: 52, playoffSeed: 14,
        gamesBehind: 28,
      });
      const data = makeESPNStandingsResponse('flat', [team]);
      mockFetchCalls(data);

      const req = makeRequest('nba', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entry = json.groups[0].entries[0];

      // No winPercent stat, so computed: wins / (wins + losses) = 30/82
      expect(entry.winPct).toBeCloseTo(30 / 82, 4);
    });

    it('flat structure uses data.name when available', async () => {
      const team = makeTeamEntry('ARS', 'Arsenal', {
        wins: 22, losses: 3, ties: 5, points: 71, gamesPlayed: 30,
        playoffSeed: 1, pointsFor: 65, pointsAgainst: 20, pointDifferential: 45,
      });
      const data = {
        name: 'Premier League Table',
        standings: { entries: [team] },
      };
      mockFetchCalls(data);

      // Use 'league' grouping but check that parseStandings used the name
      // Note: 'league' grouping will override group name to 'EPL'
      // So use a grouping that doesn't have a DIVISION_MAP for epl
      const req = makeRequest('epl', 'conference');
      const res = await GET(req);
      const json = await res.json();

      // Flat structure, no children — conference grouping keeps original
      expect(json.groups[0].name).toBe('Premier League Table');
    });

    it('NHL division grouping uses static DIVISION_MAP correctly', async () => {
      const bos = makeTeamEntry('BOS', 'Boston Bruins', {
        wins: 50, losses: 18, otLosses: 8, points: 108, gamesPlayed: 76,
        playoffSeed: 1, winPercent: 0.658,
      });
      const car = makeTeamEntry('CAR', 'Carolina Hurricanes', {
        wins: 48, losses: 20, otLosses: 6, points: 102, gamesPlayed: 74,
        playoffSeed: 2, winPercent: 0.649,
      });
      const col = makeTeamEntry('COL', 'Colorado Avalanche', {
        wins: 46, losses: 22, otLosses: 8, points: 100, gamesPlayed: 76,
        playoffSeed: 1, winPercent: 0.605,
      });
      const edm = makeTeamEntry('EDM', 'Edmonton Oilers', {
        wins: 44, losses: 24, otLosses: 8, points: 96, gamesPlayed: 76,
        playoffSeed: 2, winPercent: 0.579,
      });

      const data = makeESPNStandingsResponse('conference', [bos, car, col, edm], {
        confNames: ['Eastern Conference', 'Western Conference'],
      });
      mockFetchCalls(data);

      const req = makeRequest('nhl', 'division');
      const res = await GET(req);
      const json = await res.json();

      const divNames = json.groups.map((g: { name: string }) => g.name);
      // BOS -> Atlantic, CAR -> Metropolitan, COL -> Central, EDM -> Pacific
      expect(divNames).toContain('Atlantic');
      expect(divNames).toContain('Metropolitan');
      expect(divNames).toContain('Central');
      expect(divNames).toContain('Pacific');

      const atlantic = json.groups.find((g: { name: string }) => g.name === 'Atlantic');
      expect(atlantic.entries[0].teamAbbr).toBe('BOS');
      const metro = json.groups.find((g: { name: string }) => g.name === 'Metropolitan');
      expect(metro.entries[0].teamAbbr).toBe('CAR');
    });
  });

  // =========================================================================
  // Common field validation
  // =========================================================================

  describe('common fields', () => {
    it('parsed entries have all required base fields', async () => {
      const okc = makeTeamEntry('OKC', 'Oklahoma City Thunder', {
        wins: 57, losses: 25, playoffSeed: 1, winPercent: 0.695,
        gamesBehind: 0, streak: 'W10', 'Last Ten Games': '9-1',
        homeRecord: '33-8', awayRecord: '24-17', pointDifferential: 640,
      });
      const data = makeESPNStandingsResponse('flat', [okc]);
      mockFetchCalls(data);

      const req = makeRequest('nba', 'league');
      const res = await GET(req);
      const json = await res.json();
      const entry = json.groups[0].entries[0];

      expect(entry).toEqual(expect.objectContaining({
        rank: 1,
        team: 'Oklahoma City Thunder',
        teamAbbr: 'OKC',
        teamShort: 'Thunder',
        teamLogo: 'https://a.espncdn.com/OKC.png',
        wins: 57,
        losses: 25,
        winPct: 0.695,
        playoffSeed: 1,
      }));
    });

    it('response structure includes groups array with league field', async () => {
      const team = makeTeamEntry('BOS', 'Boston Celtics', {
        wins: 58, losses: 24, playoffSeed: 1, winPercent: 0.707,
        gamesBehind: 0,
      });
      const data = makeESPNStandingsResponse('flat', [team]);
      mockFetchCalls(data);

      const req = makeRequest('nba', 'league');
      const res = await GET(req);
      const json = await res.json();

      expect(json).toHaveProperty('groups');
      expect(Array.isArray(json.groups)).toBe(true);
      expect(json.groups[0]).toHaveProperty('name');
      expect(json.groups[0]).toHaveProperty('league', 'NBA');
      expect(json.groups[0]).toHaveProperty('entries');
    });
  });
});
