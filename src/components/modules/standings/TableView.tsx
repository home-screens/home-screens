'use client';

import { useRotatingIndex } from '@/hooks/useRotatingIndex';
import type { StandingsGroup, StandingsEntry } from '@/lib/espn-standings';
import { formatRecord, getPlayoffTeamCount, isSoccer, StandingsHeader, StandingsTeamRow } from './shared';

interface TableViewProps {
  groups: StandingsGroup[];
  teamsToShow: number;
  showPlayoffLine: boolean;
  rotationIntervalMs: number;
  grouping: 'division' | 'conference' | 'league';
}

function getColumns(league: string): { key: string; label: string; width: string }[] {
  const l = league.toLowerCase();
  if (l === 'nfl') {
    return [
      { key: 'record', label: 'W-L', width: 'w-14' },
      { key: 'pct', label: 'PCT', width: 'w-12' },
      { key: 'pf', label: 'PF', width: 'w-10' },
      { key: 'pa', label: 'PA', width: 'w-10' },
      { key: 'diff', label: 'DIFF', width: 'w-12' },
      { key: 'strk', label: 'STRK', width: 'w-12' },
    ];
  }
  if (l === 'nhl') {
    return [
      { key: 'gp', label: 'GP', width: 'w-9' },
      { key: 'record', label: 'W-L-OT', width: 'w-18' },
      { key: 'pts', label: 'PTS', width: 'w-10' },
      { key: 'diff', label: 'DIFF', width: 'w-12' },
      { key: 'strk', label: 'STRK', width: 'w-12' },
    ];
  }
  if (isSoccer(l)) {
    return [
      { key: 'gp', label: 'GP', width: 'w-9' },
      { key: 'record', label: 'W-D-L', width: 'w-14' },
      { key: 'pts', label: 'PTS', width: 'w-10' },
      { key: 'gd', label: 'GD', width: 'w-12' },
    ];
  }
  // NBA, MLB, WNBA
  return [
    { key: 'record', label: 'W-L', width: 'w-12' },
    { key: 'pct', label: 'PCT', width: 'w-12' },
    { key: 'gb', label: 'GB', width: 'w-10' },
    { key: 'strk', label: 'STRK', width: 'w-12' },
    { key: 'l10', label: 'L10', width: 'w-12' },
  ];
}

function CellValue({ entry, col, league }: { entry: StandingsEntry; col: string; league: string }) {
  switch (col) {
    case 'record':
      return <>{formatRecord(entry, league)}</>;
    case 'pct':
      return <>{entry.winPct.toFixed(3).replace(/^0/, '')}</>;
    case 'gb':
      return <>{entry.gamesBack !== undefined && entry.gamesBack > 0 ? entry.gamesBack : '—'}</>;
    case 'strk':
      return (
        <span className={entry.streak?.startsWith('W') ? 'text-emerald-400' : entry.streak?.startsWith('L') ? 'text-red-400' : ''}>
          {entry.streak ?? '—'}
        </span>
      );
    case 'l10':
      return <>{entry.last10 ?? '—'}</>;
    case 'pts':
      return <>{entry.points ?? 0}</>;
    case 'gp':
      return <>{entry.gamesPlayed ?? 0}</>;
    case 'pf':
      return <>{entry.pointsFor ?? 0}</>;
    case 'pa':
      return <>{entry.pointsAgainst ?? 0}</>;
    case 'diff': {
      const diff = Math.round(entry.differential ?? entry.goalDiff ?? 0);
      return (
        <span className={diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : ''}>
          {diff > 0 ? `+${diff}` : diff}
        </span>
      );
    }
    case 'gd': {
      const gd = Math.round(entry.goalDiff ?? entry.differential ?? 0);
      return (
        <span className={gd > 0 ? 'text-emerald-400' : gd < 0 ? 'text-red-400' : ''}>
          {gd > 0 ? `+${gd}` : gd}
        </span>
      );
    }
    default:
      return <>—</>;
  }
}

export function TableView({ groups, teamsToShow, showPlayoffLine, rotationIntervalMs, grouping }: TableViewProps) {
  const index = useRotatingIndex(groups.length, rotationIntervalMs);
  const group = groups[index];

  if (!group) return null;

  const columns = getColumns(group.league);
  const entries = teamsToShow > 0 ? group.entries.slice(0, teamsToShow) : group.entries;
  const playoffCount = getPlayoffTeamCount(group.league, grouping);
  const maxWinPct = Math.max(...entries.map((e) => e.winPct), 0.001);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <StandingsHeader league={group.league} groupName={group.name} total={groups.length} current={index} />

      {/* Column headers */}
      <div className="flex items-center gap-1.5 px-2 pb-1" style={{ paddingLeft: 'calc(0.5rem + 3px)' }}>
        <span style={{ width: '1.2em', fontSize: '0.6em' }} className="text-white/25 text-right shrink-0">#</span>
        <div style={{ width: 18 }} className="shrink-0" />
        <div className="flex-1" />
        {columns.map((col) => (
          <span
            key={col.key}
            className={`${col.width} text-right text-white/25 uppercase tracking-wider shrink-0`}
            style={{ fontSize: '0.55em' }}
          >
            {col.label}
          </span>
        ))}
      </div>

      {/* Team rows */}
      <div className="flex-1 overflow-hidden">
        {entries.map((entry) => {
          const barWidth = maxWinPct > 0 ? (entry.winPct / maxWinPct) * 100 : 0;

          return (
            <StandingsTeamRow
              key={entry.teamAbbr}
              entry={entry}
              showPlayoffCutoff={showPlayoffLine && entry.rank === playoffCount}
              barWidth={barWidth}
              nameWrapperClassName="flex-1 min-w-0 flex items-center gap-1 relative"
            >
              {columns.map((col) => (
                <span
                  key={col.key}
                  className={`${col.width} text-right text-white/60 tabular-nums shrink-0 relative`}
                  style={{ fontSize: '0.7em' }}
                >
                  <CellValue entry={entry} col={col.key} league={group.league} />
                </span>
              ))}
            </StandingsTeamRow>
          );
        })}
      </div>
    </div>
  );
}
