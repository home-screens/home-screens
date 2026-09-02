import { cachedProxyRoute, fetchWithTimeout, parseCommaList } from '@/lib/api-utils';
import { LEAGUE_MAP, parseESPNTeam } from '@/lib/espn';
import type { Game } from '@/lib/espn';

export const dynamic = 'force-dynamic';

async function fetchLeague(league: string): Promise<Game[]> {
  const path = LEAGUE_MAP[league.toLowerCase()];
  if (!path) return [];

  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Failed to fetch ${league} scores`);

  const data = await res.json();
  const events = data.events ?? [];

  return events.map((event: Record<string, unknown>) => {
    const competition = (event.competitions as Record<string, unknown>[])?.[0];
    const competitors = (competition?.competitors as Record<string, unknown>[]) ?? [];

    const home = competitors.find((c) => c.homeAway === 'home');
    const away = competitors.find((c) => c.homeAway === 'away');

    const homeTeam = home?.team as Record<string, unknown> | undefined;
    const awayTeam = away?.team as Record<string, unknown> | undefined;

    const homeRecords = home?.records as Record<string, unknown>[] | undefined;
    const awayRecords = away?.records as Record<string, unknown>[] | undefined;

    const broadcasts = competition?.broadcasts as Record<string, unknown>[] | undefined;
    const nationalBroadcast = broadcasts?.find((b) => b.market === 'national') ?? broadcasts?.[0];
    const broadcastNames = nationalBroadcast?.names as string[] | undefined;

    const status = event.status as Record<string, unknown> | undefined;
    const statusType = status?.type as Record<string, unknown> | undefined;

    const ht = parseESPNTeam(homeTeam);
    const at = parseESPNTeam(awayTeam);

    return {
      id: event.id as string,
      league: league.toUpperCase(),
      homeTeam: ht.name,
      awayTeam: at.name,
      homeTeamAbbr: ht.abbr,
      awayTeamAbbr: at.abbr,
      homeTeamLogo: ht.logo,
      awayTeamLogo: at.logo,
      homeTeamColor: ht.color,
      awayTeamColor: at.color,
      homeScore: Number(home?.score ?? 0),
      awayScore: Number(away?.score ?? 0),
      homeRecord: (homeRecords?.[0]?.summary as string) ?? '',
      awayRecord: (awayRecords?.[0]?.summary as string) ?? '',
      status: (statusType?.description as string) ?? 'Scheduled',
      detail: (statusType?.detail as string) ?? '',
      state: ((statusType?.state as string) ?? 'pre') as 'pre' | 'in' | 'post',
      startTime: (event.date as string) ?? '',
      broadcast: broadcastNames?.join(', ') ?? '',
    };
  });
}

const { GET, cache } = cachedProxyRoute<{ games: Game[] }>({
  auth: 'display',
  ttlMs: 60 * 1000, // 1 minute
  cacheKey: (req) => {
    const leaguesParam = req.nextUrl.searchParams.get('leagues') || 'nfl,nba';
    return parseCommaList(leaguesParam).sort().join(',');
  },
  execute: async (req) => {
    const leaguesParam = req.nextUrl.searchParams.get('leagues') || 'nfl,nba';
    const leagues = parseCommaList(leaguesParam);

    const results = await Promise.all(leagues.map(fetchLeague));
    const games = results.flat();
    return { games };
  },
  errorMessage: 'Failed to fetch sports scores',
});

/** @internal */
export { GET, cache };
