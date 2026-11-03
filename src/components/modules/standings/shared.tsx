import type { ReactNode } from 'react';
import type { StandingsEntry } from '@/lib/espn-standings';
import { leagueWallCode } from '@/lib/espn';
import { PaginationDots } from '../shared/PaginationDots';
import { TeamLogo } from '../shared/TeamLogo';
import { withAlpha } from '@/lib/hex-color';

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
  /** One of the module's favorite teams: the row is tinted in the team's color and its name is bright. */
  highlight?: boolean;
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
  rankClassName = 'text-current/30 tabular-nums shrink-0 relative',
  rankStyle = { fontSize: '0.7em', width: '1.2em', textAlign: 'right' as const },
  nameWrapperClassName,
  nameClassName = 'text-current/90 truncate font-medium',
  nameStyle = { fontSize: '0.8em' },
  clincherClassName = 'text-emerald-400/70 font-medium shrink-0',
  clincherStyle = { fontSize: '0.6em' },
  teamLabel = entry.teamShort || entry.teamAbbr,
  highlight = false,
  children,
}: StandingsTeamRowProps) {
  const clincher = entry.clincher && (
    <span className={clincherClassName} style={clincherStyle}>
      {entry.clincher}
    </span>
  );
  // AP poll rank after the name, small and muted, so it never reads as the
  // table position printed in the first column.
  const apRank = entry.apRank && (
    <span className="text-current/45 tabular-nums shrink-0 ml-1" style={{ fontSize: '0.8em' }} data-testid="ap-rank">
      #{entry.apRank}
    </span>
  );
  const nameClass = highlight ? `${nameClassName} !text-current font-semibold` : nameClassName;

  const nameSection = nameWrapperClassName ? (
    <div className={nameWrapperClassName}>
      <span className={nameClass} style={nameStyle}>
        {teamLabel}
      </span>
      {apRank}
      {clincher}
    </div>
  ) : (
    <span className={`flex-1 min-w-0 ${nameClass}`} style={nameStyle}>
      {teamLabel}
      {apRank}
      {clincher}
    </span>
  );

  return (
    <div
      className={`${rowClassName} ${
        showPlayoffCutoff ? 'border-b border-dashed border-white/20' : ''
      }`}
      style={{
        borderLeft: `${borderWidth}px solid #${entry.teamColor}`,
        // A favorite's row is washed in its own color, stronger at the edge
        // where the border already is, so it stands out at wall distance.
        ...(highlight ? { background: `linear-gradient(90deg, #${withAlpha(entry.teamColor, 0.333)} 0%, #${withAlpha(entry.teamColor, 0.09)} 100%)` } : {}),
      }}
      data-favorite={highlight ? 'true' : undefined}
    >
      {showGradientBar && !highlight && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, #${withAlpha(entry.teamColor, 0.06)} 0%, transparent ${barWidth}%)`,
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
          className="font-semibold tracking-widest uppercase text-current/40"
          style={{ fontSize: '0.65em' }}
        >
          {leagueWallCode(league)}
        </span>
        <span className="text-current/60 font-medium" style={{ fontSize: '0.75em' }}>
          {groupName}
        </span>
      </div>
      <PaginationDots total={total} current={current} />
    </div>
  );
}
