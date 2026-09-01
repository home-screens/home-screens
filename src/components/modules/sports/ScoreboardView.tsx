'use client';

import { useRotatingIndex } from '@/hooks/useRotatingIndex';
import type { Game } from '@/lib/espn';
import { TeamLogo, isWinner, formatScore, GameStatus } from './shared';
import { PaginationDots } from '../shared/PaginationDots';

function TeamRow({
  logo,
  abbr,
  record,
  score,
  winner,
  color,
}: {
  logo: string;
  abbr: string;
  record: string;
  score: string;
  winner: boolean;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 w-full">
      <div className="rounded-lg p-1.5 shrink-0" style={{ backgroundColor: `#${color}15` }}>
        <TeamLogo src={logo} alt={abbr} size={36} />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`font-bold truncate ${winner ? 'text-white' : 'text-white/70'}`}
          style={{ fontSize: '1.05em' }}
        >
          {abbr}
        </div>
        {record && (
          <div className="text-white/35 truncate" style={{ fontSize: '0.65em' }}>
            {record}
          </div>
        )}
      </div>
      <div
        className={`font-bold tabular-nums ${winner ? 'text-white' : 'text-white/60'}`}
        style={{ fontSize: '1.6em' }}
      >
        {score}
      </div>
    </div>
  );
}

export function ScoreboardView({ games }: { games: Game[] }) {
  const index = useRotatingIndex(games.length, 10000);
  const game = games[index];

  if (!game) return null;

  return (
    <div className="flex flex-col justify-center h-full gap-3 px-4">
      <div className="flex items-center justify-between">
        <span
          className="font-semibold tracking-widest uppercase text-white/40"
          style={{ fontSize: '0.65em' }}
        >
          {game.league}
        </span>
        {game.broadcast && (
          <span className="text-white/30" style={{ fontSize: '0.6em' }}>
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
      />

      <div className="h-px bg-white/10" />

      <TeamRow
        logo={game.homeTeamLogo}
        abbr={game.homeTeamAbbr}
        record={game.homeRecord}
        score={formatScore(game, game.homeScore)}
        winner={isWinner(game, 'home')}
        color={game.homeTeamColor}
      />

      <div className="flex items-center justify-between">
        <GameStatus
          state={game.state}
          shortDetail={game.shortDetail}
          status={game.status}
          fontSize="0.7em"
          gap="gap-1.5"
        />
        <PaginationDots total={games.length} current={index} threshold={12} />
      </div>
    </div>
  );
}
