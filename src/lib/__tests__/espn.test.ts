import { describe, it, expect } from 'vitest';
import { COLLEGE_LEAGUES, LEAGUE_MAP, SOCCER_LEAGUE_IDS, SPORTS_LEAGUES, SCOREBOARD_PARAMS, isSoccerLeague, leagueLabel, leagueWallCode, parseCuratedRank, parseESPNEvent, parseESPNTeam, scoreboardUrl } from '../espn';

describe('LEAGUE_MAP', () => {
  it('contains all expected leagues', () => {
    const expectedLeagues = [
      'nfl', 'ncaaf', 'nba', 'ncaam', 'wnba', 'ncaaw', 'mlb', 'nhl', 'mls',
      'epl', 'laliga', 'bundesliga', 'seriea', 'ligue1', 'liga_mx',
    ];
    for (const league of expectedLeagues) {
      expect(LEAGUE_MAP[league]).toBeDefined();
    }
  });

  it('maps leagues to correct ESPN API paths', () => {
    expect(LEAGUE_MAP['nfl']).toBe('football/nfl');
    expect(LEAGUE_MAP['nba']).toBe('basketball/nba');
    expect(LEAGUE_MAP['epl']).toBe('soccer/eng.1');
    expect(LEAGUE_MAP['mls']).toBe('soccer/usa.1');
  });
});

describe('parseESPNTeam', () => {
  it('extracts all fields from a complete team object', () => {
    const team = {
      displayName: 'Los Angeles Lakers',
      shortDisplayName: 'Lakers',
      name: 'Lakers',
      abbreviation: 'LAL',
      logo: 'https://a.espncdn.com/lakers.png',
      color: '552583',
    };
    expect(parseESPNTeam(team)).toEqual({
      name: 'Los Angeles Lakers',
      shortName: 'Lakers',
      abbr: 'LAL',
      logo: 'https://a.espncdn.com/lakers.png',
      color: '552583',
    });
  });

  it('provides defaults for missing fields', () => {
    const result = parseESPNTeam({});
    expect(result).toEqual({
      name: 'TBD',
      shortName: '',
      abbr: '',
      logo: '',
      color: '666666',
    });
  });

  it('handles undefined input', () => {
    const result = parseESPNTeam(undefined);
    expect(result).toEqual({
      name: 'TBD',
      shortName: '',
      abbr: '',
      logo: '',
      color: '666666',
    });
  });

  it('reads the schedule payload logo shape (logos[].href) when `logo` is absent', () => {
    expect(parseESPNTeam({ logos: [{ href: 'https://a/min.png' }] }).logo).toBe('https://a/min.png');
    expect(parseESPNTeam({ logo: 'https://a/x.png', logos: [{ href: 'https://a/y.png' }] }).logo).toBe('https://a/x.png');
  });

  it('falls back shortName to name when shortDisplayName is missing', () => {
    const team = { name: 'Lakers' };
    expect(parseESPNTeam(team).shortName).toBe('Lakers');
  });

  it('prefers shortDisplayName over name for shortName', () => {
    const team = { shortDisplayName: 'Lakers', name: 'Los Angeles Lakers' };
    expect(parseESPNTeam(team).shortName).toBe('Lakers');
  });
});

describe('SPORTS_LEAGUES', () => {
  it('lists every league the routes answer, and nothing else', () => {
    expect(SPORTS_LEAGUES.map((l) => l.id).sort()).toEqual(Object.keys(LEAGUE_MAP).sort());
  });

  it('every extra scoreboard param names a known league, and every college league has one', () => {
    for (const id of Object.keys(SCOREBOARD_PARAMS)) expect(LEAGUE_MAP[id]).toBeTruthy();
    for (const id of COLLEGE_LEAGUES) expect(SCOREBOARD_PARAMS[id]).toMatch(/^groups=\d+&limit=\d+$/);
    expect(scoreboardUrl('ncaam')).toContain('mens-college-basketball/scoreboard?groups=50&limit=400');
    expect(scoreboardUrl('ncaaw')).toContain('womens-college-basketball/scoreboard?groups=50&limit=400');
  });

  it("each league's sport is the one ESPN files it under", () => {
    for (const league of SPORTS_LEAGUES) {
      expect(LEAGUE_MAP[league.id].split('/')[0]).toBe(league.sport);
    }
  });

  it('counts MLS as soccer even though the editor groups it with the American leagues', () => {
    expect([...SOCCER_LEAGUE_IDS].sort()).toEqual(['bundesliga', 'epl', 'laliga', 'liga_mx', 'ligue1', 'mls', 'seriea']);
    expect(isSoccerLeague('MLS')).toBe(true);
    expect(isSoccerLeague('nhl')).toBe(false);
    expect(isSoccerLeague('xyz')).toBe(false);
  });

  it('wall codes stay short enough for a list row and labels are human', () => {
    expect(leagueWallCode('LIGA_MX')).toBe('LIGA MX');
    expect(leagueWallCode('ncaaf')).toBe('NCAAF');
    expect(leagueWallCode('xyz')).toBe('XYZ');
    expect(leagueLabel('ncaaf')).toBe('College Football');
    expect(leagueLabel('epl')).toBe('Premier League');
  });
});

