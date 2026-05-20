'use client';

import { useState, useEffect, useMemo } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import LabeledField from '@/components/ui/LabeledField';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { editorFetch } from '@/lib/editor-fetch';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import ChoreChartModal from '@/components/editor/ChoreChartModal';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { DEFAULT_ACCENT_COLOR, TYPOGRAPHY_SIZES } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import type {
  ModuleInstance,
  FullscreenChoreChartConfig,
  FullscreenChoreChartView,
} from '@/types/config';

type Config = Partial<FullscreenChoreChartConfig>;

export function FullscreenChoreChartConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);

  // Translate the shared TYPOGRAPHY_SIZES table at render time. Falls back
  // to the English `label` if the key is missing — `t()` returns the raw
  // dotted path on miss (not undefined), so `result === key` is the only
  // reliable miss check. Mirrors the TRANSITION_OPTIONS pattern in
  // DefaultDisplaySection.
  const typographySizeOptions = useMemo(
    () =>
      TYPOGRAPHY_SIZES.map((opt) => {
        const translated = t(opt.i18nKey);
        return {
          value: opt.value,
          label: translated === opt.i18nKey ? opt.label : translated,
        };
      }),
    [t],
  );

  const VIEW_OPTIONS: { value: FullscreenChoreChartView; label: string }[] = [
    { value: 'chores', label: t('configSections.fullscreen-chore-chart.viewChoreBoard') },
    { value: 'rewards-store', label: t('configSections.fullscreen-chore-chart.viewRewardsStore') },
  ];

  const DENSITY_OPTIONS = [
    { value: 'cozy', label: t('configSections.fullscreen-chore-chart.densityCozy') },
    { value: 'snug', label: t('configSections.fullscreen-chore-chart.densitySnug') },
  ] as const;

  const WEEK_START_OPTIONS = [
    { value: 'sunday', label: tCore('days.sunday') },
    { value: 'monday', label: tCore('days.monday') },
  ] as const;

  const [showModal, setShowModal] = useState(false);
  const [counts, setCounts] = useState({ members: 0, chores: 0 });

  const isChoreBoard = (c.view ?? 'chores') === 'chores';

  useEffect(() => {
    editorFetch('/api/chores/data')
      .then((r) => r.json())
      .then((d) => setCounts({ members: d.members?.length ?? 0, chores: d.chores?.length ?? 0 }))
      .catch(() => {});
  }, [showModal]);

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
      <LabeledField label={t('common.theme')}>
        <select
          value={c.theme ?? ''}
          onChange={(e) => set({ theme: e.target.value || undefined })}
          className={INPUT_CLASS}
        >
          <option value="">{t('configSections.fullscreen-chore-chart.themeDefault')}</option>
          {FULLSCREEN_THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>{theme.name} ({theme.group})</option>
          ))}
        </select>
      </LabeledField>

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
      <ColorPicker
        label={t('configSections.fullscreen-chore-chart.accentColor')}
        value={c.accentColor ?? DEFAULT_ACCENT_COLOR}
        onChange={(v) => set({ accentColor: v })}
      />

      {/* ── Chore Board-only settings ── */}
      {isChoreBoard && (
        <>
          {/* Week Start */}
          <LabeledSelect
            label={t('configSections.fullscreen-chore-chart.weekStartsOn')}
            value={c.weekStartDay ?? 'monday'}
            onChange={(v) => set({ weekStartDay: v })}
            options={WEEK_START_OPTIONS}
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

          {/* Mobile hint */}
          <p className="text-[11px] text-hs-text-faint leading-relaxed">
            {t('configSections.fullscreen-chore-chart.mobileHintPrefix')}{' '}
            <span className="text-hs-text-muted">{typeof window !== 'undefined' ? `${window.location.origin}/remote` : '/remote'}</span>
          </p>
        </>
      )}

      {/* Modal */}
      {showModal && (
        <ChoreChartModal
          weekStartDay={c.weekStartDay ?? 'monday'}
          accentColor={c.accentColor ?? DEFAULT_ACCENT_COLOR}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
