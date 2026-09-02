'use client';

import { useCallback } from 'react';
import { DEFAULT_TIME_FORMAT, type SportsConfig, type ModuleStyle, type TimeFormat } from '@/types/config';
import ModuleWrapper from '../ModuleWrapper';
import { moduleGate } from '../ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { useTZClock } from '@/hooks/useTZClock';
import { sportsUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { formatKickoff } from './kickoff';
import type { KickoffFn } from './shared';
import { ScoreboardView } from './ScoreboardView';
import { CardsView } from './CardsView';
import { ListView } from './ListView';
import { TickerView } from './TickerView';
import type { Game } from '@/lib/espn';

interface SportsModuleProps {
  config: SportsConfig;
  style: ModuleStyle;
  /** Ambient display settings (see buildModuleProps): kickoff times are shown in this zone and clock style. */
  timezone?: string;
  timeFormat?: TimeFormat;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['sports']?.ttlMs ?? 60_000;

export default function SportsModule({ config, style, timezone, timeFormat }: SportsModuleProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  // Wall clock in the display timezone, so "Today" flips at the room's
  // midnight, not the Pi's.
  const now = useTZClock(timezone);
  const today = t('sports.today');
  const tomorrow = t('sports.tomorrow');
  const resolvedTimeFormat = timeFormat ?? DEFAULT_TIME_FORMAT;
  const kickoff = useCallback<KickoffFn>(
    (game) => formatKickoff(game.startTime, { now, timezone, locale, timeFormat: resolvedTimeFormat, today, tomorrow }),
    [now, timezone, locale, resolvedTimeFormat, today, tomorrow],
  );
  const [data, error] = useFetchData<{ games: Game[] }>(
    sportsUrl(config),
    config.refreshIntervalMs ?? DEFAULT_REFRESH_MS,
  );
  const games = data?.games ?? [];
  const view = config.view ?? 'scoreboard';

  const gate = moduleGate({
    style, data, error,
    loadingMessage: t('sports.loading'),
    empty: games.length === 0 && t('sports.noGames'),
  });
  if (gate) return gate;

  return (
    <ModuleWrapper style={style}>
      {view === 'scoreboard' && <ScoreboardView games={games} kickoff={kickoff} />}
      {view === 'cards' && <CardsView games={games} kickoff={kickoff} />}
      {view === 'list' && <ListView games={games} kickoff={kickoff} />}
      {view === 'ticker' && <TickerView games={games} speed={config.tickerSpeed ?? 4} />}
    </ModuleWrapper>
  );
}
