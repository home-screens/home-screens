import { describe, it, expect } from 'vitest';
import { parseStandings, groupByConference, groupByLeague, groupByDivision } from '../espn-standings';

// ---------------------------------------------------------------------------
// Helpers to build ESPN-shaped data fixtures
// ---------------------------------------------------------------------------

function makeStat(name: string, value: number, displayValue?: string) {
  return { name, abbreviation: name, value, displayValue: displayValue ?? String(value) };
}

function makeTeam(overrides: Partial<{ displayName: string; shortDisplayName: string; name: string; abbreviation: string; color: string; logos: { href: string }[] }> = {}) {
  return {
    displayName: overrides.displayName ?? 'Test Team',
    shortDisplayName: overrides.shortDisplayName ?? 'Team',
    name: overrides.name ?? 'Team',
    abbreviation: overrides.abbreviation ?? 'TST',
    color: overrides.color ?? 'ff0000',
    logos: overrides.logos ?? [{ href: 'https://logo.png' }],
  };
}

function makeEntry(team: ReturnType<typeof makeTeam>, stats: ReturnType<typeof makeStat>[]) {
  return { team, stats };
}

// ---------------------------------------------------------------------------
// parseStandings — flat structure (no conferences)
// ---------------------------------------------------------------------------
describe('parseStandings', () => {
  it('parses a flat standings list (no children)', () => {
    const data = {
      name: 'Premier League',
      standings: {
        entries: [
          makeEntry(makeTeam({ displayName: 'Arsenal', abbreviation: 'ARS' }), [
            makeStat('wins', 20),
            makeStat('losses', 5),
            makeStat('ties', 3),
            makeStat('points', 63),
            makeStat('gamesPlayed', 28),
            makeStat('pointsFor', 55),
            makeStat('pointsAgainst', 22),
            makeStat('pointDifferential', 33),
          ]),
          makeEntry(makeTeam({ displayName: 'Chelsea', abbreviation: 'CHE' }), [
            makeStat('wins', 15),
            makeStat('losses', 8),
            makeStat('ties', 5),
            makeStat('points', 50),
            makeStat('gamesPlayed', 28),
          ]),
        ],
      },
    };

    const result = parseStandings(data, 'epl');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Premier League');
    expect(result[0].league).toBe('EPL');
    expect(result[0].entries).toHaveLength(2);

    // Sorted by playoffSeed (none) then points desc — Arsenal first
    const arsenal = result[0].entries[0];
    expect(arsenal.team).toBe('Arsenal');
    expect(arsenal.teamAbbr).toBe('ARS');
    expect(arsenal.wins).toBe(20);
    expect(arsenal.losses).toBe(5);
    expect(arsenal.rank).toBe(1);
  });

  it('parses conference-level structure (children with standings)', () => {
    const data = {
      children: [
        {
          name: 'Eastern Conference',
          standings: {
            entries: [
              makeEntry(makeTeam({ displayName: 'Boston Celtics', abbreviation: 'BOS' }), [
                makeStat('wins', 50),
                makeStat('losses', 10),
                makeStat('winPercent', 0.833),
                makeStat('playoffSeed', 1),
              ]),
              makeEntry(makeTeam({ displayName: 'New York Knicks', abbreviation: 'NY' }), [
                makeStat('wins', 40),
                makeStat('losses', 20),
                makeStat('winPercent', 0.667),
                makeStat('playoffSeed', 2),
              ]),
            ],
          },
        },
        {
          name: 'Western Conference',
          standings: {
            entries: [
              makeEntry(makeTeam({ displayName: 'Oklahoma City Thunder', abbreviation: 'OKC' }), [
                makeStat('wins', 52),
                makeStat('losses', 8),
                makeStat('winPercent', 0.867),
                makeStat('playoffSeed', 1),
              ]),
            ],
          },
        },
      ],
    };

    const result = parseStandings(data, 'nba');
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Eastern Conference');
    expect(result[0].entries).toHaveLength(2);
    // Sorted by playoffSeed — BOS (seed 1) before NY (seed 2)
    expect(result[0].entries[0].teamAbbr).toBe('BOS');
    expect(result[0].entries[0].playoffSeed).toBe(1);
    expect(result[1].name).toBe('Western Conference');
    expect(result[1].entries[0].teamAbbr).toBe('OKC');
  });

  it('parses conference+division hierarchy (children with children)', () => {
    const data = {
      children: [
        {
          name: 'AFC',
          children: [
            {
              name: 'AFC East',
              standings: {
                entries: [
                  makeEntry(makeTeam({ displayName: 'Buffalo Bills', abbreviation: 'BUF' }), [
                    makeStat('wins', 13),
                    makeStat('losses', 4),
                    makeStat('ties', 0),
                    makeStat('pointsFor', 450),
                    makeStat('pointsAgainst', 300),
                    makeStat('pointDifferential', 150),
                  ]),
                  makeEntry(makeTeam({ displayName: 'Miami Dolphins', abbreviation: 'MIA' }), [
                    makeStat('wins', 10),
                    makeStat('losses', 7),
                    makeStat('ties', 0),
                  ]),
                ],
              },
            },
          ],
        },
      ],
    };

    const result = parseStandings(data, 'nfl');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('AFC East');
    expect(result[0].entries).toHaveLength(2);

    const buf = result[0].entries.find((e) => e.teamAbbr === 'BUF')!;
    expect(buf.pointsFor).toBe(450);
    expect(buf.pointsAgainst).toBe(300);
    expect(buf.differential).toBe(150);
    expect(buf.ties).toBe(0);
  });

  it('applies NHL-specific stats (otLosses, points)', () => {
    const data = {
      name: 'NHL',
      standings: {
        entries: [
          makeEntry(makeTeam({ displayName: 'Florida Panthers', abbreviation: 'FLA' }), [
            makeStat('wins', 45),
            makeStat('losses', 20),
            makeStat('otLosses', 5),
            makeStat('points', 95),
            makeStat('gamesPlayed', 70),
            makeStat('streak', 'W3'),
          ]),
        ],
      },
    };

    const result = parseStandings(data, 'nhl');
    const fla = result[0].entries[0];
    expect(fla.otLosses).toBe(5);
    expect(fla.points).toBe(95);
    expect(fla.gamesPlayed).toBe(70);
    expect(fla.streak).toBe('W3');
  });

  it('applies soccer postProcess — winPct from points/gamesPlayed', () => {
    const data = {
      name: 'MLS',
      standings: {
        entries: [
          makeEntry(makeTeam({ displayName: 'Inter Miami', abbreviation: 'MIA' }), [
            makeStat('wins', 10),
            makeStat('losses', 3),
            makeStat('ties', 2),
            makeStat('points', 32),
            makeStat('gamesPlayed', 15),
          ]),
        ],
      },
    };

    const result = parseStandings(data, 'mls');
    const miami = result[0].entries[0];
    expect(miami.draws).toBe(2);
    expect(miami.points).toBe(32);
    // Soccer winPct = points / (gamesPlayed * 3) = 32 / 45
    expect(miami.winPct).toBeCloseTo(32 / 45, 4);
  });

  it('falls back to _default stat mapping for unknown leagues', () => {
    const data = {
      name: 'Custom League',
      standings: {
        entries: [
          makeEntry(makeTeam({ displayName: 'Team A', abbreviation: 'A' }), [
            makeStat('wins', 10),
            makeStat('losses', 5),
            makeStat('gamesBehind', 3),
            makeStat('streak', 'L2'),
          ]),
        ],
      },
    };

    const result = parseStandings(data, 'custom');
    const teamA = result[0].entries[0];
    expect(teamA.gamesBack).toBe(3);
    expect(teamA.streak).toBe('L2');
  });

  it('filters out groups with no entries', () => {
    const data = {
      children: [
        { name: 'Conf A', standings: { entries: [] } },
        {
          name: 'Conf B',
          standings: {
            entries: [makeEntry(makeTeam(), [makeStat('wins', 1), makeStat('losses', 0)])],
          },
        },
      ],
    };

    const result = parseStandings(data, 'nba');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Conf B');
  });

  it('handles missing team/stats gracefully', () => {
    const data = {
      name: 'League',
      standings: {
        entries: [{ team: undefined, stats: undefined }],
      },
    };

    const result = parseStandings(data as Record<string, unknown>, 'nba');
    expect(result[0].entries[0].team).toBe('Unknown');
    expect(result[0].entries[0].teamAbbr).toBe('???');
    expect(result[0].entries[0].wins).toBe(0);
    expect(result[0].entries[0].losses).toBe(0);
  });

  it('sorts entries by playoffSeed, then points, then wins', () => {
    const data = {
      name: 'League',
      standings: {
        entries: [
          makeEntry(makeTeam({ abbreviation: 'C' }), [
            makeStat('wins', 20),
            makeStat('losses', 10),
            makeStat('playoffSeed', 3),
          ]),
          makeEntry(makeTeam({ abbreviation: 'A' }), [
            makeStat('wins', 30),
            makeStat('losses', 5),
            makeStat('playoffSeed', 1),
          ]),
          makeEntry(makeTeam({ abbreviation: 'B' }), [
            makeStat('wins', 25),
            makeStat('losses', 8),
            makeStat('playoffSeed', 2),
          ]),
        ],
      },
    };

    const result = parseStandings(data, 'nba');
    expect(result[0].entries.map((e) => e.teamAbbr)).toEqual(['A', 'B', 'C']);
  });
});

