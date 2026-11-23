'use client';

import { useTranslate } from '@/i18n';
import Button from '@/components/ui/Button';
import MealPlannerModal from '@/components/editor/meal-planner-modal';
import { mealSaveFailedText } from '@/components/editor/meal-planner-modal/save-failed-words';
import type { useMealPlannerData } from '@/hooks/useMealPlannerData';

/**
 * The foot of both meal planner panels: how many meals are saved and
 * planned (or that the plan is Mealie's), the Edit meal plan button, the
 * line for a meal change that did not save, and the meal planner window.
 * Each panel calls `useMealPlannerData` itself (the full-screen one reads
 * the meals further up, for its recipe count) and hands the result in.
 */
export default function MealPlanLauncher({ meals, accentColor, countKeyPrefix, open, onOpenChange }: {
  meals: ReturnType<typeof useMealPlannerData>;
  /** The accent the window is drawn in: the module's own. */
  accentColor: string;
  /** Whose count strings to use. */
  countKeyPrefix: 'meal-planner' | 'fullscreen-meal-planner';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const { mealData, handleModalUpdate, toggleGroceryItem, saveError, reload, showMealieRange, mealieWeeks, suggestFromMealie } = meals;
  return (
    <>
      <div className="pt-1 border-t border-hs-border-strong space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-hs-text-faint">
          {mealData.source === 'mealie' ? (
            // Mealie's recipes are not a library kept here, and its plan here
            // is only the weeks around today: say where the plan lives instead.
            <span>{tCore('mealie.pill.label')}</span>
          ) : (
            <>
              <span>{t(`configSections.${countKeyPrefix}.savedMealsCount`, { count: mealData.savedMeals.length })}</span>
              <span>&middot;</span>
              <span>{t(`configSections.${countKeyPrefix}.plannedCount`, { count: mealData.plan.length })}</span>
            </>
          )}
        </div>
        <Button
          variant="primary"
          className="w-full text-xs"
          onClick={() => onOpenChange(true)}
        >
          {t('configSections.meal-planner.editMealPlan')}
        </Button>
        {/* The meal change, not the layout: meals save on their own, so the
            editor's Saved can be right while this is not. */}
        {saveError && (
          <p role="alert" className="text-xs text-hs-danger">{mealSaveFailedText(saveError, mealData.source === 'mealie', t, tCore)}</p>
        )}
      </div>

      {open && (
        <MealPlannerModal
          savedMeals={mealData.savedMeals}
          plan={mealData.plan}
          settings={mealData.settings}
          groceryChecked={mealData.groceryChecked}
          familyRatings={mealData.familyRatings}
          onToggleGroceryItem={toggleGroceryItem}
          accentColor={accentColor}
          onUpdate={handleModalUpdate}
          onClose={() => onOpenChange(false)}
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
