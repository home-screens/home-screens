import type { Game } from '@/lib/espn';
import { leagueWallCode } from '@/lib/espn';
import { favoriteSide } from '@/lib/sports-order';
import { TeamLogo, formatScore, RankTag, gameStatusLabel, useGameStatusWords, type KickoffFn } from './shared';
import TickerMarquee from '../TickerMarquee';

/**
 * One scrolling line of games. A game that has not started shows when it
 * starts where the score will go; a game in progress shows its clock and a
 * finished one says so. A favorite team's game carries the same strip in the
 * team's color the other views draw, and the league code appears once the
 * line mixes leagues.
 */
export function TickerView({ games, speed, kickoff, favorites = [] }: {
  games: Game[]; speed: number; kickoff: KickoffFn; favorites?: string[];
}) {
  const words = useGameStatusWords();
  const mixedLeagues = new Set(games.map((g) => g.league)).size > 1;
  return (
    <TickerMarquee itemCount={games.length} speed={speed} gap={8}>
      {games.map((game) => {
        const side = favoriteSide(game, favorites);
        const barColor = side === 'away' ? game.awayTeamColor : side === 'home' ? game.homeTeamColor : null;
        const startsAt = game.state === 'pre' ? kickoff(game) : null;
        const status = game.state === 'pre' ? null : gameStatusLabel(game, null, words);
        return (
          <span key={game.id} className="inline-flex items-center gap-1.5" style={{ fontSize: '0.85em' }} data-game-state={game.state}>
            {barColor && (
              <span
                data-testid="favorite-bar"
                className="w-[3px] self-stretch rounded-full"
                style={{ backgroundColor: `#${barColor}` }}
              />
            )}
            {mixedLeagues && (
              <span className="font-bold uppercase tracking-wider text-current/30" style={{ fontSize: '0.65em' }}>
                {leagueWallCode(game.league)}
              </span>
            )}
            <TeamLogo src={game.awayTeamLogo} alt={game.awayTeamAbbr} size={16} />
            <RankTag rank={game.awayRank} />
            <span className="font-semibold text-current/80">{game.awayTeamAbbr}</span>
            {startsAt ? (
              <span className="text-current/60 mx-0.5" style={{ fontSize: '0.8em' }} data-testid="ticker-kickoff">{startsAt}</span>
            ) : (
              <>
                <span className="font-bold tabular-nums">{formatScore(game, game.awayScore)}</span>
                <span className="text-current/25 mx-0.5">&ndash;</span>
                <span className="font-bold tabular-nums">{formatScore(game, game.homeScore)}</span>
              </>
            )}
            <RankTag rank={game.homeRank} />
            <span className="font-semibold text-current/80">{game.homeTeamAbbr}</span>
            <TeamLogo src={game.homeTeamLogo} alt={game.homeTeamAbbr} size={16} />
            {game.state === 'in' && (
              <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
            )}
            {status && (
              <span
                className={game.state === 'in' ? 'text-green-400' : 'text-current/40'}
                style={{ fontSize: '0.75em' }}
                data-testid="ticker-status"
              >
                {status}
              </span>
            )}
          </span>
        );
      })}
    </TickerMarquee>
  );
}
