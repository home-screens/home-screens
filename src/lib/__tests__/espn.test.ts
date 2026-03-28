import { describe, it, expect } from 'vitest';
import { LEAGUE_MAP, parseESPNTeam } from '../espn';

describe('LEAGUE_MAP', () => {
  it('contains all expected leagues', () => {
    const expectedLeagues = [
      'nfl', 'nba', 'wnba', 'mlb', 'nhl', 'mls',
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

  it('falls back shortName to name when shortDisplayName is missing', () => {
    const team = { name: 'Lakers' };
    expect(parseESPNTeam(team).shortName).toBe('Lakers');
  });

  it('prefers shortDisplayName over name for shortName', () => {
    const team = { shortDisplayName: 'Lakers', name: 'Los Angeles Lakers' };
    expect(parseESPNTeam(team).shortName).toBe('Lakers');
  });
});
