'use client';

import { TEXT_OPACITY } from '@/lib/constants';
import type { MealPlannerConfig, ModuleStyle } from '@/types/config';
import { useTZClock } from '@/hooks/useTZClock';
import ModuleWrapper from '../ModuleWrapper';
import { WeekView } from './WeekView';
import { TodayView } from './TodayView';
import { NextMealView } from './NextMealView';
import { CompactView } from './CompactView';
import { ListView } from './ListView';

interface MealPlannerModuleProps {
  config: MealPlannerConfig;
  style: ModuleStyle;
  timezone?: string;
}

export default function MealPlannerModule({ config, style, timezone }: MealPlannerModuleProps) {
  const now = useTZClock(timezone, 60_000);
  const view = config.view ?? 'week';
  const today = now.getDay();
  const currentHour = now.getHours();

  const hasMeals = (config.plan?.length ?? 0) > 0;

  if (!hasMeals && view !== 'week') {
    return (
      <ModuleWrapper style={style}>
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <span style={{ fontSize: '2em', opacity: TEXT_OPACITY.tertiary }}>&#127869;</span>
          <p style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.dim }}>No meals planned yet</p>
          <p style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.tertiary }}>
            Add meals in the editor
          </p>
        </div>
      </ModuleWrapper>
    );
  }

  return (
    <ModuleWrapper style={style}>
      {view === 'week' && <WeekView config={config} today={today} />}
      {view === 'today' && <TodayView config={config} today={today} currentHour={currentHour} />}
      {view === 'next-meal' && <NextMealView config={config} today={today} currentHour={currentHour} />}
      {view === 'compact' && <CompactView config={config} today={today} />}
      {view === 'list' && <ListView config={config} today={today} />}
    </ModuleWrapper>
  );
}