// ---------------------------------------------------------------------------
// groupByConference
// ---------------------------------------------------------------------------
describe('groupByConference', () => {
  const divisionData = {
    children: [
      {
        name: 'AFC',
        children: [
          {
            name: 'AFC East',
            standings: {
              entries: [
                makeEntry(makeTeam({ displayName: 'Bills', abbreviation: 'BUF' }), [makeStat('wins', 13), makeStat('losses', 4)]),
                makeEntry(makeTeam({ displayName: 'Dolphins', abbreviation: 'MIA' }), [makeStat('wins', 10), makeStat('losses', 7)]),
              ],
            },
          },
          {
            name: 'AFC West',
            standings: {
              entries: [
                makeEntry(makeTeam({ displayName: 'Chiefs', abbreviation: 'KC' }), [makeStat('wins', 14), makeStat('losses', 3)]),
              ],
            },
          },
        ],
      },
    ],
  };

  it('merges divisions into conference groups', () => {
    const parsed = parseStandings(divisionData, 'nfl');
    // parsed should have AFC East and AFC West as separate groups
    expect(parsed).toHaveLength(2);

    const conferenced = groupByConference(parsed, divisionData, 'nfl');
    // Should merge into single AFC group
    expect(conferenced).toHaveLength(1);
    expect(conferenced[0].name).toBe('AFC');
    expect(conferenced[0].entries).toHaveLength(3);
    // Re-ranked by winPct — KC (14-3) first
    expect(conferenced[0].entries[0].teamAbbr).toBe('KC');
  });

  it('returns original groups when no conference structure exists', () => {
    const flatData = {
      name: 'League',
      standings: {
        entries: [makeEntry(makeTeam(), [makeStat('wins', 5), makeStat('losses', 3)])],
      },
    };
    const parsed = parseStandings(flatData, 'mls');
    const result = groupByConference(parsed, flatData, 'mls');
    expect(result).toEqual(parsed);
  });
});

