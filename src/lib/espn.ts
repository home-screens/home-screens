/** Shared ESPN league mappings used by sports and standings API routes */
export const LEAGUE_MAP: Record<string, string> = {
  nfl: 'football/nfl',
  ncaaf: 'football/college-football',
  nba: 'basketball/nba',
  ncaam: 'basketball/mens-college-basketball',
  ncaaw: 'basketball/womens-college-basketball',
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
};

/**
 * Extra scoreboard query per league. ESPN's college football scoreboard
 * answers only ranked matchups unless asked for the FBS group (80) with a
 * limit above the default; a Saturday has 60 to 70 games.
 */
export const SCOREBOARD_PARAMS: Record<string, string> = {
  ncaaf: 'groups=80&limit=200',
  ncaam: 'groups=50&limit=400',
  ncaaw: 'groups=50&limit=400',
};

/**
 * Leagues whose roster comes from the standings endpoint rather than the
 * team list: ESPN's team list for college sports spans every division and
 * ignores the group filter, while standings list exactly the top division.
 * These are also the leagues whose teams carry an AP poll rank.
 */
export const COLLEGE_LEAGUES = new Set(['ncaaf', 'ncaam', 'ncaaw']);

/** The scoreboard URL for a league, with the per-league extras ESPN needs; null for an unknown league. */
export function scoreboardUrl(league: string): string | null {
  const id = league.toLowerCase();
  const path = LEAGUE_MAP[id];
  if (!path) return null;
  const params = SCOREBOARD_PARAMS[id];
  return `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard${params ? `?${params}` : ''}`;
}

/** The sports ESPN files its leagues under; the first segment of a `LEAGUE_MAP` path. */
export type Sport = 'football' | 'basketball' | 'baseball' | 'hockey' | 'soccer';

export interface SportsLeague {
  /** Config key and `LEAGUE_MAP` key. */
  id: string;
  /** Editor label. Proper nouns, left untranslated like the standings picker always has. */
  label: string;
  /** Short caption the wall prints next to a game. */
  wallCode: string;
  /**
   * The sport played, which decides how a record reads (soccer counts draws)
   * and which standings stats ESPN sends. MLS is soccer though the editor
   * groups it with the American leagues.
   */
  sport: Sport;
  /** Editor grouping: the American leagues first, then soccer. */
  group: 'american' | 'soccer';
}

/** Every league the routes answer, in editor display order. */
export const SPORTS_LEAGUES: SportsLeague[] = [
  { id: 'nfl', label: 'NFL', wallCode: 'NFL', sport: 'football', group: 'american' },
  { id: 'ncaaf', label: 'College Football', wallCode: 'NCAAF', sport: 'football', group: 'american' },
  { id: 'nba', label: 'NBA', wallCode: 'NBA', sport: 'basketball', group: 'american' },
  { id: 'ncaam', label: "Men's College Basketball", wallCode: 'NCAAM', sport: 'basketball', group: 'american' },
  { id: 'wnba', label: 'WNBA', wallCode: 'WNBA', sport: 'basketball', group: 'american' },
  { id: 'ncaaw', label: "Women's College Basketball", wallCode: 'NCAAW', sport: 'basketball', group: 'american' },
  { id: 'mlb', label: 'MLB', wallCode: 'MLB', sport: 'baseball', group: 'american' },
  { id: 'nhl', label: 'NHL', wallCode: 'NHL', sport: 'hockey', group: 'american' },
  { id: 'mls', label: 'MLS', wallCode: 'MLS', sport: 'soccer', group: 'american' },
  { id: 'epl', label: 'Premier League', wallCode: 'EPL', sport: 'soccer', group: 'soccer' },
  { id: 'laliga', label: 'La Liga', wallCode: 'LA LIGA', sport: 'soccer', group: 'soccer' },
  { id: 'bundesliga', label: 'Bundesliga', wallCode: 'BUNDESLIGA', sport: 'soccer', group: 'soccer' },
  { id: 'seriea', label: 'Serie A', wallCode: 'SERIE A', sport: 'soccer', group: 'soccer' },
  { id: 'ligue1', label: 'Ligue 1', wallCode: 'LIGUE 1', sport: 'soccer', group: 'soccer' },
  { id: 'liga_mx', label: 'Liga MX', wallCode: 'LIGA MX', sport: 'soccer', group: 'soccer' },
];

