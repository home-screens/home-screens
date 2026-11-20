'use client';

import type { Game } from '@/lib/espn';
import { leagueWallCode } from '@/lib/espn';
import { favoriteSide } from '@/lib/sports-order';
import { TeamLogo, isWinner, formatScore, GameStatus, FavoriteBar, RankTag, FAVORITE_GUTTER, GamePagesFooter, gamePagesKey, type KickoffFn } from './shared';
import { usePagedFit } from '../shared/usePagedFit';
import { usePagedRotation } from '@/hooks/usePagedRotation';
import { inkLikeTailwind } from '@/lib/constants';

/**
 * One row per game. Rows that do not fit are not clipped: the list is
 * measured once per game list / box / type size, cut into pages of whole
 * rows, and pages turn on the rotate interval. The favorites sorted first
 * are on page one. Everything fits -> one page, no rotation.
 */
export function ListView({ games, kickoff, favorites = [], rotateIntervalMs, fontSize }: {
  games: Game[]; kickoff: KickoffFn; favorites?: string[]; rotateIntervalMs: number; fontSize: number;
}) {
  const gutter = favorites.length > 0;
  const { ref, pages } = usePagedFit('[data-game-row]', gamePagesKey(games, favorites, fontSize));
  const pageCount = pages?.length ?? 1;
  const { index } = usePagedRotation(pageCount, rotateIntervalMs);
  const visible = pages ? new Set(pages[index] ?? []) : null;

  // `safe center`: centered when the games fit, pinned to the top while the
  // measuring pass has every row rendered.
  return (
    <div className="flex flex-col h-full w-full px-2 gap-1">
      <div
        ref={ref}
        data-game-pages={pageCount}
        className="flex flex-col flex-1 min-h-0 gap-0.5 overflow-hidden"
        style={{ justifyContent: 'safe center' }}
      >
      {games.map((game, i) => {
        const awayWins = isWinner(game, 'away');
        const homeWins = isWinner(game, 'home');
        const side = favoriteSide(game, favorites);
        const barColor = side === 'away' ? game.awayTeamColor : side === 'home' ? game.homeTeamColor : null;
        const hidden = visible !== null && !visible.has(i);

        return (
          <div
            key={game.id}
            data-game-row
            className="relative flex items-center gap-2 py-1 border-b last:border-0"
            style={{ borderColor: inkLikeTailwind(0.05), display: hidden ? 'none' : undefined, paddingLeft: gutter ? FAVORITE_GUTTER : undefined }}
          >
            <FavoriteBar color={barColor} inset="18%" />
            <span
              className="font-bold uppercase tracking-wider text-current/30 shrink-0 whitespace-nowrap"
              style={{ fontSize: '0.55em', minWidth: '2em' }}
            >
              {leagueWallCode(game.league)}
            </span>

            <div className="flex items-center gap-1 min-w-0" style={{ width: '35%' }}>
              <TeamLogo src={game.awayTeamLogo} alt={game.awayTeamAbbr} size={16} />
              <RankTag rank={game.awayRank} />
              <span
                className={`font-semibold truncate ${awayWins ? 'text-current' : 'text-current/70'}`}
                style={{ fontSize: '0.8em' }}
              >
                {game.awayTeamAbbr}
              </span>
              <span
                className={`font-bold tabular-nums shrink-0 ${awayWins ? 'text-current' : 'text-current/60'}`}
                style={{ fontSize: '0.85em' }}
              >
                {formatScore(game, game.awayScore)}
              </span>
            </div>

            <span className="text-current/20 shrink-0" style={{ fontSize: '0.65em' }}>
              @
            </span>

            <div className="flex items-center gap-1 min-w-0" style={{ width: '35%' }}>
              <TeamLogo src={game.homeTeamLogo} alt={game.homeTeamAbbr} size={16} />
              <RankTag rank={game.homeRank} />
              <span
                className={`font-semibold truncate ${homeWins ? 'text-current' : 'text-current/70'}`}
                style={{ fontSize: '0.8em' }}
              >
                {game.homeTeamAbbr}
              </span>
              <span
                className={`font-bold tabular-nums shrink-0 ${homeWins ? 'text-current' : 'text-current/60'}`}
                style={{ fontSize: '0.85em' }}
              >
                {formatScore(game, game.homeScore)}
              </span>
            </div>

            <div className="shrink-0 ml-auto">
              <GameStatus
                game={game}
                kickoff={kickoff(game)}
                dotSize="w-1 h-1"
                fontSize="0.55em"
                postColor="text-current/35"
                preColor="text-current/50"
              />
            </div>
          </div>
        );
      })}
      </div>
      <GamePagesFooter pages={pages} index={index} />
    </div>
  );
}
