'use client';

import type { StandingsGroup } from '@/lib/espn-standings';
import { isFavoriteTeam } from '@/lib/sports-order';
import { formatRecord, getPlayoffTeamCount, StandingsHeader, StandingsTeamRow } from './shared';
import { standingsRowsKey, useStandingsPaging } from './paging';
import { GamePagesFooter } from '../sports/shared';

interface CompactViewProps {
  groups: StandingsGroup[];
  teamsToShow: number;
  showPlayoffLine: boolean;
  rotationIntervalMs: number;
  grouping: 'division' | 'conference' | 'league';
  /** `<league>:<ABBR>` keys whose rows stand out. */
  favorites?: string[];
  /** The card's type size; a change re-measures the pages. */
  fontSize: number;
}

export function CompactView({ groups, teamsToShow, showPlayoffLine, rotationIntervalMs, grouping, favorites = [], fontSize }: CompactViewProps) {
  const { ref, group: index, page, pages, visible } = useStandingsPaging(
    groups.length,
    (g) => standingsRowsKey(groups[g], teamsToShow, fontSize),
    rotationIntervalMs,
  );
  const group = groups[index];

  if (!group) return null;

  const entries = teamsToShow > 0 ? group.entries.slice(0, teamsToShow) : group.entries;
  const playoffCount = getPlayoffTeamCount(group.league, grouping);
  const maxWinPct = Math.max(...entries.map((e) => e.winPct), 0.001);

  return (
    <div className="flex flex-col h-full">
      <StandingsHeader league={group.league} groupName={group.name} total={groups.length} current={index} />

      <div ref={ref} className="flex-1 min-h-0 overflow-hidden" data-standings-pages={pages?.length ?? 1}>
        {entries.map((entry, i) => {
          const barWidth = maxWinPct > 0 ? (entry.winPct / maxWinPct) * 100 : 0;

          return (
            <StandingsTeamRow
              key={entry.teamAbbr}
              entry={entry}
              showPlayoffCutoff={showPlayoffLine && entry.rank === playoffCount}
              highlight={isFavoriteTeam(group.league, entry.teamAbbr, favorites)}
              hidden={visible !== null && !visible.has(i)}
              barWidth={barWidth}
              logoSize={16}
              rowClassName="relative flex items-center gap-2 py-0.5 px-2"
              nameClassName="text-current/90 truncate font-medium relative"
              nameStyle={{ fontSize: '0.75em' }}
              clincherClassName="text-emerald-400/70 ml-1"
              clincherStyle={{ fontSize: '0.8em' }}
            >
              <span className="text-current/60 tabular-nums shrink-0 relative" style={{ fontSize: '0.7em' }}>
                {formatRecord(entry, group.league)}
              </span>

              {entry.points !== undefined && (
                <span className="text-current/80 tabular-nums font-semibold shrink-0 relative" style={{ fontSize: '0.7em', width: '2em', textAlign: 'right' }}>
                  {entry.points}
                </span>
              )}
            </StandingsTeamRow>
          );
        })}
      </div>
      <GamePagesFooter pages={pages} index={page} />
    </div>
  );
}
