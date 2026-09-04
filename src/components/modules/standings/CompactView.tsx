'use client';

import { useRotatingIndex } from '@/hooks/useRotatingIndex';
import type { StandingsGroup } from '@/lib/espn-standings';
import { formatRecord, getPlayoffTeamCount, StandingsHeader, StandingsTeamRow } from './shared';

interface CompactViewProps {
  groups: StandingsGroup[];
  teamsToShow: number;
  showPlayoffLine: boolean;
  rotationIntervalMs: number;
  grouping: 'division' | 'conference' | 'league';
}

export function CompactView({ groups, teamsToShow, showPlayoffLine, rotationIntervalMs, grouping }: CompactViewProps) {
  const index = useRotatingIndex(groups.length, rotationIntervalMs);
  const group = groups[index];

  if (!group) return null;

  const entries = teamsToShow > 0 ? group.entries.slice(0, teamsToShow) : group.entries;
  const playoffCount = getPlayoffTeamCount(group.league, grouping);
  const maxWinPct = Math.max(...entries.map((e) => e.winPct), 0.001);

  return (
    <div className="flex flex-col h-full">
      <StandingsHeader league={group.league} groupName={group.name} total={groups.length} current={index} />

      <div className="flex-1 overflow-hidden">
        {entries.map((entry) => {
          const barWidth = maxWinPct > 0 ? (entry.winPct / maxWinPct) * 100 : 0;

          return (
            <StandingsTeamRow
              key={entry.teamAbbr}
              entry={entry}
              showPlayoffCutoff={showPlayoffLine && entry.rank === playoffCount}
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
    </div>
  );
}