/** The ids of every soccer league, the one list the record and standings rules read. */
export const SOCCER_LEAGUE_IDS: ReadonlySet<string> = new Set(
  SPORTS_LEAGUES.filter((l) => l.sport === 'soccer').map((l) => l.id),
);

/** Whether a league id, in either case, is a soccer league. */
export function isSoccerLeague(league: string): boolean {
  return SOCCER_LEAGUE_IDS.has(league.toLowerCase());
}

/** Wall caption for a league id in either case; unknown ids print upper-cased. */
export function leagueWallCode(league: string): string {
  const id = league.toLowerCase();
  return SPORTS_LEAGUES.find((l) => l.id === id)?.wallCode ?? league.toUpperCase();
}

/** Editor label for a league id; unknown ids print upper-cased. */
export function leagueLabel(league: string): string {
  const id = league.toLowerCase();
  return SPORTS_LEAGUES.find((l) => l.id === id)?.label ?? league.toUpperCase();
}

/** Common ESPN team fields extracted from the raw API response */
interface ESPNTeamInfo {
  name: string;
  shortName: string;
  abbr: string;
  logo: string;
  color: string;
}

/** Extract common team fields from an ESPN competitor.team object */
export function parseESPNTeam(
  team: Record<string, unknown> | undefined,
): ESPNTeamInfo {
  // The scoreboard sends `logo`; the team schedule sends `logos[].href`.
  const logos = team?.logos as Record<string, unknown>[] | undefined;
  return {
    name: (team?.displayName as string) ?? 'TBD',
    shortName: (team?.shortDisplayName as string) ?? (team?.name as string) ?? '',
    abbr: (team?.abbreviation as string) ?? '',
    logo: (team?.logo as string) ?? (logos?.[0]?.href as string) ?? '',
    color: (team?.color as string) ?? '666666',
  };
}

/**
 * One game in GET /api/sports' payload — the server↔client wire contract,
 * kept here (not under components/) so the API route never imports from
 * the client component tree. Built by the route from ESPN's scoreboard
 * response; rendered by the sports module's views.
 */
export interface Game {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  homeTeamColor: string;
  awayTeamColor: string;
  /** Null when ESPN left the score off; a view shows a gap, never a made-up 0. */
  homeScore: number | null;
  awayScore: number | null;
  /** Empty when ESPN sends no record. */
  homeRecord: string;
  awayRecord: string;
  status: string;
  detail: string;
  state: 'pre' | 'in' | 'post';
  /** ISO kickoff instant from ESPN (`event.date`); the display formats it in its own timezone. */
  startTime: string;
  broadcast: string;
  /** Stadium or arena name when ESPN names one. */
  venue?: string;
  /** AP poll rank (1 to 25) for college teams; absent for pro leagues and unranked teams. */
  homeRank?: number;
  awayRank?: number;
}

/** ESPN's `curatedRank.current` is 99 for an unranked team; only a top-25 rank is worth printing. */
export function parseCuratedRank(competitor: Record<string, unknown> | undefined): number | undefined {
  const rank = Number((competitor?.curatedRank as Record<string, unknown> | undefined)?.current);
  return Number.isFinite(rank) && rank >= 1 && rank <= 25 ? rank : undefined;
}

/** One row of GET /api/sports/teams, the editor's team picker. */
export interface TeamOption {
  /** Lower-case league id, so a row can be keyed with `teamKey`. */
  league: string;
  /** ESPN's numeric team id; soccer endpoints answer only to this, never to the abbreviation. */
  id: string;
  abbr: string;
  name: string;
  shortName: string;
  logo: string;
  color: string;
}

/**
 * One favorite team in GET /api/sports/team's payload, built from ESPN's
 * team and schedule endpoints. `featured` is the live game, else the next
 * one, else the last one (`featuredKind` says which); `last` is the latest
 * finished game whenever `featured` is not already it.
 */
