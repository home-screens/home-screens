/** Shared ESPN league mappings used by sports and standings API routes */
export const LEAGUE_MAP: Record<string, string> = {
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
};

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
  return {
    name: (team?.displayName as string) ?? 'TBD',
    shortName: (team?.shortDisplayName as string) ?? (team?.name as string) ?? '',
    abbr: (team?.abbreviation as string) ?? '',
    logo: (team?.logo as string) ?? '',
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
  homeScore: number;
  awayScore: number;
  homeRecord: string;
  awayRecord: string;
  status: string;
  detail: string;
  state: 'pre' | 'in' | 'post';
  /** ISO kickoff instant from ESPN (`event.date`); the display formats it in its own timezone. */
  startTime: string;
  broadcast: string;
}
