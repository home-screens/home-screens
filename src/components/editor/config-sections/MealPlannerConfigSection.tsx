'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import LabeledSelect from '@/components/ui/LabeledSelect';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useMealPlannerData } from '@/hooks/useMealPlannerData';
import MealPlannerModal from '@/components/editor/meal-planner-modal';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { settingsPath } from '@/lib/settings-route';
import type {
  ModuleInstance,
  MealPlannerView,
  RecipeTapAction,
} from '@/types/config';

type Config = {
  view?: MealPlannerView;
  showEmoji?: boolean;
  showPrepTime?: boolean;
  showTags?: boolean;
  accentColor?: string;
  tapRecipeAction?: RecipeTapAction;
};

export function MealPlannerConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const VIEWS: { value: MealPlannerView; label: string }[] = [
    { value: 'week', label: t('configSections.meal-planner.viewWeek') },
    { value: 'today', label: t('configSections.meal-planner.viewToday') },
    { value: 'next-meal', label: t('configSections.meal-planner.viewNextMeal') },
    { value: 'compact', label: t('configSections.meal-planner.viewCompact') },
    { value: 'list', label: t('configSections.meal-planner.viewList') },
  ];
  const [showModal, setShowModal] = useState(false);
  const { mealData, handleModalUpdate, saveError } = useMealPlannerData<Config>({
    mod,
    set,
    showModal,
  });

  return (
    <>
      {/* View Mode */}
      <ViewSelect
        value={c.view ?? 'week'}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* Display Toggles */}
      <Toggle
        label={t('configSections.meal-planner.showEmoji')}
        checked={c.showEmoji ?? true}
        onChange={(v) => set({ showEmoji: v })}
      />
      <Toggle
        label={t('configSections.meal-planner.showPrepTime')}
        checked={c.showPrepTime ?? true}
        onChange={(v) => set({ showPrepTime: v })}
      />
      <Toggle
        label={t('configSections.meal-planner.showTags')}
        checked={c.showTags ?? true}
        onChange={(v) => set({ showTags: v })}
      />

      {/* Tap-to-open recipe */}
      <LabeledSelect
        label={t('configSections.meal-planner.tapRecipeAction')}
        value={c.tapRecipeAction ?? 'off'}
        onChange={(v) => set({ tapRecipeAction: v })}
        options={[
          { value: 'off', label: t('configSections.meal-planner.tapRecipeActionOff') },
          { value: 'qr', label: t('configSections.meal-planner.tapRecipeActionQr') },
          { value: 'iframe', label: t('configSections.meal-planner.tapRecipeActionIframe') },
        ]}
      />
      {c.tapRecipeAction === 'iframe' && (
        <p className="text-[11px] text-hs-text-faint leading-relaxed">
          {t('configSections.meal-planner.tapRecipeActionIframeHint')}
        </p>
      )}

      {/* Accent Color */}
      <ColorPicker
        label={t('configSections.meal-planner.accentColor')}
        value={c.accentColor ?? DEFAULT_ACCENT_COLOR}
        onChange={(v) => set({ accentColor: v })}
      />

      {/* Note: planning settings (which slots, week start, default times, time format)
          are shared across all meal modules. Edit them from either Settings → Meals
          (in the editor) or the /remote settings drawer. */}
      <p className="text-[11px] text-hs-text-faint leading-relaxed">
        {t('configSections.meal-planner.sharedSettingsPrefix')}{' '}
        <a href={settingsPath({ kind: 'defaults', page: 'meals' })} className="text-hs-accent hover:text-hs-accent-hover underline">{t('configSections.meal-planner.sharedSettingsLink')}</a>{' '}
        {t('configSections.meal-planner.sharedSettingsOr')} <span className="text-hs-text-muted">/remote</span> {t('configSections.meal-planner.sharedSettingsSuffix')}
      </p>

      {/* Open Modal */}
      <div className="pt-1 border-t border-hs-border-strong space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-hs-text-faint">
          <span>{t('configSections.meal-planner.savedMealsCount', { count: mealData.savedMeals.length })}</span>
          <span>&middot;</span>
          <span>{t('configSections.meal-planner.plannedCount', { count: mealData.plan.length })}</span>
        </div>
        <Button
          variant="primary"
          className="w-full text-xs"
          onClick={() => setShowModal(true)}
        >
          {t('configSections.meal-planner.editMealPlan')}
        </Button>
        {saveError && (
          <p role="alert" className="text-xs text-hs-danger">{t('common.saveError')}</p>
        )}
      </div>

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
