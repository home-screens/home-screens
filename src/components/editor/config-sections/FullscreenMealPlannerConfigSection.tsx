'use client';

import { useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import LabeledSelect from '@/components/ui/LabeledSelect';
import FullscreenThemeSelect from './FullscreenThemeSelect';
import { useTypographySizeOptions } from './useTypographySizeOptions';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useMealPlannerData } from '@/hooks/useMealPlannerData';
import MealPlannerModal from '@/components/editor/meal-planner-modal';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import type {
  ModuleInstance,
  FullscreenMealPlannerConfig,
} from '@/types/config';

type Config = Partial<FullscreenMealPlannerConfig>;

export function FullscreenMealPlannerConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);

  const VIEWS = [
    { value: 'week', label: t('configSections.fullscreen-meal-planner.viewWeek') },
    { value: 'today', label: t('configSections.fullscreen-meal-planner.viewToday') },
    { value: 'menu-board', label: t('configSections.fullscreen-meal-planner.viewMenuBoard') },
    { value: 'next-meal', label: t('configSections.fullscreen-meal-planner.viewNextMeal') },
  ] as const;

  const DENSITY_OPTIONS = [
    { value: 'cozy', label: t('configSections.fullscreen-meal-planner.densityCozy') },
    { value: 'snug', label: t('configSections.fullscreen-meal-planner.densitySnug') },
  ] as const;

  const typographySizeOptions = useTypographySizeOptions();

  const [showModal, setShowModal] = useState(false);
  const { mealData, handleModalUpdate, saveError } = useMealPlannerData<Config>({
    mod,
    set,
    showModal,
  });

  return (
    <>
      {/* Theme Override */}
      <FullscreenThemeSelect
        value={c.theme}
        onChange={(theme) => set({ theme })}
        defaultOptionKey="configSections.fullscreen-meal-planner.themeDefault"
      />

      {/* View */}
      <LabeledSelect
        label={t('configSections.fullscreen-meal-planner.view')}
        value={c.view ?? 'week'}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
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
        label={t('configSections.fullscreen-meal-planner.typographySize')}
        value={c.typographySize ?? 'medium'}
        onChange={(v) => set({ typographySize: v })}
        options={typographySizeOptions}
      />

      {/* Display Toggles */}
      <Toggle label={t('configSections.fullscreen-meal-planner.showEmoji')} checked={c.showEmoji !== false} onChange={(v) => set({ showEmoji: v })} />
      <Toggle label={t('configSections.fullscreen-meal-planner.showPrepTime')} checked={c.showPrepTime !== false} onChange={(v) => set({ showPrepTime: v })} />
      <Toggle label={t('configSections.fullscreen-meal-planner.showTags')} checked={c.showTags !== false} onChange={(v) => set({ showTags: v })} />
      <Toggle label={t('configSections.fullscreen-meal-planner.showDifficulty')} checked={!!c.showDifficulty} onChange={(v) => set({ showDifficulty: v })} />

      {/* Tap-to-open recipe */}
      <LabeledSelect
        label={t('configSections.fullscreen-meal-planner.tapRecipeAction')}
        value={c.tapRecipeAction ?? 'off'}
        onChange={(v) => set({ tapRecipeAction: v })}
        options={[
          { value: 'off', label: t('configSections.fullscreen-meal-planner.tapRecipeActionOff') },
          { value: 'qr', label: t('configSections.fullscreen-meal-planner.tapRecipeActionQr') },
          { value: 'iframe', label: t('configSections.fullscreen-meal-planner.tapRecipeActionIframe') },
        ]}
      />
      {c.tapRecipeAction === 'iframe' && (
        <p className="text-[11px] text-hs-text-faint leading-relaxed">
          {t('configSections.fullscreen-meal-planner.tapRecipeActionIframeHint')}
        </p>
      )}

      {/* Accent Color */}
      <ColorPicker
        label={t('configSections.fullscreen-meal-planner.accentColor')}
        value={c.accentColor ?? DEFAULT_ACCENT_COLOR}
        onChange={(v) => set({ accentColor: v })}
      />

      {/* Open Modal */}
      <div className="pt-1 border-t border-hs-border-strong space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-hs-text-faint">
          <span>{t('configSections.fullscreen-meal-planner.savedMealsCount', { count: mealData.savedMeals.length })}</span>
          <span>&middot;</span>
          <span>{t('configSections.fullscreen-meal-planner.plannedCount', { count: mealData.plan.length })}</span>
        </div>
        <Button
          variant="primary"
          className="w-full text-xs"
          onClick={() => setShowModal(true)}
        >
          {t('configSections.fullscreen-meal-planner.editMealPlanner')}
        </Button>
        {saveError && (
          <p role="alert" className="text-xs text-hs-danger">{t('common.saveError')}</p>
        )}
      </div>

      {/* Mobile hint */}
      <p className="text-[11px] text-hs-text-faint leading-relaxed">
        {t('configSections.fullscreen-meal-planner.mobileHintPrefix')}{' '}
        <a href="/editor/settings?tab=meals" className="text-hs-accent hover:text-hs-accent-hover underline">{t('configSections.fullscreen-meal-planner.mobileHintSettingsLink')}</a>{' '}
        {t('configSections.fullscreen-meal-planner.mobileHintSuffix')} <span className="text-hs-text-muted">/remote</span> {t('configSections.fullscreen-meal-planner.mobileHintEnd')}
      </p>

      {/* Modal */}
      {showModal && (
        <MealPlannerModal
          savedMeals={mealData.savedMeals}
          plan={mealData.plan}
          settings={mealData.settings}
          accentColor={c.accentColor ?? DEFAULT_ACCENT_COLOR}
          onUpdate={handleModalUpdate}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
