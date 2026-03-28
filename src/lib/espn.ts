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
