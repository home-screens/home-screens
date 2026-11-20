/**
 * Server-side roster lookups shared by /api/sports/teams (the editor's
 * picker) and /api/sports/team (the Team view). A roster row carries ESPN's
 * numeric team id because soccer endpoints reject abbreviations
 * (`soccer/eng.1/teams/ars` is a 400; `teams/359` is Arsenal).
 */
import { createTTLCache, fetchWithTimeout } from './api-utils';
import { COLLEGE_LEAGUES, ESPN_SITE_API as ESPN, LEAGUE_MAP } from './espn';
import type { TeamOption } from './espn';

/** Rosters change once a year; one entry per league so league combinations share upstream calls. */
export const ROSTER_TTL_MS = 24 * 60 * 60 * 1000;
/** @internal exported for test cleanup */
export const rosterCache = createTTLCache<TeamOption[]>(ROSTER_TTL_MS);

function teamFromESPN(team: Record<string, unknown>, league: string): TeamOption | null {
  const abbr = team.abbreviation as string | undefined;
  const name = team.displayName as string | undefined;
  if (!abbr || !name) return null;
  const logos = team.logos as Record<string, unknown>[] | undefined;
  return {
    league,
    id: String(team.id ?? ''),
    abbr,
    name,
    shortName: (team.shortDisplayName as string) ?? (team.name as string) ?? name,
    logo: (team.logo as string) ?? (logos?.[0]?.href as string) ?? '',
    color: (team.color as string) ?? '',
  };
}

/** ESPN's team list for a league. For college football this spans every NCAA division. */
async function fetchTeamList(league: string, path: string): Promise<TeamOption[]> {
  const res = await fetchWithTimeout(`${ESPN}/site/v2/sports/${path}/teams?limit=1000`);
  if (!res.ok) throw new Error(`ESPN teams ${res.status}`);
  const data = await res.json();
  const rows = (data?.sports?.[0]?.leagues?.[0]?.teams ?? []) as Record<string, unknown>[];
  return rows
    .map((row) => teamFromESPN((row.team as Record<string, unknown>) ?? row, league))
    .filter((t): t is TeamOption => !!t);
}

/**
 * The top-division roster for a college sport. ESPN's teams endpoint ignores
 * the group filter and, for football, answers 700-plus teams across every
 * division; the standings endpoint lists exactly the top division's
 * conferences. Colors are merged from the teams endpoint, which the
 * standings payload lacks.
 */
async function fetchCollegeTeams(league: string, path: string): Promise<TeamOption[]> {
  const [standingsRes, all] = await Promise.all([
    fetchWithTimeout(`${ESPN}/v2/sports/${path}/standings`),
    fetchTeamList(league, path).catch(() => [] as TeamOption[]),
  ]);
  if (!standingsRes.ok) throw new Error(`ESPN standings ${standingsRes.status}`);
  const data = await standingsRes.json();
  const colors = new Map(all.map((t) => [t.abbr, t.color]));
  const out: TeamOption[] = [];
  const conferences = (data?.children ?? []) as Record<string, unknown>[];
  for (const conf of conferences) {
    const entries = ((conf.standings as Record<string, unknown> | undefined)?.entries ?? []) as Record<string, unknown>[];
    for (const entry of entries) {
      const team = teamFromESPN((entry.team as Record<string, unknown>) ?? {}, league);
      if (!team) continue;
      out.push({ ...team, color: team.color || colors.get(team.abbr) || '' });
    }
  }
  return out;
}

/** The league's roster sorted by name, from the cache when it is fresh. Throws for an unknown league. */
export async function rosterFor(league: string): Promise<TeamOption[]> {
  const cached = rosterCache.get(league);
  if (cached) return cached;
  const path = LEAGUE_MAP[league];
  if (!path) throw new Error(`Unknown league: ${league}`);
  const teams = COLLEGE_LEAGUES.has(league) ? await fetchCollegeTeams(league, path) : await fetchTeamList(league, path);
  teams.sort((a, b) => a.name.localeCompare(b.name));
  rosterCache.set(league, teams);
  return teams;
}

/**
 * Each team's color by abbreviation, for the standings table, whose own
 * ESPN payload carries none. Read from the roster, which asks for the whole
 * team list (ESPN's default page is 50 teams, and college leagues have
 * hundreds). An unknown league or a failed read answers an empty map, so
 * the table still draws with its fallback color.
 */
export async function teamColorsFor(league: string): Promise<Map<string, string>> {
  try {
    const roster = await rosterFor(league.toLowerCase());
    return new Map(roster.filter((t) => t.color).map((t) => [t.abbr, t.color]));
  } catch {
    return new Map();
  }
}

/** The roster row for an abbreviation, or null when the roster has no such team or could not be read. */
export async function findRosterTeam(league: string, abbr: string): Promise<TeamOption | null> {
  try {
    const roster = await rosterFor(league);
    const upper = abbr.toUpperCase();
    return roster.find((t) => t.abbr.toUpperCase() === upper) ?? null;
  } catch {
    return null;
  }
}