export interface TeamCard {
  /** `<league>:<ABBR>`, the config key that asked for this card. */
  key: string;
  league: string;
  abbr: string;
  name: string;
  shortName: string;
  logo: string;
  color: string;
  /** Overall record such as `3-0`, empty when ESPN has none yet. */
  record: string;
  /** ESPN's standing line such as `1st in NFC North`. */
  standing: string;
  /** AP poll rank for a ranked college team. */
  rank?: number;
  featured: Game | null;
  featuredKind: 'live' | 'next' | 'last' | null;
  last: Game | null;
  /** True when ESPN could not be reached for this team; the header still renders. */
  error?: boolean;
}

/**
 * Score fields differ between ESPN's scoreboard (string) and schedule
 * (`{ value }`) payloads. A score that is absent or unreadable is null, not
 * 0: the team schedule drops `score` mid-game now and then, and a live game
 * must not read 0-0.
 */
function readScore(raw: unknown): number | null {
  const value = raw && typeof raw === 'object'
    ? (raw as Record<string, unknown>).value ?? (raw as Record<string, unknown>).displayValue
    : raw;
  if (value === undefined || value === null || value === '') return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

/**
 * Build a `Game` from one ESPN event. Accepts the scoreboard shape (status on
 * the event, broadcast `names`) and the team schedule shape (status on the
 * competition, broadcast `media.shortName`, scores as objects).
 */
export function parseESPNEvent(event: Record<string, unknown>, league: string): Game {
  const competition = (event.competitions as Record<string, unknown>[] | undefined)?.[0];
  const competitors = (competition?.competitors as Record<string, unknown>[]) ?? [];

  const home = competitors.find((c) => c.homeAway === 'home');
  const away = competitors.find((c) => c.homeAway === 'away');

  const homeTeam = home?.team as Record<string, unknown> | undefined;
  const awayTeam = away?.team as Record<string, unknown> | undefined;

  const homeRecords = home?.records as Record<string, unknown>[] | undefined;
  const awayRecords = away?.records as Record<string, unknown>[] | undefined;
  const homeRecordAlt = home?.record as Record<string, unknown>[] | undefined;
  const awayRecordAlt = away?.record as Record<string, unknown>[] | undefined;

  const broadcasts = competition?.broadcasts as Record<string, unknown>[] | undefined;
  const nationalBroadcast = broadcasts?.find((b) => b.market === 'national') ?? broadcasts?.[0];
  const broadcastNames = (nationalBroadcast?.names as string[] | undefined)
    ?? ((nationalBroadcast?.media as Record<string, unknown> | undefined)?.shortName
      ? [(nationalBroadcast?.media as Record<string, unknown>).shortName as string]
      : undefined);

  const status = (event.status ?? competition?.status) as Record<string, unknown> | undefined;
  const statusType = status?.type as Record<string, unknown> | undefined;
  const venue = (competition?.venue as Record<string, unknown> | undefined)?.fullName as string | undefined;

  const ht = parseESPNTeam(homeTeam);
  const at = parseESPNTeam(awayTeam);
  const homeRank = parseCuratedRank(home);
  const awayRank = parseCuratedRank(away);

  return {
    id: String(event.id ?? ''),
    league: league.toUpperCase(),
    homeTeam: ht.name,
    awayTeam: at.name,
    homeTeamAbbr: ht.abbr,
    awayTeamAbbr: at.abbr,
    homeTeamLogo: ht.logo,
    awayTeamLogo: at.logo,
    homeTeamColor: ht.color,
    awayTeamColor: at.color,
    homeScore: readScore(home?.score),
    awayScore: readScore(away?.score),
    homeRecord: (homeRecords?.[0]?.summary as string) ?? (homeRecordAlt?.[0]?.displayValue as string) ?? '',
    awayRecord: (awayRecords?.[0]?.summary as string) ?? (awayRecordAlt?.[0]?.displayValue as string) ?? '',
    status: (statusType?.description as string) ?? 'Scheduled',
    detail: (statusType?.detail as string) ?? '',
    state: ((statusType?.state as string) ?? 'pre') as 'pre' | 'in' | 'post',
    startTime: (event.date as string) ?? '',
    broadcast: broadcastNames?.join(', ') ?? '',
    ...(venue ? { venue } : {}),
    ...(homeRank ? { homeRank } : {}),
    ...(awayRank ? { awayRank } : {}),
  };
}