// ---------------------------------------------------------------------------
// groupByLeague
// ---------------------------------------------------------------------------
describe('groupByLeague', () => {
  it('flattens all groups into a single league group, sorted by winPct', () => {
    const data = {
      children: [
        {
          name: 'East',
          standings: {
            entries: [
              makeEntry(makeTeam({ displayName: 'Team East', abbreviation: 'E' }), [
                makeStat('wins', 10),
                makeStat('losses', 5),
              ]),
            ],
          },
        },
        {
          name: 'West',
          standings: {
            entries: [
              makeEntry(makeTeam({ displayName: 'Team West', abbreviation: 'W' }), [
                makeStat('wins', 12),
                makeStat('losses', 3),
              ]),
            ],
          },
        },
      ],
    };

    const parsed = parseStandings(data, 'nba');
    const result = groupByLeague(parsed, 'nba');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('NBA');
    expect(result[0].entries).toHaveLength(2);
    // Team West (12-3, .800) should be first
    expect(result[0].entries[0].teamAbbr).toBe('W');
    expect(result[0].entries[0].rank).toBe(1);
    expect(result[0].entries[1].rank).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// groupByDivision
// ---------------------------------------------------------------------------
describe('groupByDivision', () => {
  it('splits teams into divisions using static DIVISION_MAP', () => {
    const groups = [
      {
        name: 'AFC',
        league: 'NFL',
        entries: [
          { rank: 1, team: 'Bills', teamAbbr: 'BUF', teamShort: 'Bills', teamLogo: '', teamColor: '', wins: 13, losses: 4, winPct: 0.765 },
          { rank: 2, team: 'Chiefs', teamAbbr: 'KC', teamShort: 'Chiefs', teamLogo: '', teamColor: '', wins: 14, losses: 3, winPct: 0.824 },
          { rank: 3, team: 'Dolphins', teamAbbr: 'MIA', teamShort: 'Dolphins', teamLogo: '', teamColor: '', wins: 10, losses: 7, winPct: 0.588 },
        ],
      },
    ];

    const result = groupByDivision(groups, 'nfl');
    // BUF and MIA are AFC East; KC is AFC West
    const afcEast = result.find((g) => g.name === 'AFC East');
    const afcWest = result.find((g) => g.name === 'AFC West');
    expect(afcEast).toBeDefined();
    expect(afcWest).toBeDefined();
    expect(afcEast!.entries.map((e) => e.teamAbbr)).toContain('BUF');
    expect(afcEast!.entries.map((e) => e.teamAbbr)).toContain('MIA');
    expect(afcWest!.entries.map((e) => e.teamAbbr)).toContain('KC');
    // Re-ranked within divisions
    expect(afcEast!.entries[0].rank).toBe(1);
  });

  it('returns original groups when no division map exists for the league', () => {
    const groups = [
      { name: 'Conf', league: 'CUSTOM', entries: [{ rank: 1, team: 'A', teamAbbr: 'A', teamShort: 'A', teamLogo: '', teamColor: '', wins: 1, losses: 0, winPct: 1 }] },
    ];
    const result = groupByDivision(groups, 'custom');
    expect(result).toEqual(groups);
  });

  it('handles NBA divisions correctly', () => {
    const groups = [
      {
        name: 'Eastern',
        league: 'NBA',
        entries: [
          { rank: 1, team: 'Boston Celtics', teamAbbr: 'BOS', teamShort: 'Celtics', teamLogo: '', teamColor: '', wins: 50, losses: 10, winPct: 0.833 },
          { rank: 2, team: 'Cleveland Cavaliers', teamAbbr: 'CLE', teamShort: 'Cavaliers', teamLogo: '', teamColor: '', wins: 45, losses: 15, winPct: 0.750 },
        ],
      },
    ];

    const result = groupByDivision(groups, 'nba');
    const atlantic = result.find((g) => g.name === 'Atlantic');
    const central = result.find((g) => g.name === 'Central');
    expect(atlantic).toBeDefined();
    expect(central).toBeDefined();
    expect(atlantic!.entries[0].teamAbbr).toBe('BOS');
    expect(central!.entries[0].teamAbbr).toBe('CLE');
  });
});
