'use client';

import { useRotatingIndex } from '@/hooks/useRotatingIndex';
import type { Game } from '@/lib/espn';
import { leagueWallCode } from '@/lib/espn';
import { favoriteSide } from '@/lib/sports-order';
import { TeamLogo, isWinner, formatScore, GameStatus, FavoriteBar, RankTag, type KickoffFn } from './shared';
import { PaginationDots } from '../shared/PaginationDots';
import { withAlpha } from '@/lib/hex-color';

function TeamRow({
  logo,
  abbr,
  record,
  score,
  winner,
  color,
  rank,
}: {
  logo: string;
  abbr: string;
  record: string;
  score: string;
  winner: boolean;
  color: string;
  rank?: number;
}) {
  return (
    <div className="flex items-center gap-3 w-full">
      <div className="rounded-lg p-1.5 shrink-0" style={{ backgroundColor: `#${withAlpha(color, 0.08)}` }}>
        <TeamLogo src={logo} alt={abbr} size={36} />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`font-bold truncate flex items-baseline gap-1 ${winner ? 'text-current' : 'text-current/70'}`}
          style={{ fontSize: '1.05em' }}
        >
          <RankTag rank={rank} />
          {abbr}
        </div>
        {record && (
          <div className="text-current/35 truncate" style={{ fontSize: '0.65em' }}>
            {record}
          </div>
        )}
      </div>
      <div
        className={`font-bold tabular-nums ${winner ? 'text-current' : 'text-current/60'}`}
        style={{ fontSize: '1.6em' }}
      >
        {score}
      </div>
    </div>
  );
}

export function ScoreboardView({ games, kickoff, favorites = [], rotateIntervalMs }: { games: Game[]; kickoff: KickoffFn; favorites?: string[]; rotateIntervalMs: number }) {
  const index = useRotatingIndex(games.length, rotateIntervalMs);
  const game = games[index];

  if (!game) return null;
  const side = favoriteSide(game, favorites);
  const barColor = side === 'away' ? game.awayTeamColor : side === 'home' ? game.homeTeamColor : null;

  return (
    <div className="relative flex flex-col justify-center h-full gap-3 px-4">
      <FavoriteBar color={barColor} inset="8%" />
      <div className="flex items-center justify-between">
        <span
          className="font-semibold tracking-widest uppercase text-current/40"
          style={{ fontSize: '0.65em' }}
        >
          {leagueWallCode(game.league)}
        </span>
        {game.broadcast && (
          <span className="text-current/30" style={{ fontSize: '0.6em' }}>
            {game.broadcast}
          </span>
        )}
      </div>

      <TeamRow
        logo={game.awayTeamLogo}
        abbr={game.awayTeamAbbr}
        record={game.awayRecord}
        score={formatScore(game, game.awayScore)}
        winner={isWinner(game, 'away')}
        color={game.awayTeamColor}
        rank={game.awayRank}
      />

      <div className="h-px bg-white/10" />

      <TeamRow
        logo={game.homeTeamLogo}
        abbr={game.homeTeamAbbr}
        record={game.homeRecord}
        score={formatScore(game, game.homeScore)}
        winner={isWinner(game, 'home')}
        color={game.homeTeamColor}
        rank={game.homeRank}
      />

      <div className="flex items-center justify-between">
        <GameStatus
          state={game.state}
          kickoff={kickoff(game)}
          status={game.status}
          fontSize="0.7em"
          gap="gap-1.5"
        />
        <PaginationDots total={games.length} current={index} threshold={12} />
      </div>
    </div>
  );
}
