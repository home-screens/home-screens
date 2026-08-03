import type { Game } from '@/lib/espn';
import { TeamLogo, formatScore } from './shared';
import TickerMarquee from '../TickerMarquee';

export function TickerView({ games, speed }: { games: Game[]; speed: number }) {
  return (
    <TickerMarquee itemCount={games.length} speed={speed} gap={8}>
      {games.map((game) => (
        <span key={game.id} className="inline-flex items-center gap-1.5" style={{ fontSize: '0.85em' }}>
          <TeamLogo src={game.awayTeamLogo} alt={game.awayTeamAbbr} size={16} />
          <span className="font-semibold text-white/80">{game.awayTeamAbbr}</span>
          <span className="font-bold tabular-nums">{formatScore(game, game.awayScore)}</span>
          <span className="text-white/25 mx-0.5">&ndash;</span>
          <span className="font-bold tabular-nums">{formatScore(game, game.homeScore)}</span>
          <span className="font-semibold text-white/80">{game.homeTeamAbbr}</span>
          <TeamLogo src={game.homeTeamLogo} alt={game.homeTeamAbbr} size={16} />
          {game.state === 'in' && (
            <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
          )}
        </span>
      ))}
    </TickerMarquee>
  );
}
