'use client';

import type { StandingsConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from '../ModuleWrapper';
import { ModuleLoadingState, ModuleEmptyState } from '../ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { standingsUrl } from '@/lib/fetch-keys';
import { useTranslate } from '@/i18n';
import { TableView } from './TableView';
import { CompactView } from './CompactView';
import { ConferenceView } from './ConferenceView';
import type { StandingsGroup } from './types';

interface StandingsModuleProps {
  config: StandingsConfig;
  style: ModuleStyle;
}

export default function StandingsModule({ config, style }: StandingsModuleProps) {
  const t = useTranslate('modules');
  const grouping = config.grouping ?? 'division';
  const view = config.view ?? 'table';

  const [data, error] = useFetchData<{ groups: StandingsGroup[] }>(
    standingsUrl(config),
    config.refreshIntervalMs ?? 300000,
  );

  const groups = data?.groups ?? [];

  if (data === null) {
    return <ModuleLoadingState style={style} message={t('standings.loading')} error={error} />;
  }

  if (groups.length === 0) {
    return <ModuleEmptyState style={style} message={t('standings.noStandings')} />;
  }

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
