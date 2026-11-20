import { NextResponse } from 'next/server';
import { cachedProxyRoute, fetchWithTimeout } from '@/lib/api-utils';
import { ESPN_SITE_API, LEAGUE_MAP } from '@/lib/espn';
import { teamColorsFor } from '@/lib/espn-rosters';
import {
  type StandingsGroup,
  parseStandings,
  groupByConference,
  groupByLeague,
  groupByDivision,
} from '@/lib/espn-standings';
import { logger } from '@/lib/logger';

const log = logger('standings');

export const dynamic = 'force-dynamic';

const { GET, cache } = cachedProxyRoute<{ groups: StandingsGroup[] }>({
  auth: 'display',
  ttlMs: 5 * 60 * 1000, // 5 minutes
  cacheKey: (req) => {
    const league = req.nextUrl.searchParams.get('league') || 'nfl';
    const grouping = req.nextUrl.searchParams.get('grouping') || 'division';
    return `${league}:${grouping}`;
  },
  execute: async (req) => {
    const league = req.nextUrl.searchParams.get('league') || 'nfl';
    const grouping = req.nextUrl.searchParams.get('grouping') || 'division';

    const path = LEAGUE_MAP[league.toLowerCase()];
    if (!path) {
      return NextResponse.json({ error: `Unknown league: ${league}` }, { status: 400 });
    }

    const url = `${ESPN_SITE_API}/v2/sports/${path}/standings`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      log.error(`ESPN API error for ${league}: ${res.status}`);
      return NextResponse.json(
        { error: `Failed to fetch ${league} standings` },
        { status: 502 },
      );
    }

    const [data, teamColors] = await Promise.all([
      res.json(),
      teamColorsFor(league),
    ]);
    let allGroups = parseStandings(data, league);

    // Apply grouping
    if (grouping === 'conference') {
      allGroups = groupByConference(allGroups, data, league);
    } else if (grouping === 'league') {
      allGroups = groupByLeague(allGroups, league);
    } else if (grouping === 'division') {
      allGroups = groupByDivision(allGroups, league);
    }

    // Merge team colors from teams API (standings API doesn't include them)
    if (teamColors.size > 0) {
      for (const group of allGroups) {
        for (const entry of group.entries) {
          const color = teamColors.get(entry.teamAbbr);
          if (color) entry.teamColor = color;
        }
      }
    }

    return { groups: allGroups };
  },
  errorMessage: 'Failed to fetch standings',
});

/** @internal */
export { GET, cache };
