import { NextResponse } from 'next/server';
import { cachedProxyRoute, createTTLCache, fetchWithTimeout } from '@/lib/api-utils';
import { LEAGUE_MAP } from '@/lib/espn';
import {
  type ParsedGroup,
  parseStandings,
  groupByConference,
  groupByLeague,
  groupByDivision,
} from '@/lib/espn-standings';

export const dynamic = 'force-dynamic';

/** @internal exported for test cleanup */
export const colorCache = createTTLCache<Map<string, string>>(60 * 60 * 1000); // 1 hour

async function fetchTeamColors(path: string, league: string): Promise<Map<string, string>> {
  const cached = colorCache.get(league);
  if (cached) return cached;

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/teams`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return new Map();
    const data = await res.json();
    const teams = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
    const colorMap = new Map<string, string>();
    for (const t of teams) {
      const team = t.team ?? t;
      const abbr = team.abbreviation as string;
      const color = team.color as string;
      if (abbr && color) colorMap.set(abbr, color);
    }
    colorCache.set(league, colorMap);
    return colorMap;
  } catch {
    return new Map();
  }
}

const { GET, cache } = cachedProxyRoute<{ groups: ParsedGroup[] }>({
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

    const url = `https://site.api.espn.com/apis/v2/sports/${path}/standings`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      console.error(`[standings] ESPN API error for ${league}: ${res.status}`);
      return NextResponse.json(
        { error: `Failed to fetch ${league} standings` },
        { status: 502 },
      );
    }

    const [data, teamColors] = await Promise.all([
      res.json(),
      fetchTeamColors(path, league),
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
