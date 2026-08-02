// ---------------------------------------------------------------------------
// ESPN Standings — types, data tables, parsing, and grouping helpers
// ---------------------------------------------------------------------------

// ---- Types ----------------------------------------------------------------

export interface StandingsEntry {
  rank: number;
  team: string;
  teamAbbr: string;
  teamShort: string;
  teamLogo: string;
  teamColor: string;
  wins: number;
  losses: number;
  ties?: number;
  otLosses?: number;
  draws?: number;
  points?: number;
  winPct: number;
  gamesBack?: number;
  streak?: string;
  clincher?: string;
  playoffSeed?: number;
  gamesPlayed?: number;
  last10?: string;
  pointsFor?: number;
  pointsAgainst?: number;
  differential?: number;
  homeRecord?: string;
  awayRecord?: string;
  divRecord?: string;
  goalDiff?: number;
}

export interface StandingsGroup {
  name: string;
  league: string;
  entries: StandingsEntry[];
}

/** A node from the ESPN standings tree with its entries and optional conference parent. */
interface TreeNode {
  name: string;
  confName: string | null;
  entries: Record<string, unknown>[];
}

// Per-league stat field mappings: each entry maps a StandingsEntry field to
// one or more ESPN stat names to try (first match wins).
// 'num' fields use getStatNum, 'str' fields use getStat.
type StatMapping = {
  num?: Partial<Record<keyof StandingsEntry, string[]>>;
  str?: Partial<Record<keyof StandingsEntry, string[]>>;
  postProcess?: (result: StandingsEntry) => void;
};

// ---- Data tables ----------------------------------------------------------

// Static division mappings for leagues where ESPN doesn't provide division-level data
const DIVISION_MAP: Record<string, Record<string, string[]>> = {
  nfl: {
    'AFC East': ['BUF', 'MIA', 'NE', 'NYJ'],
    'AFC North': ['BAL', 'CIN', 'CLE', 'PIT'],
    'AFC South': ['HOU', 'IND', 'JAX', 'TEN'],
    'AFC West': ['DEN', 'KC', 'LAC', 'LV'],
    'NFC East': ['DAL', 'NYG', 'PHI', 'WSH'],
    'NFC North': ['CHI', 'DET', 'GB', 'MIN'],
    'NFC South': ['ATL', 'CAR', 'NO', 'TB'],
    'NFC West': ['ARI', 'LAR', 'SEA', 'SF'],
  },
  nba: {
    'Atlantic': ['BOS', 'BKN', 'NY', 'PHI', 'TOR'],
    'Central': ['CHI', 'CLE', 'DET', 'IND', 'MIL'],
    'Southeast': ['ATL', 'CHA', 'MIA', 'ORL', 'WSH'],
    'Northwest': ['DEN', 'MIN', 'OKC', 'POR', 'UTAH'],
    'Pacific': ['GS', 'LAC', 'LAL', 'PHX', 'SAC'],
    'Southwest': ['DAL', 'HOU', 'MEM', 'NO', 'SA'],
  },
  mlb: {
    'AL East': ['BAL', 'BOS', 'NYY', 'TB', 'TOR'],
    'AL Central': ['CHW', 'CLE', 'DET', 'KC', 'MIN'],
    'AL West': ['HOU', 'LAA', 'ATH', 'SEA', 'TEX'],
    'NL East': ['ATL', 'MIA', 'NYM', 'PHI', 'WSH'],
    'NL Central': ['CHC', 'CIN', 'MIL', 'PIT', 'STL'],
    'NL West': ['ARI', 'COL', 'LAD', 'SD', 'SF'],
  },
  nhl: {
    'Atlantic': ['BOS', 'BUF', 'DET', 'FLA', 'MTL', 'OTT', 'TB', 'TOR'],
    'Metropolitan': ['CAR', 'CBJ', 'NJ', 'NYI', 'NYR', 'PHI', 'PIT', 'WSH'],
    'Central': ['CHI', 'COL', 'DAL', 'MIN', 'NSH', 'STL', 'WPG', 'UTA'],
    'Pacific': ['ANA', 'CGY', 'EDM', 'LA', 'SEA', 'SJ', 'VAN', 'VGK'],
  },
};

const SOCCER_LEAGUES = new Set(['mls', 'epl', 'laliga', 'bundesliga', 'seriea', 'ligue1', 'liga_mx']);

