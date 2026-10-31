'use client';

import { useMemo } from 'react';
import type { SavedMeal, PlannedMeal } from '@/types/config';
import {
  generateGroceryList,
  groceryListNeedsHeadings,
  plannedMealsWithoutIngredients,
  shortNameList,
  GROCERY_CATEGORY_ORDER,
} from '@/lib/grocery-utils';
import { useLocale, useTranslate } from '@/i18n';
import type { ShownWeek } from '@/lib/meal-plan-words';

interface SidebarGroceryProps {
  plan: PlannedMeal[];
  meals: SavedMeal[];
  /** The viewed week's ticks (`groceryChecksForWeek`) */
  checkedItems: readonly string[];
  onToggleItem: (key: string) => void;
  /** The week the list is for: "this week" only while it is this week. */
  week: ShownWeek;
}

export default function SidebarGrocery({ plan, meals, checkedItems, onToggleItem, week }: SidebarGroceryProps) {
  const t = useTranslate('editor');
  // Grocery category labels live in `core.meal.grocery.categoryLabels.*`
  // (shared with /remote).
  const tCore = useTranslate('core');
  const groceryMap = useMemo(
    () => generateGroceryList(plan, meals, checkedItems),
    [plan, meals, checkedItems],
  );

  const showHeadings = groceryListNeedsHeadings(groceryMap);
  const locale = useLocale();
  const withoutIngredients = useMemo(() => plannedMealsWithoutIngredients(plan, meals), [plan, meals]);

  let total = 0;
  let checked = 0;
  for (const [, group] of groceryMap) {
    for (const item of group.items) {
      total++;
      if (item.checked) checked++;
    }
  }

  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4">
        {/* Progress section */}
        <div className="mb-4">
          <div className="flex justify-between mb-1.5">
            <span className="text-sm font-semibold text-hs-text-secondary">
              {t('mealPlannerModal.grocery.itemsCount', { checked, total })}
            </span>
            <span className="text-[11px] text-hs-text-faint">{week.thisWeek ? t('mealPlannerModal.grocery.fromThisWeek') : t('mealPlannerModal.grocery.fromDates', { range: week.range })}</span>
          </div>
          <div className="h-1 bg-hs-card rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          {withoutIngredients.length > 0 && (
            <p data-grocery-without-ingredients className="mt-2 text-xs leading-snug text-hs-text-muted">
              {t('mealPlannerModal.grocery.withoutIngredients', {
                count: withoutIngredients.length,
                names: shortNameList(
                  withoutIngredients.map((m) => m.name),
                  locale,
                  (count) => t('mealPlannerModal.grocery.moreMeals', { count }),
                ),
              })}
            </p>
          )}
        </div>

        {/* Empty state */}
        {total === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <span className="text-3xl opacity-20">&#128722;</span>
            <p className="text-sm text-hs-text-faint text-center">
              {t('mealPlannerModal.grocery.emptyMessage')}
            </p>
          </div>
        )}

        {/* Category groups */}
        {GROCERY_CATEGORY_ORDER.map((catKey) => {
          const group = groceryMap.get(catKey);
          if (!group) return null;

          const catChecked = group.items.filter((i) => i.checked).length;
          const catTotal = group.items.length;
          // `t()` returns the raw key path on miss (and emits a once-per-key
          // dev warning), which is the right developer feedback for any future
          // GroceryCategory enum value added without a matching translation.
          const categoryLabel = tCore(`meal.grocery.categoryLabels.${catKey}`);

          return (
            <div key={catKey} className="mb-5">
              {/* Category header, unless the whole list is one aisle */}
              {showHeadings && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-hs-text-faint">
                  {categoryLabel}
                </span>
                <span className="ml-auto text-[10px] px-1.5 rounded bg-hs-card text-hs-text-faint">
                  {catChecked}/{catTotal}
                </span>
              </div>
              )}

              {/* Items */}
              {group.items.map((item) => {
                const itemKey = item.name.toLowerCase();
                const isChecked = item.checked;

                return (
                  <button
                    key={itemKey}
                    type="button"
                    onClick={() => onToggleItem(itemKey)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md border border-hs-border bg-hs-panel hover:bg-hs-card cursor-pointer transition mb-0.5 ${
                      isChecked ? 'opacity-40' : ''
                    }`}
                  >
                    {/* Checkbox indicator */}
                    <span
                      className={`w-4.5 h-4.5 rounded border-2 flex items-center justify-center text-[10px] shrink-0 transition ${
                        isChecked
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-hs-border-strong'
                      }`}
                    >
                      {isChecked && '✓'}
                    </span>

                    {/* Item name */}
                    <span
                      className={`flex-1 text-sm font-medium text-left ${
                        isChecked
                          ? 'line-through text-hs-text-faint'
                          : 'text-hs-text-secondary'
                      }`}
                    >
                      {item.name}
                    </span>

                    {/* Amount */}
                    {item.amount && (
                      <span className="text-xs text-hs-text-faint shrink-0">
                        {item.amount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
