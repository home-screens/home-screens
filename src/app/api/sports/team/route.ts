import { NextResponse } from 'next/server';
import { cachedProxyRoute, fetchWithTimeout, parseCommaList } from '@/lib/api-utils';
import { ESPN_SITE_API, LEAGUE_MAP, parseESPNEvent } from '@/lib/espn';
import type { Game, TeamCard } from '@/lib/espn';
import { findRosterTeam } from '@/lib/espn-rosters';
import { fetchScoreboard } from '@/lib/espn-scoreboard';
import { MAX_FAVORITE_TEAMS, parseTeamKey, teamKey } from '@/lib/sports-order';
import { fillMissingScores, leaguesMissingScores, pickFeaturedGame } from '@/lib/sports-team';
import { logger } from '@/lib/logger';

const log = logger('sports-team');

export const dynamic = 'force-dynamic';

const ESPN = `${ESPN_SITE_API}/site/v2/sports`;

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

function eventsOf(data: Record<string, unknown>, league: string): Game[] {
  return ((data.events ?? []) as Record<string, unknown>[]).map((e) => parseESPNEvent(e, league));
}

/**
 * Every game of the team's season. ESPN's schedule follows the current
 * season phase, which has two gaps: soccer's default answer is finished
 * matches only (upcoming ones need `fixture=true`), and a team out of a
 * postseason answers nothing at all, so an empty default falls back to the
 * regular season (`seasontype=2`) to keep the last result on the card.
 */
async function fetchSchedule(base: string, league: string, path: string): Promise<Game[]> {
  const isSoccer = path.startsWith('soccer/');
  const [primary, fixtures] = await Promise.all([
    fetchJson(`${base}/schedule`),
    isSoccer ? fetchJson(`${base}/schedule?fixture=true`).catch(() => ({} as Record<string, unknown>)) : Promise.resolve({} as Record<string, unknown>),
  ]);
  let games = eventsOf(primary, league);
  if (games.length === 0) {
    const regular = await fetchJson(`${base}/schedule?seasontype=2`).catch(() => ({} as Record<string, unknown>));
    games = eventsOf(regular, league);
  }
  const seen = new Set(games.map((g) => g.id));
  for (const g of eventsOf(fixtures, league)) {
    if (!seen.has(g.id)) {
      seen.add(g.id);
      games.push(g);
    }
  }
  return games;
}

/**
 * One card from ESPN's team and schedule endpoints. The team is addressed by
 * its ESPN id when the roster knows it (soccer rejects abbreviations); the
 * abbreviation is the fallback for a roster that could not be read.
 */
async function fetchTeamCard(league: string, abbr: string): Promise<TeamCard> {
  const key = teamKey(league, abbr);
  const path = LEAGUE_MAP[league];
  const roster = await findRosterTeam(league, abbr);
  const base = `${ESPN}/${path}/teams/${encodeURIComponent(roster?.id || abbr.toLowerCase())}`;
  const empty: TeamCard = {
    key, league: league.toUpperCase(), abbr: abbr.toUpperCase(),
    name: roster?.name ?? abbr.toUpperCase(), shortName: roster?.shortName ?? abbr.toUpperCase(),
    logo: roster?.logo ?? '', color: roster?.color || '666666', record: '', standing: '',
    featured: null, featuredKind: null, last: null,
  };

  const [teamResult, scheduleResult] = await Promise.allSettled([fetchJson(base), fetchSchedule(base, league, path)]);

  if (teamResult.status === 'rejected') {
    log.warn(`team lookup failed for ${key}: ${String(teamResult.reason)}`);
    return { ...empty, error: true };
  }
  const team = (teamResult.value.team ?? {}) as Record<string, unknown>;
  const logos = team.logos as Record<string, unknown>[] | undefined;
  const recordItems = (team.record as Record<string, unknown> | undefined)?.items as Record<string, unknown>[] | undefined;

  const card: TeamCard = {
    ...empty,
    abbr: (team.abbreviation as string) ?? empty.abbr,
    name: (team.displayName as string) ?? empty.name,
    shortName: (team.shortDisplayName as string) ?? (team.name as string) ?? empty.shortName,
    logo: (logos?.[0]?.href as string) ?? empty.logo,
    color: (team.color as string) ?? empty.color,
    record: (recordItems?.[0]?.summary as string) ?? '',
    standing: (team.standingSummary as string) ?? '',
  };
  const rank = Number(team.rank);
  if (Number.isFinite(rank) && rank >= 1 && rank <= 25) card.rank = rank;

  if (scheduleResult.status === 'rejected') {
    log.warn(`schedule lookup failed for ${key}: ${String(scheduleResult.reason)}`);
    return { ...card, error: true };
  }
  return { ...card, ...pickFeaturedGame(scheduleResult.value) };
}

/**
 * ESPN's team schedule now and then drops the score from a game in progress.
 * The league scoreboard carries the same event, so a started or finished
 * game missing a score reads it from there; each league is read once. A
 * scoreboard that cannot be read leaves the score missing, never 0.
 */
async function withScoreboardScores(cards: TeamCard[]): Promise<TeamCard[]> {
  const leagues = leaguesMissingScores(cards);
  if (leagues.length === 0) return cards;
  const boards = await Promise.all(leagues.map(async (league) => {
    try {
      return [league, await fetchScoreboard(league)] as const;
    } catch (err) {
      log.warn(`scoreboard lookup failed for ${league}: ${String(err)}`);
      return [league, [] as Game[]] as const;
    }
  }));
  return fillMissingScores(cards, new Map(boards));
}

function parseTeams(param: string | null): { league: string; abbr: string }[] {
  const seen = new Set<string>();
  const out: { league: string; abbr: string }[] = [];
  for (const raw of parseCommaList(param)) {
    const parsed = parseTeamKey(raw);
    if (!parsed || !LEAGUE_MAP[parsed.league]) continue;
    const key = teamKey(parsed.league, parsed.abbr);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}

const { GET, cache } = cachedProxyRoute<{ cards: TeamCard[] }>({
  auth: 'display',
  ttlMs: 60 * 1000, // 1 minute, like the scoreboard
  // Request order is the favorites' priority order and the cards come back
  // in it, so the key keeps the order rather than sorting it away.
  cacheKey: (req) => parseTeams(req.nextUrl.searchParams.get('teams')).map((t) => teamKey(t.league, t.abbr)).join(','),
  execute: async (req) => {
    const teams = parseTeams(req.nextUrl.searchParams.get('teams'));
    if (teams.length === 0) {
      return NextResponse.json({ error: 'No teams given' }, { status: 400 });
    }
    if (teams.length > MAX_FAVORITE_TEAMS) {
      return NextResponse.json({ error: `At most ${MAX_FAVORITE_TEAMS} teams per request` }, { status: 400 });
    }
    const cards = await Promise.all(teams.map((t) => fetchTeamCard(t.league, t.abbr)));
    return { cards: await withScoreboardScores(cards) };
  },
  errorMessage: 'Failed to fetch team scores',
});

/** @internal */
export { GET, cache };
