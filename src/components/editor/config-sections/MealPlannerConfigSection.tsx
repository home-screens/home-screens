'use client';

import Link from 'next/link';
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
import { mealSaveFailedKey } from '@/components/editor/meal-planner-modal/save-failed-words';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { settingsPath } from '@/lib/settings-route';
import PhoneSurfaceLinks from '@/components/editor/PhoneSurfaceLinks';
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
  showFamilyRatings?: boolean;
  accentColor?: string;
  tapRecipeAction?: RecipeTapAction;
  showTitle?: boolean;
  interactive?: boolean;
};

export function MealPlannerConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const view = c.view ?? 'week';
  // The Recipes view lists recipes to open on the card: it shows no tags, and
  // a tap there always opens the card, so neither setting does anything.
  const plannedMeals = view !== 'recipes';
  const VIEWS: { value: MealPlannerView; label: string }[] = [
    { value: 'week', label: t('configSections.meal-planner.viewWeek') },
    { value: 'today', label: t('configSections.meal-planner.viewToday') },
    { value: 'next-meal', label: t('configSections.meal-planner.viewNextMeal') },
    { value: 'compact', label: t('configSections.meal-planner.viewCompact') },
    { value: 'list', label: t('configSections.meal-planner.viewList') },
    { value: 'grocery', label: t('configSections.meal-planner.viewGrocery') },
    { value: 'recipes', label: t('configSections.meal-planner.viewRecipes') },
  ];
  const [showModal, setShowModal] = useState(false);
  const { mealData, handleModalUpdate, toggleGroceryItem, saveError, reload, showMealieRange, mealieWeeks, suggestFromMealie } = useMealPlannerData<Config>({
    mod,
    set,
    showModal,
  });

  return (
    <>
      {/* View Mode */}
      <ViewSelect
        value={view}
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
      {plannedMeals && (
        <Toggle
          label={t('configSections.meal-planner.showTags')}
          checked={c.showTags ?? true}
          onChange={(v) => set({ showTags: v })}
        />
      )}

      <Toggle label={t('configSections.meal-planner.showFamilyRatings')} checked={c.showFamilyRatings !== false} onChange={(v) => set({ showFamilyRatings: v })} />

      {/* Tap-to-open recipe */}
      {plannedMeals && (
        <>
          <LabeledSelect
            label={t('configSections.meal-planner.tapRecipeAction')}
            value={c.tapRecipeAction ?? 'off'}
            onChange={(v) => set({ tapRecipeAction: v })}
            options={[
              { value: 'off', label: t('configSections.meal-planner.tapRecipeActionOff') },
              { value: 'qr', label: t('configSections.meal-planner.tapRecipeActionQr') },
              { value: 'card', label: t('configSections.meal-planner.tapRecipeActionCard') },
              { value: 'iframe', label: t('configSections.meal-planner.tapRecipeActionIframe') },
            ]}
          />
          {c.tapRecipeAction === 'card' && (
            <p className="text-[11px] text-hs-text-faint leading-relaxed">
              {t('configSections.meal-planner.tapRecipeActionCardHint')}
            </p>
          )}
          {c.tapRecipeAction === 'iframe' && (
            <p className="text-[11px] text-hs-text-faint leading-relaxed">
              {t('configSections.meal-planner.tapRecipeActionIframeHint')}
            </p>
          )}
          {(c.tapRecipeAction === 'qr' || c.tapRecipeAction === 'iframe') && (
            <p className="text-[11px] text-hs-text-faint leading-relaxed">
              {t('configSections.meal-planner.tapRecipeActionNoLinkHint')}
            </p>
          )}
        </>
      )}

      {/* Ticking the grocery list, opening recipes and scrolling long lists on the wall */}
      {(view === 'grocery' || view === 'recipes' || view === 'list' || view === 'week') && (
        <>
          <Toggle
            label={t('configSections.meal-planner.interactive')}
            checked={c.interactive !== false}
            onChange={(v) => set({ interactive: v })}
          />
          <p className="text-[11px] text-hs-text-faint leading-relaxed">
            {t('configSections.meal-planner.interactiveHint')}
          </p>
        </>
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
        <Link href={settingsPath({ kind: 'defaults', page: 'meals' })} className="text-hs-accent hover:text-hs-accent-hover underline">{t('configSections.meal-planner.sharedSettingsLink')}</Link>{' '}
        {t('configSections.meal-planner.sharedSettingsSuffix')}
      </p>
      <PhoneSurfaceLinks context="meals" />

      {/* Open Modal */}
      <div className="pt-1 border-t border-hs-border-strong space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-hs-text-faint">
          {mealData.source === 'mealie' ? (
            // Mealie's recipes are not a library kept here, and its plan here
            // is only the weeks around today: say where the plan lives instead.
            <span>{t('mealPlannerModal.mealie.fromMealie')}</span>
          ) : (
            <>
              <span>{t('configSections.meal-planner.savedMealsCount', { count: mealData.savedMeals.length })}</span>
              <span>&middot;</span>
              <span>{t('configSections.meal-planner.plannedCount', { count: mealData.plan.length })}</span>
            </>
          )}
        </div>
        <Button
          variant="primary"
          className="w-full text-xs"
          onClick={() => setShowModal(true)}
        >
          {t('configSections.meal-planner.editMealPlan')}
        </Button>
        {/* The meal change, not the layout: meals save on their own, so the
            editor's Saved can be right while this is not. */}
        {saveError && (
          <p role="alert" className="text-xs text-hs-danger">{t(mealSaveFailedKey(saveError, mealData.source === 'mealie'))}</p>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <MealPlannerModal
          savedMeals={mealData.savedMeals}
          plan={mealData.plan}
          settings={mealData.settings}
          groceryChecked={mealData.groceryChecked}
          familyRatings={mealData.familyRatings}
          onToggleGroceryItem={toggleGroceryItem}
          accentColor={c.accentColor ?? DEFAULT_ACCENT_COLOR}
          onUpdate={handleModalUpdate}
          onClose={() => setShowModal(false)}
          source={mealData.source}
          mealie={mealData.mealie}
          onShowMealieRange={showMealieRange}
          mealieWeeks={mealieWeeks}
          onReload={reload}
          onSuggestFromMealie={suggestFromMealie}
          saveError={saveError}
          loaded={mealData.loaded}
        />
      )}
    </>
  );
}
