'use client';

import { useState, useEffect, useRef } from 'react';
import Toggle from '@/components/ui/Toggle';
import FullscreenAccentPicker from './FullscreenAccentPicker';
import Button from '@/components/ui/Button';
import LabeledSelect from '@/components/ui/LabeledSelect';
import FullscreenThemeSelect from './FullscreenThemeSelect';
import { useTypographySizeOptions } from './useTypographySizeOptions';
import { useEditorData } from '@/hooks/useEditorData';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import ChoreChartModal from '@/components/editor/ChoreChartModal';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { resolveFullscreenAccent } from '@/lib/fullscreen-themes';
import { useFullscreenThemeTokens } from '@/hooks/useFullscreenThemeTokens';
import { useTranslate } from '@/i18n';
import PhoneSurfaceLinks from '@/components/editor/PhoneSurfaceLinks';
import type {
  ModuleInstance,
  FullscreenChoreChartConfig,
  FullscreenChoreChartView,
  FullscreenChoreChartWeekProgress,
  FullscreenChoreChartLayout,
} from '@/types/config';

type Config = Partial<FullscreenChoreChartConfig>;

export function FullscreenChoreChartConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  // The accent the module paints while accentColor is empty (see the module).
  const themeAccent = resolveFullscreenAccent('', useFullscreenThemeTokens(c.theme, c.darkMode), DEFAULT_ACCENT_COLOR);
  const accentColor = c.accentColor || themeAccent;

  const typographySizeOptions = useTypographySizeOptions();

  const VIEW_OPTIONS: { value: FullscreenChoreChartView; label: string }[] = [
    { value: 'chores', label: t('configSections.fullscreen-chore-chart.viewChoreBoard') },
    { value: 'rewards-store', label: t('configSections.fullscreen-chore-chart.viewRewardsStore') },
  ];

  const DENSITY_OPTIONS = [
    { value: 'cozy', label: t('configSections.fullscreen-chore-chart.densityCozy') },
    { value: 'snug', label: t('configSections.fullscreen-chore-chart.densitySnug') },
  ] as const;

  const WEEK_PROGRESS_OPTIONS: { value: FullscreenChoreChartWeekProgress; label: string }[] = [
    { value: 'chips', label: t('configSections.fullscreen-chore-chart.weekProgressChips') },
    { value: 'strip', label: t('configSections.fullscreen-chore-chart.weekProgressStrip') },
    { value: 'grid', label: t('configSections.fullscreen-chore-chart.weekProgressGrid') },
    { value: 'off', label: t('configSections.fullscreen-chore-chart.weekProgressOff') },
  ];

  const WEEK_START_OPTIONS = [
    { value: 'sunday', label: tCore('days.sunday') },
    { value: 'monday', label: tCore('days.monday') },
  ] as const;

  const LAYOUT_OPTIONS: { value: FullscreenChoreChartLayout; label: string }[] = [
    { value: 'by-time', label: t('configSections.fullscreen-chore-chart.layoutByTime') },
    { value: 'by-person', label: t('configSections.fullscreen-chore-chart.layoutByPerson') },
  ];

  const [showModal, setShowModal] = useState(false);
  const { data: choreData, refetch: refetchCounts } = useEditorData<{ members?: unknown[]; chores?: unknown[] }>('/api/chores/data');
  const counts = { members: choreData?.members?.length ?? 0, chores: choreData?.chores?.length ?? 0 };

  const isChoreBoard = (c.view ?? 'chores') === 'chores';

  // Re-fetch member/chore counts when the modal closes (or opens). The hook
  // already loads on mount, so skip this effect's initial run to keep mount
  // at a single request.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    refetchCounts();
  }, [showModal, refetchCounts]);

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
          <Toggle
            label={t('configSections.fullscreen-chore-chart.tapToComplete')}
            checked={c.allowDisplayComplete ?? true}
            onChange={(v) => set({ allowDisplayComplete: v })}
          />

          {/* Open Modal */}
          <div className="pt-1 border-t border-hs-border-strong space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-hs-text-faint">
              <span>{t('configSections.fullscreen-chore-chart.membersCount', { count: counts.members })}</span>
              <span>&middot;</span>
              <span>{t('configSections.fullscreen-chore-chart.choresCount', { count: counts.chores })}</span>
            </div>
            <Button
              variant="primary"
              className="w-full text-xs"
              onClick={() => setShowModal(true)}
            >
              {t('configSections.fullscreen-chore-chart.editChoreChart')}
            </Button>
          </div>

          {/* Kids check off on /chores; parents add and edit on /remote. */}
          <PhoneSurfaceLinks context="chores" />
        </>
      )}

      {/* Modal */}
      {showModal && (
        <ChoreChartModal
          weekStartDay={c.weekStartDay ?? 'monday'}
          accentColor={accentColor}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
