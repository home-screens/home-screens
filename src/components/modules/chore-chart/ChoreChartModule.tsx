'use client';

import { TEXT_OPACITY } from '@/lib/constants';
import type { ChoreChartConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from '../ModuleWrapper';
import { useChoreData } from './useChoreData';
import { BoardView } from './views/BoardView';
import { StarChartView } from './views/StarChartView';
import { TodayView } from './views/TodayView';
import { ProgressView } from './views/ProgressView';
import { CompactView } from './views/CompactView';

interface ChoreChartModuleProps {
  config: ChoreChartConfig;
  style: ModuleStyle;
}

export default function ChoreChartModule({ config, style }: ChoreChartModuleProps) {
  const view = config.view ?? 'board';
  const data = useChoreData(config);

  // Empty state — no members
  if (data.members.length === 0) {
    return (
      <ModuleWrapper style={style}>
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <span style={{ fontSize: '2em', opacity: TEXT_OPACITY.tertiary }}>&#128203;</span>
          <p style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.dim }}>Add family members to get started</p>
          <p style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.tertiary }}>
            Open the editor to set up your chore chart
          </p>
        </div>
      </ModuleWrapper>
    );
  }

  // Empty state — no chores
  if (data.chores.length === 0) {
    return (
      <ModuleWrapper style={style}>
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <span style={{ fontSize: '2em', opacity: TEXT_OPACITY.tertiary }}>&#128203;</span>
          <p style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.dim }}>No chores configured</p>
          <p style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.tertiary }}>
            Add some chores in the editor
          </p>
        </div>
      </ModuleWrapper>
    );
  }

  const viewProps = { config, data };

  return (
    <ModuleWrapper style={style}>
      {view === 'board' && <BoardView {...viewProps} />}
      {view === 'star-chart' && <StarChartView {...viewProps} />}
      {view === 'today' && <TodayView {...viewProps} />}
      {view === 'progress' && <ProgressView {...viewProps} />}
      {view === 'compact' && <CompactView {...viewProps} />}
    </ModuleWrapper>
  );
}