describe('scoreboardUrl', () => {
  it('asks ESPN for every FBS game, not just the ranked ones', () => {
    expect(scoreboardUrl('ncaaf')).toBe('https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=200');
    expect(scoreboardUrl('NFL')).toBe('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
    expect(scoreboardUrl('xfl')).toBeNull();
  });
});

describe('parseCuratedRank', () => {
  it('keeps a top-25 rank and drops ESPN\'s 99 for unranked, or anything missing', () => {
    expect(parseCuratedRank({ curatedRank: { current: 5 } })).toBe(5);
    expect(parseCuratedRank({ curatedRank: { current: 99 } })).toBeUndefined();
    expect(parseCuratedRank({})).toBeUndefined();
    expect(parseCuratedRank(undefined)).toBeUndefined();
  });
});

describe('parseESPNEvent', () => {
  it('reads the scoreboard shape', () => {
    const g = parseESPNEvent({
      id: '1', date: '2026-10-04T20:05Z',
      status: { type: { description: 'In Progress', detail: '4:12 - 3rd', state: 'in' } },
      competitions: [{
        venue: { fullName: 'U.S. Bank Stadium' },
        broadcasts: [{ market: 'national', names: ['FOX'] }],
        competitors: [
          { homeAway: 'home', score: '24', team: { displayName: 'Minnesota Vikings', abbreviation: 'MIN', color: '4f2683' }, records: [{ summary: '3-0' }], curatedRank: { current: 99 } },
          { homeAway: 'away', score: '17', team: { displayName: 'Miami Dolphins', abbreviation: 'MIA' }, curatedRank: { current: 7 } },
        ],
      }],
    }, 'nfl');
    expect(g).toMatchObject({ league: 'NFL', homeTeamAbbr: 'MIN', awayTeamAbbr: 'MIA', homeScore: 24, awayScore: 17, homeRecord: '3-0', state: 'in', broadcast: 'FOX', venue: 'U.S. Bank Stadium', awayRank: 7 });
    expect(g.homeRank).toBeUndefined();
  });

  it('reads the team schedule shape: status on the competition, object scores, media broadcasts', () => {
    const g = parseESPNEvent({
      id: '2', date: '2026-09-27T17:00Z',
      competitions: [{
        status: { type: { description: 'Final', state: 'post' } },
        broadcasts: [{ media: { shortName: 'CBS' } }],
        competitors: [
          { homeAway: 'home', score: { value: 16, displayValue: '16' }, team: { abbreviation: 'TB' }, record: [{ displayValue: '2-2' }] },
          { homeAway: 'away', score: { value: 23, displayValue: '23' }, team: { abbreviation: 'MIN' } },
        ],
      }],
    }, 'nfl');
    expect(g).toMatchObject({ homeScore: 16, awayScore: 23, homeRecord: '2-2', state: 'post', broadcast: 'CBS', status: 'Final' });
    expect(g.venue).toBeUndefined();
  });

  it('leaves a score ESPN left out null, and keeps a real 0', () => {
    // The team schedule mid-game, with `score` dropped from both sides.
    const live = parseESPNEvent({
      id: '3', date: '2026-10-03T19:30Z',
      competitions: [{
        status: { type: { description: 'In Progress', state: 'in' } },
        competitors: [
          { homeAway: 'home', team: { abbreviation: 'MINN' } },
          { homeAway: 'away', team: { abbreviation: 'MICH' }, score: {} },
        ],
      }],
    }, 'ncaaf');
    expect(live.homeScore).toBeNull();
    expect(live.awayScore).toBeNull();
    expect(live.homeRecord).toBe('');

    const shutout = parseESPNEvent({
      id: '4',
      competitions: [{
        competitors: [
          { homeAway: 'home', score: '0' },
          { homeAway: 'away', score: { value: 0, displayValue: '0' } },
        ],
      }],
    }, 'nfl');
    expect(shutout.homeScore).toBe(0);
    expect(shutout.awayScore).toBe(0);
  });
});
