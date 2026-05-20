'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SavedMeal, MealSlotType } from '@/types/config';
import { dateToDayIndex, getLocalizedDayNames, getMealSlotLabelKey, DEFAULT_MEAL_EMOJI } from '@/lib/meal-constants';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate, useFormattingLocale } from '@/i18n';

interface MealPickerPopoverProps {
  target: { date: string; slot: MealSlotType };
  meals: SavedMeal[];
  onSelect: (mealId: string) => void;
  onClose: () => void;
}

export default function MealPickerPopover({
  target,
  meals,
  onSelect,
  onClose,
}: MealPickerPopoverProps) {
  const t = useTranslate('editor');
  const tModules = useTranslate('modules');
  const formattingLocale = useFormattingLocale();
  const dayNamesFull = useMemo(
    () => getLocalizedDayNames(formattingLocale, 'full'),
    [formattingLocale],
  );
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredMeals = useMemo(() => {
    if (!search) return meals;
    const q = search.toLowerCase();
    return meals.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [meals, search]);

  // Auto-focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape key closes popover (capture phase so it fires before CRUDModalShell's handler)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const slotLabel = tModules(getMealSlotLabelKey(target.slot));
  const dayName = dayNamesFull[dateToDayIndex(target.date)] ?? '';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-hs-panel border border-hs-border-strong rounded-xl w-[360px] max-h-[480px] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-hs-border-strong">
          <div className="text-sm font-bold text-hs-text-body">{t('mealPlannerModal.picker.title')}</div>
          <div className="text-xs text-hs-text-faint">
            {dayName} &mdash; {slotLabel}
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-hs-border-strong/50">
          <input
            ref={inputRef}
            type="text"
            className={MODAL_INPUT_CLASS}
            placeholder={t('mealPlannerModal.picker.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredMeals.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-xs text-hs-text-faint">
              {t('mealPlannerModal.picker.noMealsFound')}
            </div>
          ) : (
            filteredMeals.map((meal) => (
              <button
                key={meal.id}
                onClick={() => onSelect(meal.id)}
                className="flex items-center gap-3 w-full px-2 py-2.5 rounded-md hover:bg-hs-card transition text-left"
              >
                <span className="text-2xl shrink-0">
                  {meal.emoji || DEFAULT_MEAL_EMOJI}
                </span>
                <span className="text-sm font-semibold text-hs-text-body flex-1 truncate">
                  {meal.name}
                </span>
                {meal.prepTime && (
                  <span className="text-xs text-hs-text-faint shrink-0">
                    {t('mealPlannerModal.picker.prepTimeShort', { minutes: meal.prepTime })}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