const LEAGUE_STAT_MAP: Record<string, StatMapping> = {
  nfl: {
    num: {
      ties: ['ties'],
      pointsFor: ['pointsFor'],
      pointsAgainst: ['pointsAgainst'],
      differential: ['pointDifferential', 'pointsDiff'],
    },
    str: {
      streak: ['streak'],
      divRecord: ['divisionRecord'],
    },
  },
  nhl: {
    num: {
      otLosses: ['otLosses', 'overtimeLosses'],
      points: ['points'],
      gamesPlayed: ['gamesPlayed'],
      differential: ['pointDifferential', 'pointsDiff'],
    },
    str: {
      streak: ['streak'],
      homeRecord: ['homeRecord', 'Home'],
      awayRecord: ['awayRecord', 'Road', 'Away'],
      last10: ['Last Ten Games', 'last10Record'],
    },
  },
  soccer: {
    num: {
      draws: ['ties', 'draws'],
      points: ['points'],
      gamesPlayed: ['gamesPlayed'],
      pointsFor: ['pointsFor'],
      pointsAgainst: ['pointsAgainst'],
      goalDiff: ['pointDifferential', 'pointsDiff'],
    },
    postProcess: (result) => {
      if (result.points !== undefined && result.gamesPlayed) {
        result.winPct = result.points / (result.gamesPlayed * 3);
      }
    },
  },
  _default: {
    num: {
      gamesBack: ['gamesBehind'],
      differential: ['pointDifferential', 'pointsDiff'],
      pointsFor: ['pointsFor'],
      pointsAgainst: ['pointsAgainst'],
    },
    str: {
      streak: ['streak'],
      last10: ['Last Ten Games', 'last10Record'],
      homeRecord: ['homeRecord', 'Home'],
      awayRecord: ['awayRecord', 'Road', 'Away'],
    },
  },
};

// ---- Helper functions -----------------------------------------------------

function getStat(stats: Record<string, unknown>[], name: string): string | number | undefined {
  const stat = stats.find((s) => s.name === name || s.abbreviation === name);
  return (stat?.displayValue as string | undefined) ?? (stat?.value as number | undefined);
}

function getStatNum(stats: Record<string, unknown>[], name: string): number | undefined {
  const stat = stats.find((s) => s.name === name || s.abbreviation === name);
  if (stat?.value !== undefined) return Number(stat.value);
  if (stat?.displayValue !== undefined) return Number(stat.displayValue);
  return undefined;
}

/** Sort parsed entries by points (desc), winPct (desc), wins (desc), then re-assign ranks */
function sortAndRank(entries: StandingsEntry[]): void {
  entries.sort((a, b) => {
    if (a.points !== undefined && b.points !== undefined && a.points !== b.points) return b.points - a.points;
    if (a.winPct !== b.winPct) return b.winPct - a.winPct;
    return b.wins - a.wins;
  });
  entries.forEach((e, i) => { e.rank = i + 1; });
}

/** Sort raw standings entries by playoffSeed, then points (desc), then wins (desc) */
function sortStandingsEntries(entries: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...entries].sort((a, b) => {
    const statsA = (a.stats as Record<string, unknown>[]) ?? [];
    const statsB = (b.stats as Record<string, unknown>[]) ?? [];
    const seedA = getStatNum(statsA, 'playoffSeed') ?? 999;
    const seedB = getStatNum(statsB, 'playoffSeed') ?? 999;
    if (seedA !== seedB) return seedA - seedB;
    const ptsA = getStatNum(statsA, 'points') ?? 0;
    const ptsB = getStatNum(statsB, 'points') ?? 0;
    if (ptsA !== ptsB) return ptsB - ptsA;
    const winsA = getStatNum(statsA, 'wins') ?? 0;
    const winsB = getStatNum(statsB, 'wins') ?? 0;
    return winsB - winsA;
  });
}

// ---- Parsing functions ----------------------------------------------------

function parseEntry(
  entry: Record<string, unknown>,
  rank: number,
  league: string,
): StandingsEntry {
  const team = entry.team as Record<string, unknown> | undefined;
  const stats = (entry.stats as Record<string, unknown>[]) ?? [];
  const logos = (team?.logos as Record<string, unknown>[]) ?? [];
  const logo = (logos[0]?.href as string) ?? '';

  const leagueKey = league.toLowerCase();

  const wins = getStatNum(stats, 'wins') ?? 0;
  const losses = getStatNum(stats, 'losses') ?? 0;
  const clincher = getStat(stats, 'clincher') as string | undefined;
  const playoffSeed = getStatNum(stats, 'playoffSeed');

  const result: StandingsEntry = {
    rank,
    team: (team?.displayName as string) ?? 'Unknown',
    teamAbbr: (team?.abbreviation as string) ?? '???',
    teamShort: (team?.shortDisplayName as string) ?? (team?.name as string) ?? '',
    teamLogo: logo,
    teamColor: (team?.color as string) ?? '666666',
    wins,
    losses,
    winPct: getStatNum(stats, 'winPercent') ?? getStatNum(stats, 'winPct') ?? (wins + losses > 0 ? wins / (wins + losses) : 0),
    clincher: clincher && clincher !== '' ? clincher : undefined,
    playoffSeed: playoffSeed,
  };

  // Apply sport-specific stats via table-driven mapping
  const mappingKey = SOCCER_LEAGUES.has(leagueKey) ? 'soccer' : leagueKey;
  const mapping = LEAGUE_STAT_MAP[mappingKey] ?? LEAGUE_STAT_MAP._default;

  if (mapping.num) {
    for (const [field, statNames] of Object.entries(mapping.num)) {
      for (const name of statNames!) {
        const val = getStatNum(stats, name);
        if (val !== undefined) {
          (result as unknown as Record<string, unknown>)[field] = val;
          break;
        }
      }
    }
  }

  if (mapping.str) {
    for (const [field, statNames] of Object.entries(mapping.str)) {
      for (const name of statNames!) {
        const val = getStat(stats, name) as string | undefined;
        if (val !== undefined) {
          (result as unknown as Record<string, unknown>)[field] = val;
          break;
        }
      }
    }
  }

  mapping.postProcess?.(result);

  return result;
}

