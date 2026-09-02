import type { Game } from '@/lib/espn';
import { TeamLogo, isWinner, formatScore, GameStatus, type KickoffFn } from './shared';

export function ListView({ games, kickoff }: { games: Game[]; kickoff: KickoffFn }) {
  return (
    <div className="flex flex-col justify-center h-full w-full gap-0.5 px-2 overflow-hidden">
      {games.map((game) => {
        const awayWins = isWinner(game, 'away');
        const homeWins = isWinner(game, 'home');

        return (
          <div
            key={game.id}
            className="flex items-center gap-2 py-1 border-b border-white/5 last:border-0"
          >
            <span
              className="font-bold uppercase tracking-wider text-white/30 shrink-0"
              style={{ fontSize: '0.55em', width: '2em' }}
            >
              {game.league}
            </span>

            <div className="flex items-center gap-1 min-w-0" style={{ width: '35%' }}>
              <TeamLogo src={game.awayTeamLogo} alt={game.awayTeamAbbr} size={16} />
              <span
                className={`font-semibold truncate ${awayWins ? 'text-white' : 'text-white/70'}`}
                style={{ fontSize: '0.8em' }}
              >
                {game.awayTeamAbbr}
              </span>
              <span
                className={`font-bold tabular-nums shrink-0 ${awayWins ? 'text-white' : 'text-white/60'}`}
                style={{ fontSize: '0.85em' }}
              >
                {formatScore(game, game.awayScore)}
              </span>
            </div>

            <span className="text-white/20 shrink-0" style={{ fontSize: '0.65em' }}>
              @
            </span>

            <div className="flex items-center gap-1 min-w-0" style={{ width: '35%' }}>
              <TeamLogo src={game.homeTeamLogo} alt={game.homeTeamAbbr} size={16} />
              <span
                className={`font-semibold truncate ${homeWins ? 'text-white' : 'text-white/70'}`}
                style={{ fontSize: '0.8em' }}
              >
                {game.homeTeamAbbr}
              </span>
              <span
                className={`font-bold tabular-nums shrink-0 ${homeWins ? 'text-white' : 'text-white/60'}`}
                style={{ fontSize: '0.85em' }}
              >
                {formatScore(game, game.homeScore)}
              </span>
            </div>

            <div className="shrink-0 ml-auto">
              <GameStatus
                state={game.state}
                kickoff={kickoff(game)}
                status={game.status}
                dotSize="w-1 h-1"
                fontSize="0.55em"
                postColor="text-white/35"
                preColor="text-white/50"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
