'use client';

import { useRotatingIndex } from '@/hooks/useRotatingIndex';
import type { StandingsGroup } from '@/lib/espn-standings';
import { formatRecord, getPlayoffTeamCount, StandingsTeamRow } from './shared';
import { PaginationDots } from '../shared/PaginationDots';

interface ConferenceViewProps {
  groups: StandingsGroup[];
  teamsToShow: number;
  showPlayoffLine: boolean;
  rotationIntervalMs: number;
  grouping: 'division' | 'conference' | 'league';
}

function ConferenceColumn({
  group,
  teamsToShow,
  showPlayoffLine,
  grouping,
}: {
  group: StandingsGroup;
  teamsToShow: number;
  showPlayoffLine: boolean;
  grouping: 'division' | 'conference' | 'league';
}) {
  const entries = teamsToShow > 0 ? group.entries.slice(0, teamsToShow) : group.entries;
  const playoffCount = getPlayoffTeamCount(group.league, grouping);

  return (
    <div className="flex-1 min-w-0">
      {/* Conference header */}
      <div className="px-1.5 pb-1 mb-1 border-b border-white/10">
        <span className="text-white/50 font-medium" style={{ fontSize: '0.65em' }}>
          {group.name}
        </span>
      </div>

      {/* Team rows */}
      {entries.map((entry) => (
        <StandingsTeamRow
          key={entry.teamAbbr}
          entry={entry}
          showPlayoffCutoff={showPlayoffLine && entry.rank === playoffCount}
          showGradientBar={false}
          borderWidth={2}
          logoSize={14}
          rowClassName="flex items-center gap-1 py-0.5 px-1"
          rankClassName="text-white/25 tabular-nums shrink-0"
          rankStyle={{ fontSize: '0.6em', width: '1em', textAlign: 'right' }}
          nameClassName="text-white/80 truncate"
          nameStyle={{ fontSize: '0.65em' }}
          teamLabel={entry.teamAbbr}
          clincherClassName="text-emerald-400/60 ml-0.5"
          clincherStyle={{ fontSize: '0.8em' }}
        >
          <span className="text-white/50 tabular-nums shrink-0" style={{ fontSize: '0.6em' }}>
            {formatRecord(entry, group.league)}
          </span>
        </StandingsTeamRow>
      ))}
    </div>
  );
}

export function ConferenceView({ groups, teamsToShow, showPlayoffLine, rotationIntervalMs, grouping }: ConferenceViewProps) {
  // Pair up groups (2 at a time for side-by-side)
  const pairs: StandingsGroup[][] = [];
  for (let i = 0; i < groups.length; i += 2) {
    pairs.push(groups.slice(i, i + 2));
  }

  const index = useRotatingIndex(pairs.length, rotationIntervalMs);
  const pair = pairs[index];

  if (!pair || pair.length === 0) return null;

  return (
    <div className="flex flex-col h-full">
      {/* League header */}
      <div className="flex items-center justify-between px-2 pb-1.5 mb-1 border-b border-white/10">
        <span
          className="font-semibold tracking-widest uppercase text-white/40"
          style={{ fontSize: '0.65em' }}
        >
          {pair[0].league}
        </span>
        <PaginationDots total={pairs.length} current={index} />
      </div>

      {/* Side-by-side conferences */}
      <div className="flex gap-2 flex-1 overflow-hidden">
        {pair.map((group) => (
          <ConferenceColumn
            key={group.name}
            group={group}
            teamsToShow={teamsToShow}
            showPlayoffLine={showPlayoffLine}
            grouping={grouping}
          />
        ))}
      </div>
    </div>
  );
}
