'use client';

import type { ChoreChartConfig, ModuleStyle } from '@/types/config';
import { useTranslate } from '@/i18n';
import { useElementWidth } from '@/hooks/useElementWidth';
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
  // The per-member views (board columns, compact checkbox columns, progress
  // rings) lay themselves out from the box width and the module font size:
  // a family of seven in a 500px card needs rows, not seven 70px columns.
  const [frameRef, width] = useElementWidth();

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

  const viewProps = { config, data, width, fontSize: style.fontSize };

  return (
    <ModuleWrapper style={style}>
      <div ref={frameRef} className="w-full h-full min-h-0">
        {view === 'board' && <BoardView {...viewProps} />}
        {view === 'star-chart' && <StarChartView {...viewProps} />}
        {view === 'today' && <TodayView {...viewProps} timezone={timezone} />}
        {view === 'progress' && <ProgressView {...viewProps} />}
        {view === 'compact' && <CompactView {...viewProps} />}
      </div>
    </ModuleWrapper>
  );
}
