'use client';

import type { Game } from '@/lib/espn';
import { leagueWallCode } from '@/lib/espn';
import { favoriteSide } from '@/lib/sports-order';
import { TeamLogo, isWinner, formatScore, GameStatus, FavoriteBar, RankTag, FAVORITE_GUTTER, GamePagesFooter, gamePagesKey, type KickoffFn } from './shared';
import { usePagedFit } from '../shared/usePagedFit';
import { usePagedRotation } from '@/hooks/usePagedRotation';
import { inkLikeTailwind } from '@/lib/constants';

function GameCard({ game, kickoff, favorites, hidden }: { game: Game; kickoff: KickoffFn; favorites: string[]; hidden: boolean }) {
  const awayWins = isWinner(game, 'away');
  const homeWins = isWinner(game, 'home');
  const side = favoriteSide(game, favorites);
  const barColor = side === 'away' ? game.awayTeamColor : side === 'home' ? game.homeTeamColor : null;

  return (
    <div
      data-game-card
      className="relative rounded-lg p-2.5 flex flex-col gap-1.5"
      style={{
        backgroundColor: inkLikeTailwind(0.05),
        display: hidden ? 'none' : undefined,
        paddingLeft: favorites.length > 0 ? `calc(0.625rem + ${FAVORITE_GUTTER})` : undefined,
      }}
    >
      <FavoriteBar color={barColor} inset="14%" />
      <div className="flex items-center justify-between" style={{ fontSize: '0.6em' }}>
        <span className="font-semibold tracking-wider uppercase text-current/40">
          {leagueWallCode(game.league)}
        </span>
        <GameStatus
          game={game}
          kickoff={kickoff(game)}
          dotSize="w-1 h-1"
          postColor="text-current/35"
          preColor="text-current/50"
        />
      </div>

      <div className="flex items-center gap-2">
        <TeamLogo src={game.awayTeamLogo} alt={game.awayTeamAbbr} size={20} />
        <RankTag rank={game.awayRank} />
        <span
          className={`flex-1 font-semibold truncate ${awayWins ? 'text-current' : 'text-current/70'}`}
          style={{ fontSize: '0.85em' }}
        >
          {game.awayTeamAbbr}
        </span>
        <span
          className={`font-bold tabular-nums ${awayWins ? 'text-current' : 'text-current/60'}`}
          style={{ fontSize: '0.95em' }}
        >
          {formatScore(game, game.awayScore)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <TeamLogo src={game.homeTeamLogo} alt={game.homeTeamAbbr} size={20} />
        <RankTag rank={game.homeRank} />
        <span
          className={`flex-1 font-semibold truncate ${homeWins ? 'text-current' : 'text-current/70'}`}
          style={{ fontSize: '0.85em' }}
        >
          {game.homeTeamAbbr}
        </span>
        <span
          className={`font-bold tabular-nums ${homeWins ? 'text-current' : 'text-current/60'}`}
          style={{ fontSize: '0.95em' }}
        >
          {formatScore(game, game.homeScore)}
        </span>
      </div>
    </div>
  );
}

/**
 * Two cards to a row. Cards that do not fit are not clipped: the grid is
 * measured once per game list / box / type size, cut into pages of whole
 * rows, and pages turn on the rotate interval. A college Saturday is sixty
 * games, which is thirty rows, which is many pages. Everything fits -> one
 * page, no rotation.
 */
export function CardsView({ games, kickoff, favorites = [], rotateIntervalMs, fontSize }: {
  games: Game[]; kickoff: KickoffFn; favorites?: string[]; rotateIntervalMs: number; fontSize: number;
}) {
  const { ref, pages } = usePagedFit('[data-game-card]', gamePagesKey(games, favorites, fontSize), 2);
  const pageCount = pages?.length ?? 1;
  const { index } = usePagedRotation(pageCount, rotateIntervalMs);
  const visible = pages ? new Set(pages[index] ?? []) : null;

  return (
    <div className="flex flex-col h-full w-full p-2 gap-1.5">
      <div
        ref={ref}
        data-game-pages={pageCount}
        className="grid grid-cols-2 gap-2 flex-1 min-h-0 overflow-hidden"
        style={{ alignContent: 'safe center' }}
      >
        {games.map((game, i) => (
          <GameCard key={game.id} game={game} kickoff={kickoff} favorites={favorites} hidden={visible !== null && !visible.has(i)} />
        ))}
      </div>
      <GamePagesFooter pages={pages} index={index} />
    </div>
  );
}
