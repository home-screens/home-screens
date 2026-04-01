'use client';

import { useMemo } from 'react';
import type { SavedMeal, PlannedMeal } from '@/types/config';
import { generateGroceryList, GROCERY_CATEGORIES, GROCERY_CATEGORY_ORDER } from '@/lib/grocery-utils';

interface SidebarGroceryProps {
  plan: PlannedMeal[];
  meals: SavedMeal[];
  checkedItems: Set<string>;
  onToggleItem: (key: string) => void;
}

export default function SidebarGrocery({ plan, meals, checkedItems, onToggleItem }: SidebarGroceryProps) {
  const groceryMap = useMemo(
    () => generateGroceryList(plan, meals, Array.from(checkedItems)),
    [plan, meals, checkedItems],
  );

  // Compute totals
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
            <span className="text-sm font-semibold text-neutral-300">
              {checked} of {total} items
            </span>
            <span className="text-[11px] text-neutral-600">From this week</span>
          </div>
          <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Empty state */}
        {total === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <span className="text-3xl opacity-20">&#128722;</span>
            <p className="text-sm text-neutral-500 text-center">
              Plan meals with ingredients to see your shopping list
            </p>
          </div>
        )}

        {/* Category groups */}
        {GROCERY_CATEGORY_ORDER.map((catKey) => {
          const group = groceryMap.get(catKey);
          if (!group) return null;

          const catChecked = group.items.filter((i) => i.checked).length;
          const catTotal = group.items.length;

          return (
            <div key={catKey} className="mb-5">
              {/* Category header */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  {GROCERY_CATEGORIES[catKey] ?? catKey}
                </span>
                <span className="ml-auto text-[10px] px-1.5 rounded bg-neutral-800 text-neutral-600">
                  {catChecked}/{catTotal}
                </span>
              </div>

              {/* Items */}
              {group.items.map((item) => {
                const itemKey = item.name.toLowerCase();
                const isChecked = item.checked;

                return (
                  <button
                    key={itemKey}
                    type="button"
                    onClick={() => onToggleItem(itemKey)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 cursor-pointer transition mb-0.5 ${
                      isChecked ? 'opacity-40' : ''
                    }`}
                  >
                    {/* Checkbox indicator */}
                    <span
                      className={`w-4.5 h-4.5 rounded border-2 flex items-center justify-center text-[10px] shrink-0 transition ${
                        isChecked
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-neutral-600'
                      }`}
                    >
                      {isChecked && '✓'}
                    </span>

                    {/* Item name */}
                    <span
                      className={`flex-1 text-sm font-medium text-left ${
                        isChecked
                          ? 'line-through text-neutral-600'
                          : 'text-neutral-300'
                      }`}
                    >
                      {item.name}
                    </span>

                    {/* Amount */}
                    {item.amount && (
                      <span className="text-xs text-neutral-600 shrink-0">
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
