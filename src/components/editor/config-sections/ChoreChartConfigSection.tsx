'use client';

import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { HISTORY_LIMIT, resolveHistoryLimit } from '@/components/modules/chore-chart/layout';
import ViewSelect from '@/components/editor/ViewSelect';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import ChoreChartLauncher from './ChoreChartLauncher';
import type {
  ModuleInstance,
  ChoreChartView,
} from '@/types/config';
import { useWeekStartOptions } from './option-hooks';

type Config = {
  view?: ChoreChartView;
  weekStartDay?: 'sunday' | 'monday';
  showPoints?: boolean;
  showStreaks?: boolean;
  showTimeOfDay?: boolean;
  allowDisplayComplete?: boolean;
  accentColor?: string;
  showTitle?: boolean;
  historyLimit?: number;
  storeLayout?: string;
};

export function ChoreChartConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);

  const VIEWS: { value: ChoreChartView; label: string }[] = [
    { value: 'board', label: t('configSections.chore-chart.viewBoard') },
    { value: 'star-chart', label: t('configSections.chore-chart.viewStarChart') },
    { value: 'today', label: t('configSections.chore-chart.viewToday') },
    { value: 'progress', label: t('configSections.chore-chart.viewProgress') },
    { value: 'compact', label: t('configSections.chore-chart.viewCompact') },
    { value: 'reward-history', label: t('configSections.chore-chart.viewRewardHistory') },
    { value: 'rewards-store', label: t('configSections.chore-chart.viewRewardsStore') },
  ];

  const STORE_LAYOUT_OPTIONS = [
    { value: 'list', label: t('configSections.chore-chart.storeLayoutList') },
    { value: 'tiles', label: t('configSections.chore-chart.storeLayoutTiles') },
    { value: 'price-list', label: t('configSections.chore-chart.storeLayoutPriceList') },
  ];
  // The two reward views have no chores on them, so the chore settings go.
  const isChoreView = c.view !== 'reward-history' && c.view !== 'rewards-store';
  const view = c.view ?? 'board';

  const WEEK_START_OPTIONS = useWeekStartOptions();


  return (
    <>
      {/* View Mode */}
      <ViewSelect
        value={c.view ?? 'board'}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* Week Start */}
      {isChoreView && (
        <LabeledSelect
          label={t('configSections.chore-chart.weekStartsOn')}
          value={c.weekStartDay ?? 'monday'}
          onChange={(v) => set({ weekStartDay: v })}
          options={WEEK_START_OPTIONS}
        />
      )}

      {c.view === 'reward-history' && (
        <Slider
          label={t('configSections.chore-chart.historyLimit')}
          value={resolveHistoryLimit(c.historyLimit)}
          min={HISTORY_LIMIT.min}
          max={HISTORY_LIMIT.max}
          onChange={(v) => set({ historyLimit: v })}
        />
      )}

      {c.view === 'rewards-store' && (
        <LabeledSelect
          label={t('configSections.chore-chart.storeLayout')}
          value={c.storeLayout ?? 'list'}
          onChange={(v) => set({ storeLayout: v })}
          options={STORE_LAYOUT_OPTIONS}
        />
      )}

      {/* Display Toggles */}
      {c.view !== 'rewards-store' && (
        <Toggle
          label={t('configSections.chore-chart.showTickets')}
          checked={c.showPoints ?? true}
          onChange={(v) => set({ showPoints: v })}
        />
      )}
      {/* Each switch is offered only on the views that read it. */}
      {(view === 'progress' || view === 'star-chart') && (
        <Toggle
          label={t('configSections.chore-chart.showStreaks')}
          checked={c.showStreaks ?? true}
          onChange={(v) => set({ showStreaks: v })}
        />
      )}
      {/* Today groups by it; the board only sorts by it. */}
      {(view === 'board' || view === 'today') && (
        <Toggle
          label={t('configSections.chore-chart.showTimeOfDay')}
          checked={c.showTimeOfDay ?? true}
          onChange={(v) => set({ showTimeOfDay: v })}
        />
      )}
      {c.view !== 'reward-history' && (
        <Toggle
          label={t(c.view === 'rewards-store' ? 'configSections.chore-chart.tapToRedeem' : 'configSections.chore-chart.tapToComplete')}
          checked={c.allowDisplayComplete ?? true}
          onChange={(v) => set({ allowDisplayComplete: v })}
        />
      )}

      {/* Accent Color */}
      <ColorPicker
        label={t('configSections.chore-chart.accentColor')}
        value={c.accentColor ?? DEFAULT_ACCENT_COLOR}
        onChange={(v) => set({ accentColor: v })}
      />

      <ChoreChartLauncher weekStartDay={c.weekStartDay ?? 'monday'} accentColor={c.accentColor ?? DEFAULT_ACCENT_COLOR} keyPrefix="chore-chart" />
    </>
  );
}
