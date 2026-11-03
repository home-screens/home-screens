'use client';

import { useRotatingIndex } from '@/hooks/useRotatingIndex';
import { useTranslate } from '@/i18n';
import type { Game, TeamCard } from '@/lib/espn';
import { leagueWallCode } from '@/lib/espn';
import { TeamLogo, GameStatus, RankTag, type KickoffFn } from './shared';
import { PaginationDots } from '../shared/PaginationDots';
import { withAlpha } from '@/lib/hex-color';

/** Which side of a game the card's team is on; away when the abbreviations do not settle it. */
function ourSide(game: Game, abbr: string): 'home' | 'away' {
  return game.homeTeamAbbr.toUpperCase() === abbr.toUpperCase() ? 'home' : 'away';
}

function TeamRow({ logo, abbr, record, score, bright, rank }: {
  logo: string; abbr: string; record: string; score: number | null; bright: boolean; rank?: number;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <TeamLogo src={logo} alt={abbr} size={30} />
      <span className={`font-bold flex items-baseline gap-1 ${bright ? 'text-current' : 'text-current/55'}`} style={{ fontSize: '1em', width: '4.2em' }}>
        <RankTag rank={rank} />
        {abbr}
      </span>
      <span className="text-current/35 flex-1 truncate" style={{ fontSize: '0.65em' }}>{record}</span>
      {score !== null && (
        <span className={`font-bold tabular-nums leading-none ${bright ? 'text-current' : 'text-current/45'}`} style={{ fontSize: '1.5em' }}>
          {score}
        </span>
      )}
    </div>
  );
}

export function TeamView({ cards, kickoff, rotateIntervalMs }: { cards: TeamCard[]; kickoff: KickoffFn; rotateIntervalMs: number }) {
  const t = useTranslate('modules');
  const index = useRotatingIndex(cards.length, rotateIntervalMs);
  const card = cards[index];
  if (!card) return null;

  const game = card.featured;
  const us = game ? ourSide(game, card.abbr) : null;
  const meta = [card.rank ? `#${card.rank}` : '', card.record, card.standing].filter(Boolean).join(' · ');
  const showScores = !!game && game.state !== 'pre';

  const last = card.last;
  let lastLine: string | null = null;
  if (last) {
    const side = ourSide(last, card.abbr);
    const ours = side === 'home' ? last.homeScore : last.awayScore;
    const theirs = side === 'home' ? last.awayScore : last.homeScore;
    // Without both scores there is no result to call, so the line is left out.
    if (ours !== null && theirs !== null) {
      const result = ours > theirs ? t('sports.win') : ours < theirs ? t('sports.loss') : t('sports.tie');
      const opponent = side === 'home' ? last.awayTeamAbbr : last.homeTeamAbbr;
      const where = side === 'home' ? t('sports.vs') : t('sports.at');
      lastLine = `${result} ${ours}-${theirs} ${where} ${opponent}`;
    }
  }

  return (
    <div className="flex flex-col justify-center h-full gap-3 px-5" data-team-key={card.key}>
      <div className="flex items-center gap-3.5">
        <div className="rounded-xl p-2 shrink-0" style={{ backgroundColor: `#${withAlpha(card.color, 0.145)}` }}>
          <TeamLogo src={card.logo} alt={card.abbr} size={46} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold leading-tight truncate" style={{ fontSize: '1.15em' }}>{card.name}</div>
          {meta && <div className="text-current/45 truncate" style={{ fontSize: '0.7em' }}>{meta}</div>}
        </div>
        <span className="self-start font-semibold tracking-widest uppercase text-current/35" style={{ fontSize: '0.6em' }}>
          {leagueWallCode(card.league)}
        </span>
      </div>

      <div className="bg-white/5 rounded-lg px-3.5 py-2.5 flex items-stretch gap-3.5">
        {game ? (
          <>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
              <TeamRow
                logo={game.awayTeamLogo} abbr={game.awayTeamAbbr} record={game.awayRecord}
                score={showScores ? game.awayScore : null} bright={us === 'away'} rank={game.awayRank}
              />
              <TeamRow
                logo={game.homeTeamLogo} abbr={game.homeTeamAbbr} record={game.homeRecord}
                score={showScores ? game.homeScore : null} bright={us === 'home'} rank={game.homeRank}
              />
            </div>
            <div className="border-l border-white/10 pl-3.5 flex flex-col justify-center gap-1 shrink-0" style={{ minWidth: '7em' }}>
              <GameStatus
                state={game.state}
                kickoff={kickoff(game)}
                status={game.status}
                fontSize={game.state === 'pre' ? '0.8em' : '0.75em'}
                gap="gap-1.5"
                preColor="text-current font-semibold"
                postColor="text-current/50"
              />
              {(game.broadcast || game.venue) && (
                <div className="text-current/40 leading-snug" style={{ fontSize: '0.62em' }}>
                  {game.broadcast && <div className="truncate">{game.broadcast}</div>}
                  {game.venue && <div className="truncate">{game.venue}</div>}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 text-center text-current/45 py-2" style={{ fontSize: '0.8em' }}>
            {card.error ? t('sports.unavailable') : t('sports.noGames')}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1" style={{ fontSize: '0.65em' }}>
        <span className="text-current/40 truncate">
          {lastLine && (
            <>
              {t('sports.last')}{' '}
              <span className="text-current/70 font-semibold">{lastLine}</span>
            </>
          )}
        </span>
        <PaginationDots total={cards.length} current={index} threshold={12} />
      </div>
    </div>
  );
}
