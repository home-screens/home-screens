'use client';

import type { SportsConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from '../ModuleWrapper';
import { moduleGate } from '../ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { sportsUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useTranslate } from '@/i18n';
import { ScoreboardView } from './ScoreboardView';
import { CardsView } from './CardsView';
import { ListView } from './ListView';
import { TickerView } from './TickerView';
import type { Game } from '@/lib/espn';

interface SportsModuleProps {
  config: SportsConfig;
  style: ModuleStyle;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['sports']?.ttlMs ?? 60_000;

export default function SportsModule({ config, style }: SportsModuleProps) {
  const t = useTranslate('modules');
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
      {view === 'scoreboard' && <ScoreboardView games={games} />}
      {view === 'cards' && <CardsView games={games} />}
      {view === 'list' && <ListView games={games} />}
      {view === 'ticker' && <TickerView games={games} speed={config.tickerSpeed ?? 4} />}
    </ModuleWrapper>
  );
}
