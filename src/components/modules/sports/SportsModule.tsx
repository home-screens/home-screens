'use client';

import { useCallback, useMemo } from 'react';
import type { SportsConfig, ModuleStyle, TimeFormat } from '@/types/config';
import ModuleWrapper from '../ModuleWrapper';
import { moduleGate, ModuleEmptyState } from '../ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { useTZClock } from '@/hooks/useTZClock';
import { sportsUrl, sportsTeamUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { formatKickoff } from './kickoff';
import type { KickoffFn } from './shared';
import { ScoreboardView } from './ScoreboardView';
import { CardsView } from './CardsView';
import { ListView } from './ListView';
import { TickerView } from './TickerView';
import { TeamView } from './TeamView';
import type { Game, TeamCard } from '@/lib/espn';
import { DEFAULT_SPORTS_LEAGUES, enabledFavorites, orderGames } from '@/lib/sports-order';
import { householdTimeFormat } from '@/lib/clock-time';

interface SportsModuleProps {
  config: SportsConfig;
  style: ModuleStyle;
  /** Ambient display settings (see buildModuleProps): kickoff times are shown in this zone and clock style. */
  timezone?: string;
  timeFormat?: TimeFormat;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['sports']?.ttlMs ?? 60_000;
/** Seconds a game, team or page stays up (see SportsConfig.rotateIntervalMs). */
const DEFAULT_ROTATE_MS = 10_000;
const NO_GAMES: Game[] = [];

export default function SportsModule({ config, style, timezone, timeFormat }: SportsModuleProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  // Wall clock in the display timezone, so "Today" flips at the room's
  // midnight, not the Pi's.
  const now = useTZClock(timezone);
  const today = t('sports.today');
  const tomorrow = t('sports.tomorrow');
  const resolvedTimeFormat = householdTimeFormat(timeFormat, locale);
  const kickoff = useCallback<KickoffFn>(
    (game) => formatKickoff(game.startTime, { now, timezone, locale, timeFormat: resolvedTimeFormat, today, tomorrow }),
    [now, timezone, locale, resolvedTimeFormat, today, tomorrow],
  );
  const view = config.view ?? 'scoreboard';
  const favorites = useMemo(() => config.favoriteTeams ?? [], [config.favoriteTeams]);
  const refreshMs = config.refreshIntervalMs ?? DEFAULT_REFRESH_MS;
  const rotateMs = config.rotateIntervalMs ?? DEFAULT_ROTATE_MS;

  // The team view reads its own route; the other views read the scoreboard.
  // An empty URL means "do not fetch", so only the active source is polled.
  const [data, error] = useFetchData<{ games: Game[] }>(view === 'team' ? '' : sportsUrl(config), refreshMs);
  const [teamData, teamError] = useFetchData<{ cards: TeamCard[] }>(
    view === 'team' ? (sportsTeamUrl(config) ?? '') : '',
    refreshMs,
  );

  const games = useMemo(
    () => orderGames(data?.games ?? NO_GAMES, favorites, config.favoritesOnly ?? false),
    [data, favorites, config.favoritesOnly],
  );

  if (view === 'team') {
    if (favorites.length === 0) {
      return <ModuleEmptyState style={style} message={t('sports.pickTeam')} />;
    }
    // Teams whose league is switched off are not fetched (sportsTeamUrl), so
    // with none left there is nothing to wait for.
    if (enabledFavorites(favorites, config.leagues ?? DEFAULT_SPORTS_LEAGUES).length === 0) {
      return <ModuleEmptyState style={style} message={t('sports.teamLeagueOff')} />;
    }
    const cards = teamData?.cards ?? [];
    const gate = moduleGate({
      style, data: teamData, error: teamError,
      loadingMessage: t('sports.loading'),
      empty: cards.length === 0 && t('sports.noGames'),
    });
    if (gate) return gate;
    return (
      <ModuleWrapper style={style}>
        <TeamView cards={cards} kickoff={kickoff} rotateIntervalMs={rotateMs} />
      </ModuleWrapper>
    );
  }

  const gate = moduleGate({
    style, data, error,
    loadingMessage: t('sports.loading'),
    empty: games.length === 0 && t('sports.noGames'),
  });
  if (gate) return gate;

  return (
    <ModuleWrapper style={style}>
      {view === 'scoreboard' && <ScoreboardView games={games} kickoff={kickoff} favorites={favorites} rotateIntervalMs={rotateMs} />}
      {view === 'cards' && <CardsView games={games} kickoff={kickoff} favorites={favorites} rotateIntervalMs={rotateMs} fontSize={style.fontSize} />}
      {view === 'list' && <ListView games={games} kickoff={kickoff} favorites={favorites} rotateIntervalMs={rotateMs} fontSize={style.fontSize} />}
      {view === 'ticker' && <TickerView games={games} speed={config.tickerSpeed ?? 4} kickoff={kickoff} favorites={favorites} />}
    </ModuleWrapper>
  );
}
