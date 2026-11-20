'use client';

import Toggle from '@/components/ui/Toggle';
import FullscreenAccentPicker from './FullscreenAccentPicker';
import LabeledSelect from '@/components/ui/LabeledSelect';
import LabeledField from '@/components/ui/LabeledField';
import SegmentedControl from '@/components/ui/SegmentedControl';
import FullscreenThemeSelect from './FullscreenThemeSelect';
import { useTypographySizeOptions } from './useTypographySizeOptions';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { resolveFullscreenAccent } from '@/lib/fullscreen-themes';
import { useFullscreenThemeTokens } from '@/hooks/useFullscreenThemeTokens';
import { useTranslate } from '@/i18n';
import ChoreChartLauncher from './ChoreChartLauncher';
import type {
  ModuleInstance,
  FullscreenChoreChartConfig,
  FullscreenChoreChartView,
  FullscreenChoreChartWeekProgress,
  FullscreenChoreChartLayout,
  FullscreenChoreCelebration,
} from '@/types/config';
import { useDensityOptions, useWeekStartOptions } from './option-hooks';

type Config = Partial<FullscreenChoreChartConfig>;

export function FullscreenChoreChartConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  // The accent the module paints while accentColor is empty (see the module).
  const themeAccent = resolveFullscreenAccent('', useFullscreenThemeTokens('fullscreen-chore-chart', c.theme), DEFAULT_ACCENT_COLOR);
  const accentColor = c.accentColor || themeAccent;

  const typographySizeOptions = useTypographySizeOptions();

  const VIEW_OPTIONS: { value: FullscreenChoreChartView; label: string }[] = [
    { value: 'chores', label: t('configSections.fullscreen-chore-chart.viewChoreBoard') },
    { value: 'rewards-store', label: t('configSections.fullscreen-chore-chart.viewRewardsStore') },
    { value: 'reward-history', label: t('configSections.fullscreen-chore-chart.viewRewardHistory') },
    { value: 'reward-totals', label: t('configSections.fullscreen-chore-chart.viewRewardTotals') },
    { value: 'reward-spotlight', label: t('configSections.fullscreen-chore-chart.viewRewardSpotlight') },
  ];

  const DENSITY_OPTIONS = useDensityOptions();

  const WEEK_PROGRESS_OPTIONS: { value: FullscreenChoreChartWeekProgress; label: string }[] = [
    { value: 'chips', label: t('configSections.fullscreen-chore-chart.weekProgressChips') },
    { value: 'strip', label: t('configSections.fullscreen-chore-chart.weekProgressStrip') },
    { value: 'grid', label: t('configSections.fullscreen-chore-chart.weekProgressGrid') },
    { value: 'off', label: t('configSections.fullscreen-chore-chart.weekProgressOff') },
  ];

  const WEEK_START_OPTIONS = useWeekStartOptions();

  const LAYOUT_OPTIONS: { value: FullscreenChoreChartLayout; label: string }[] = [
    { value: 'by-time', label: t('configSections.fullscreen-chore-chart.layoutByTime') },
    { value: 'by-person', label: t('configSections.fullscreen-chore-chart.layoutByPerson') },
  ];

  const CELEBRATION_OPTIONS: { value: FullscreenChoreCelebration; label: string }[] = [
    { value: 'off', label: t('configSections.fullscreen-chore-chart.celebrationOff') },
    { value: 'simple', label: t('configSections.fullscreen-chore-chart.celebrationSimple') },
    { value: 'big', label: t('configSections.fullscreen-chore-chart.celebrationBig') },
  ];
  const celebration = c.celebration ?? 'simple';


  const view = c.view ?? 'chores';
  const isChoreBoard = view === 'chores';


  return (
    <>
      {/* View */}
      <LabeledSelect
        label={t('configSections.fullscreen-chore-chart.view')}
        value={c.view ?? 'chores'}
        onChange={(v) => set({ view: v })}
        options={VIEW_OPTIONS}
      />

      {/* Show Rewards Button — only relevant on chore board */}
      {isChoreBoard && (
        <>
          <Toggle
            label={t('configSections.fullscreen-chore-chart.showRewardsButton')}
            checked={c.showRewardsButton ?? false}
            onChange={(v) => set({ showRewardsButton: v })}
          />
          <p className="text-[11px] text-hs-text-faint leading-relaxed -mt-1">
            {t('configSections.fullscreen-chore-chart.showRewardsButtonHelp')}
          </p>
        </>
      )}

      {/* Theme Override */}
      <FullscreenThemeSelect
        value={c.theme}
        onChange={(theme) => set({ theme })}
        defaultOptionKey="configSections.fullscreen-chore-chart.themeDefault"
      />

      {/* Density */}
      <LabeledSelect
        label={t('common.density')}
        value={c.density ?? 'cozy'}
        onChange={(v) => set({ density: v })}
        options={DENSITY_OPTIONS}
      />

      {/* Typography Size */}
      <LabeledSelect
        label={t('configSections.fullscreen-chore-chart.typographySize')}
        value={c.typographySize ?? 'medium'}
        onChange={(v) => set({ typographySize: v })}
        options={typographySizeOptions}
      />

      {/* Accent Color */}
      <FullscreenAccentPicker
        label={t('configSections.fullscreen-chore-chart.accentColor')}
        value={c.accentColor}
        themeAccent={themeAccent}
        onChange={(v) => set({ accentColor: v })}
      />

      {/* ── Chore Board-only settings ── */}
      {isChoreBoard && (
        <>
          {/* Row grouping */}
          <LabeledSelect
            label={t('configSections.fullscreen-chore-chart.layout')}
            value={c.layout ?? 'by-time'}
            onChange={(v) => set({ layout: v })}
            options={LAYOUT_OPTIONS}
          />
          <p className="text-[11px] text-hs-text-faint leading-relaxed -mt-1">
            {t('configSections.fullscreen-chore-chart.layoutHelp')}
          </p>

          {/* Week Start */}
          <LabeledSelect
            label={t('configSections.fullscreen-chore-chart.weekStartsOn')}
            value={c.weekStartDay ?? 'monday'}
            onChange={(v) => set({ weekStartDay: v })}
            options={WEEK_START_OPTIONS}
          />

          {/* Week stars */}
          <LabeledSelect
            label={t('configSections.fullscreen-chore-chart.weekProgress')}
            value={c.weekProgress ?? 'chips'}
            onChange={(v) => set({ weekProgress: v })}
            options={WEEK_PROGRESS_OPTIONS}
          />

          {/* Display Toggles */}
          <Toggle
            label={t('configSections.fullscreen-chore-chart.showTickets')}
            checked={c.showPoints ?? true}
            onChange={(v) => set({ showPoints: v })}
          />
          <Toggle
            label={t('configSections.fullscreen-chore-chart.showStreaks')}
            checked={c.showStreaks ?? true}
            onChange={(v) => set({ showStreaks: v })}
          />
          <Toggle
            label={t('configSections.fullscreen-chore-chart.showTimeOfDay')}
            checked={c.showTimeOfDay ?? true}
            onChange={(v) => set({ showTimeOfDay: v })}
          />
        </>
      )}

      {/* The store's Redeem follows the same switch as the chart's ticks. The
          history views have nothing to tap. */}
      {(isChoreBoard || view === 'rewards-store') && (
        <Toggle
          label={t(isChoreBoard ? 'configSections.fullscreen-chore-chart.tapToComplete' : 'configSections.chore-chart.tapToRedeem')}
          checked={c.allowDisplayComplete ?? true}
          onChange={(v) => set({ allowDisplayComplete: v })}
        />
      )}

      {/* Celebration: what the chart does when someone finishes their day. It
          is drawn over every view, and the phone follows it too. */}
      <div className="pt-1 border-t border-hs-border-strong space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-hs-text-faint">
          {t('configSections.fullscreen-chore-chart.celebration')}
        </div>
        <div className="space-y-1">
          <LabeledField label={t('configSections.fullscreen-chore-chart.celebrationLabel')} as="div">
            <SegmentedControl
              label={t('configSections.fullscreen-chore-chart.celebrationLabel')}
              value={celebration}
              onChange={(v) => set({ celebration: v })}
              options={CELEBRATION_OPTIONS}
            />
          </LabeledField>
          <p className="text-[11px] leading-relaxed text-hs-text-faint">
            {t('configSections.fullscreen-chore-chart.celebrationHelp')}
          </p>
        </div>
        {celebration !== 'off' && (
          <>
            <Toggle
              label={t('configSections.fullscreen-chore-chart.celebrationSound')}
              checked={c.celebrationSound ?? false}
              onChange={(v) => set({ celebrationSound: v })}
            />
            <p className="text-[11px] text-hs-text-faint leading-relaxed -mt-1">
              {t('configSections.fullscreen-chore-chart.celebrationSoundHelp')}
            </p>
          </>
        )}
      </div>

      <ChoreChartLauncher weekStartDay={c.weekStartDay ?? 'monday'} accentColor={accentColor} keyPrefix="fullscreen-chore-chart" />
    </>
  );
}
