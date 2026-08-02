import type { ReactNode } from 'react';
import type { StandingsEntry } from '@/lib/espn-standings';
import { PaginationDots } from '../shared/PaginationDots';
import { TeamLogo } from '../shared/TeamLogo';

export { TeamLogo };

interface StandingsTeamRowProps {
  entry: StandingsEntry;
  showPlayoffCutoff: boolean;
  showGradientBar?: boolean;
  barWidth?: number;
  borderWidth?: number;
  logoSize?: number;
  rowClassName?: string;
  rankClassName?: string;
  rankStyle?: React.CSSProperties;
  nameWrapperClassName?: string;
  nameClassName?: string;
  nameStyle?: React.CSSProperties;
  clincherClassName?: string;
  clincherStyle?: React.CSSProperties;
  teamLabel?: string;
  children?: ReactNode;
}

export function StandingsTeamRow({
  entry,
  showPlayoffCutoff,
  showGradientBar = true,
  barWidth = 0,
  borderWidth = 3,
  logoSize = 18,
  rowClassName = 'relative flex items-center gap-1.5 py-1 px-2',
  rankClassName = 'text-white/30 tabular-nums shrink-0 relative',
  rankStyle = { fontSize: '0.7em', width: '1.2em', textAlign: 'right' as const },
  nameWrapperClassName,
  nameClassName = 'text-white/90 truncate font-medium',
  nameStyle = { fontSize: '0.8em' },
  clincherClassName = 'text-emerald-400/70 font-medium shrink-0',
  clincherStyle = { fontSize: '0.6em' },
  teamLabel = entry.teamShort || entry.teamAbbr,
  children,
}: StandingsTeamRowProps) {
  const clincher = entry.clincher && (
    <span className={clincherClassName} style={clincherStyle}>
      {entry.clincher}
    </span>
  );

  const nameSection = nameWrapperClassName ? (
    <div className={nameWrapperClassName}>
      <span className={nameClassName} style={nameStyle}>
        {teamLabel}
      </span>
      {clincher}
    </div>
  ) : (
    <span className={`flex-1 min-w-0 ${nameClassName}`} style={nameStyle}>
      {teamLabel}
      {clincher}
    </span>
  );

  return (
    <div
      className={`${rowClassName} ${
        showPlayoffCutoff ? 'border-b border-dashed border-white/20' : ''
      }`}
      style={{ borderLeft: `${borderWidth}px solid #${entry.teamColor}` }}
    >
      {showGradientBar && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, #${entry.teamColor}10 0%, transparent ${barWidth}%)`,
          }}
        />
      )}

      <span className={rankClassName} style={rankStyle}>
        {entry.rank}
      </span>

      <div className={`shrink-0${showGradientBar ? ' relative' : ''}`}>
        <TeamLogo src={entry.teamLogo} alt={entry.teamAbbr} size={logoSize} />
      </div>

      {nameSection}

      {children}
    </div>
  );
}

export function formatRecord(entry: StandingsEntry, league: string): string {
  const l = league.toLowerCase();
  if (l === 'nhl') {
    return `${entry.wins}-${entry.losses}${entry.otLosses ? `-${entry.otLosses}` : ''}`;
  }
  if (['mls', 'epl', 'laliga', 'bundesliga', 'seriea', 'ligue1', 'liga_mx'].includes(l)) {
    return `${entry.wins}-${entry.draws ?? 0}-${entry.losses}`;
  }
  if (l === 'nfl') {
    return entry.ties ? `${entry.wins}-${entry.losses}-${entry.ties}` : `${entry.wins}-${entry.losses}`;
  }
  return `${entry.wins}-${entry.losses}`;
}

export function getPlayoffTeamCount(league: string, grouping: 'division' | 'conference' | 'league' = 'conference'): number {
  const l = league.toLowerCase();
  const perConf = (() => {
    switch (l) {
      case 'nfl': return 7;
      case 'nba': return 10;
      case 'wnba': return 8;
      case 'mlb': return 6;
      case 'nhl': return 8;
      default: return 0;
    }
  })();
  // Double for two-conference leagues when viewing full league standings
  const twoConference = ['nfl', 'nba', 'mlb', 'nhl'];
  if (grouping === 'league' && twoConference.includes(l)) return perConf * 2;
  return perConf;
}

const SOCCER_LEAGUES = ['mls', 'epl', 'laliga', 'bundesliga', 'seriea', 'ligue1', 'liga_mx'];

export function isSoccer(league: string): boolean {
  return SOCCER_LEAGUES.includes(league.toLowerCase());
}

export function StandingsHeader({
  league,
  groupName,
  total,
  current,
}: {
  league: string;
  groupName: string;
  total: number;
  current: number;
}) {
  return (
    <div className="flex items-center justify-between px-2 pb-1.5 mb-1 border-b border-white/10">
      <div className="flex items-center gap-2">
        <span
          className="font-semibold tracking-widest uppercase text-white/40"
          style={{ fontSize: '0.65em' }}
        >
          {league}
        </span>
        <span className="text-white/60 font-medium" style={{ fontSize: '0.75em' }}>
          {groupName}
        </span>
      </div>
      <PaginationDots total={total} current={current} />
    </div>
  );
}
