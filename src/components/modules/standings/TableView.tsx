'use client';

import type { StandingsGroup, StandingsEntry } from '@/lib/espn-standings';
import { isFavoriteTeam } from '@/lib/sports-order';
import { isSoccerLeague } from '@/lib/espn';
import { formatRecord, getPlayoffTeamCount, StandingsHeader, StandingsTeamRow } from './shared';
import { standingsRowsKey, useStandingsPaging } from './paging';
import { GamePagesFooter } from '../sports/shared';
import { useTranslate } from '@/i18n';
import { NO_VALUE } from '@/lib/constants';

interface TableViewProps {
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

type Translate = (key: string) => string;

/**
 * The columns a league's table carries, headed in the hub's language. The
 * record heading is built from the same letters the Sports module prints
 * for a win, a loss and a tie; soccer has its own letter for a draw.
 */
export function getColumns(league: string, t: Translate): { key: string; label: string; width: string }[] {
  const l = league.toLowerCase();
  const col = (name: string) => t(`standings.columns.${name}`);
  const win = t('sports.win');
  const loss = t('sports.loss');
  if (l === 'nfl') {
    return [
      { key: 'record', label: `${win}-${loss}`, width: 'w-14' },
      { key: 'pct', label: col('pct'), width: 'w-12' },
      { key: 'pf', label: col('pointsFor'), width: 'w-10' },
      { key: 'pa', label: col('pointsAgainst'), width: 'w-10' },
      { key: 'diff', label: col('diff'), width: 'w-12' },
      { key: 'strk', label: col('streak'), width: 'w-12' },
    ];
  }
  if (l === 'nhl') {
    return [
      { key: 'gp', label: col('gamesPlayed'), width: 'w-9' },
      { key: 'record', label: `${win}-${loss}-${col('overtime')}`, width: 'w-18' },
      { key: 'pts', label: col('points'), width: 'w-10' },
      { key: 'diff', label: col('diff'), width: 'w-12' },
      { key: 'strk', label: col('streak'), width: 'w-12' },
    ];
  }
  if (isSoccerLeague(l)) {
    return [
      { key: 'gp', label: col('gamesPlayed'), width: 'w-9' },
      { key: 'record', label: `${win}-${col('draw')}-${loss}`, width: 'w-14' },
      { key: 'pts', label: col('points'), width: 'w-10' },
      { key: 'gd', label: col('goalDiff'), width: 'w-12' },
    ];
  }
  // NBA, MLB, WNBA
  return [
    { key: 'record', label: `${win}-${loss}`, width: 'w-12' },
    { key: 'pct', label: col('pct'), width: 'w-12' },
    { key: 'gb', label: col('gamesBack'), width: 'w-10' },
    { key: 'strk', label: col('streak'), width: 'w-12' },
    { key: 'l10', label: col('last10'), width: 'w-12' },
  ];
}

/**
 * A streak as the hub's language writes it. The source sends "W3" or "L1";
 * the letter becomes the one the record column beside it uses for a win or
 * a loss, so a German table reads S3 under S-N, not W3.
 */
export function streakLabel(streak: string, win: string, loss: string): string {
  if (streak.startsWith('W')) return `${win}${streak.slice(1)}`;
  if (streak.startsWith('L')) return `${loss}${streak.slice(1)}`;
  return streak;
}

function CellValue({ entry, col, league, t }: { entry: StandingsEntry; col: string; league: string; t: Translate }) {
  switch (col) {
    case 'record':
      return <>{formatRecord(entry, league)}</>;
    case 'pct':
      return <>{entry.winPct.toFixed(3).replace(/^0/, '')}</>;
    case 'gb':
      return <>{entry.gamesBack !== undefined && entry.gamesBack > 0 ? entry.gamesBack : NO_VALUE}</>;
    case 'strk':
      return (
        <span className={entry.streak?.startsWith('W') ? 'text-emerald-400' : entry.streak?.startsWith('L') ? 'text-red-400' : ''}>
          {entry.streak ? streakLabel(entry.streak, t('sports.win'), t('sports.loss')) : NO_VALUE}
        </span>
      );
    case 'l10':
      return <>{entry.last10 ?? NO_VALUE}</>;
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
      return <>{NO_VALUE}</>;
  }
}

export function TableView({ groups, teamsToShow, showPlayoffLine, rotationIntervalMs, grouping, favorites = [], fontSize }: TableViewProps) {
  const t = useTranslate('modules');
  const { ref, group: index, page, pages, visible } = useStandingsPaging(
    groups.length,
    (g) => standingsRowsKey(groups[g], teamsToShow, fontSize),
    rotationIntervalMs,
  );
  const group = groups[index];

  if (!group) return null;

  const columns = getColumns(group.league, t);
  const entries = teamsToShow > 0 ? group.entries.slice(0, teamsToShow) : group.entries;
  const playoffCount = getPlayoffTeamCount(group.league, grouping);
  const maxWinPct = Math.max(...entries.map((e) => e.winPct), 0.001);

  return (
    <div className="flex flex-col h-full">
      <StandingsHeader league={group.league} groupName={group.name} total={groups.length} current={index} />

      <div className="flex items-center gap-1.5 px-2 pb-1" style={{ paddingLeft: 'calc(0.5rem + 3px)' }}>
        <span style={{ width: '1.2em', fontSize: '0.6em' }} className="text-current/25 text-right shrink-0">#</span>
        <div style={{ width: 18 }} className="shrink-0" />
        <div className="flex-1" />
        {columns.map((col) => (
          <span
            key={col.key}
            className={`${col.width} text-right text-current/25 uppercase tracking-wider shrink-0`}
            style={{ fontSize: '0.55em' }}
          >
            {col.label}
          </span>
        ))}
      </div>

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
              nameWrapperClassName="flex-1 min-w-0 flex items-center gap-1 relative"
            >
              {columns.map((col) => (
                <span
                  key={col.key}
                  className={`${col.width} text-right text-current/60 tabular-nums shrink-0 relative`}
                  style={{ fontSize: '0.7em' }}
                >
                  <CellValue entry={entry} col={col.key} league={group.league} t={t} />
                </span>
              ))}
            </StandingsTeamRow>
          );
        })}
      </div>
      <GamePagesFooter pages={pages} index={page} />
    </div>
  );
}
