'use client';

import type { ChoreChartConfig, ModuleStyle } from '@/types/config';
import { useTranslate } from '@/i18n';
import ModuleWrapper from '../ModuleWrapper';
import FamilyEmptyState from '../FamilyEmptyState';
import { useChoreData } from './useChoreData';
import { BoardView } from './views/BoardView';
import { StarChartView } from './views/StarChartView';
import { TodayView } from './views/TodayView';
import { ProgressView } from './views/ProgressView';
import { CompactView } from './views/CompactView';

interface ChoreChartModuleProps {
  config: ChoreChartConfig;
  style: ModuleStyle;
  timezone?: string;
}

export default function ChoreChartModule({ config, style, timezone }: ChoreChartModuleProps) {
  const view = config.view ?? 'board';
  const data = useChoreData(config);
  const t = useTranslate('modules');

  // Family data lives on the phone, not in the editor: the empty state sends
  // people to /remote and says which tab.
  if (data.members.length === 0 || data.chores.length === 0) {
    return (
      <ModuleWrapper style={style}>
        <FamilyEmptyState
          icon={<>&#128203;</>}
          title={t(data.members.length === 0 ? 'chore-chart.noMembersYet' : 'chore-chart.noChoresYet')}
          hint={t('chore-chart.setUpFromPhoneHint')}
        />
      </ModuleWrapper>
    );
  }

  const viewProps = { config, data };

  return (
    <ModuleWrapper style={style}>
      {view === 'board' && <BoardView {...viewProps} />}
      {view === 'star-chart' && <StarChartView {...viewProps} />}
      {view === 'today' && <TodayView {...viewProps} timezone={timezone} />}
      {view === 'progress' && <ProgressView {...viewProps} />}
      {view === 'compact' && <CompactView {...viewProps} />}
    </ModuleWrapper>
  );
}
