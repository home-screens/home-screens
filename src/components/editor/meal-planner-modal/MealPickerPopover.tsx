'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SavedMeal, MealSlotType } from '@/types/config';
import { SLOT_META, DAY_NAMES_FULL } from '@/components/modules/meal-planner/types';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';

interface MealPickerPopoverProps {
  target: { day: number; slot: MealSlotType };
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

  const slotLabel = SLOT_META[target.slot]?.label ?? target.slot;
  const dayName = DAY_NAMES_FULL[target.day] ?? '';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-neutral-900 border border-neutral-700 rounded-xl w-[360px] max-h-[480px] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-neutral-700">
          <div className="text-sm font-bold text-neutral-200">Choose a Meal</div>
          <div className="text-xs text-neutral-500">
            {dayName} &mdash; {slotLabel}
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-neutral-700/50">
          <input
            ref={inputRef}
            type="text"
            className={MODAL_INPUT_CLASS}
            placeholder="Search meals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredMeals.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-xs text-neutral-500">
              No meals found
            </div>
          ) : (
            filteredMeals.map((meal) => (
              <button
                key={meal.id}
                onClick={() => onSelect(meal.id)}
                className="flex items-center gap-3 w-full px-2 py-2.5 rounded-md hover:bg-neutral-800 transition text-left"
              >
                <span className="text-xl shrink-0">
                  {meal.emoji || '🍽️'}
                </span>
                <span className="text-sm font-semibold text-neutral-200 flex-1 truncate">
                  {meal.name}
                </span>
                {meal.prepTime && (
                  <span className="text-xs text-neutral-500 shrink-0">
                    {meal.prepTime}m
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