/** Walk the ESPN standings hierarchy (flat / conference / conference+division) and yield nodes. */
function walkStandingsTree(data: Record<string, unknown>, league: string): TreeNode[] {
  const children = data.children as Record<string, unknown>[] | undefined;
  if (!children?.length) {
    const entries = ((data.standings as Record<string, unknown> | undefined)?.entries as Record<string, unknown>[]) ?? [];
    return entries.length ? [{ name: (data.name as string) ?? league.toUpperCase(), confName: null, entries }] : [];
  }

  const nodes: TreeNode[] = [];
  for (const conf of children) {
    const confName = (conf.name as string) ?? 'Conference';
    const confChildren = conf.children as Record<string, unknown>[] | undefined;

    if (confChildren?.length) {
      for (const div of confChildren) {
        const entries = ((div.standings as Record<string, unknown> | undefined)?.entries as Record<string, unknown>[]) ?? [];
        nodes.push({ name: (div.name as string) ?? 'Division', confName, entries });
      }
    } else {
      const entries = ((conf.standings as Record<string, unknown> | undefined)?.entries as Record<string, unknown>[]) ?? [];
      nodes.push({ name: confName, confName, entries });
    }
  }
  return nodes;
}

export function parseStandings(data: Record<string, unknown>, league: string): StandingsGroup[] {
  const leagueUpper = league.toUpperCase();
  return walkStandingsTree(data, league)
    .map((node) => {
      const sorted = sortStandingsEntries(node.entries);
      return { name: node.name, league: leagueUpper, entries: sorted.map((e, i) => parseEntry(e, i + 1, league)) };
    })
    .filter((g) => g.entries.length > 0);
}

// ---- Grouping functions ---------------------------------------------------

/** Merge divisions into conferences */
export function groupByConference(
  groups: StandingsGroup[],
  data: Record<string, unknown>,
  league: string,
): StandingsGroup[] {
  const nodes = walkStandingsTree(data, league);
  if (!nodes.length || nodes[0].confName === null) return groups;

  // Group tree nodes by conference
  const byConf = new Map<string, TreeNode[]>();
  for (const node of nodes) {
    const arr = byConf.get(node.confName!) ?? [];
    arr.push(node);
    byConf.set(node.confName!, arr);
  }

  const result: StandingsGroup[] = [];
  for (const [confName, confNodes] of byConf) {
    if (confNodes.length === 1 && confNodes[0].name === confName) {
      // Conference-only (no divisions) — reuse already-parsed group to preserve original sort
      const existing = groups.find((g) => g.name === confName);
      if (existing) result.push(existing);
    } else {
      // Has divisions — merge and re-sort into one conference group
      const entries = confNodes.flatMap((n) => n.entries.map((e, i) => parseEntry(e, i + 1, league)));
      sortAndRank(entries);
      result.push({ name: confName, league: league.toUpperCase(), entries });
    }
  }
  return result;
}

/** Merge everything into one flat list */
export function groupByLeague(groups: StandingsGroup[], league: string): StandingsGroup[] {
  const allEntries = groups.flatMap((g) => g.entries);
  sortAndRank(allEntries);
  return [{ name: league.toUpperCase(), league: league.toUpperCase(), entries: allEntries }];
}

/** Use static division mapping to split conference groups into divisions */
export function groupByDivision(groups: StandingsGroup[], league: string): StandingsGroup[] {
  const divMap = DIVISION_MAP[league.toLowerCase()];
  if (!divMap) {
    // No division map available — groups stay as-is (conference level)
    return groups;
  }

  const allEntries = groups.flatMap((g) => g.entries);
  const divGroups: StandingsGroup[] = [];
  for (const [divName, teamAbbrs] of Object.entries(divMap)) {
    const divEntries = allEntries.filter((e) => teamAbbrs.includes(e.teamAbbr));
    sortAndRank(divEntries);
    if (divEntries.length > 0) {
      divGroups.push({ name: divName, league: league.toUpperCase(), entries: divEntries });
    }
  }

  return divGroups.length > 0 ? divGroups : groups;
}
