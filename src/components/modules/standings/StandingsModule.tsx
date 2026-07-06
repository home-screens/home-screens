'use client';

import type { StandingsConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from '../ModuleWrapper';
import { moduleGate } from '../ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { standingsUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useTranslate } from '@/i18n';
import { TableView } from './TableView';
import { CompactView } from './CompactView';
import { ConferenceView } from './ConferenceView';
import type { StandingsGroup } from './types';

interface StandingsModuleProps {
  config: StandingsConfig;
  style: ModuleStyle;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['standings']?.ttlMs ?? 300_000;

export default function StandingsModule({ config, style }: StandingsModuleProps) {
  const t = useTranslate('modules');
  const grouping = config.grouping ?? 'division';
  const view = config.view ?? 'table';

  const [data, error] = useFetchData<{ groups: StandingsGroup[] }>(
    standingsUrl(config),
    config.refreshIntervalMs ?? DEFAULT_REFRESH_MS,
  );

  const groups = data?.groups ?? [];

  const gate = moduleGate({
    style, data, error,
    loadingMessage: t('standings.loading'),
    empty: groups.length === 0 && t('standings.noStandings'),
  });
  if (gate) return gate;

  const teamsToShow = config.teamsToShow ?? 0;
  const showPlayoffLine = config.showPlayoffLine ?? true;
  const rotationIntervalMs = config.rotationIntervalMs ?? 10000;

  return (
    <ModuleWrapper style={style}>
      {view === 'table' && (
        <TableView
          groups={groups}
          teamsToShow={teamsToShow}
          showPlayoffLine={showPlayoffLine}
          rotationIntervalMs={rotationIntervalMs}
          grouping={grouping}
        />
      )}
      {view === 'compact' && (
        <CompactView
          groups={groups}
          teamsToShow={teamsToShow}
          showPlayoffLine={showPlayoffLine}
          rotationIntervalMs={rotationIntervalMs}
          grouping={grouping}
        />
      )}
      {view === 'conference' && (
        <ConferenceView
          groups={groups}
          teamsToShow={teamsToShow}
          showPlayoffLine={showPlayoffLine}
          rotationIntervalMs={rotationIntervalMs}
          grouping={grouping}
        />
      )}
    </ModuleWrapper>
  );
}
