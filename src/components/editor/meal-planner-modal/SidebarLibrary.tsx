'use client';

import { useMemo, useState } from 'react';
import type { SavedMeal } from '@/types/config';
import { LIBRARY_FILTERS, type LibraryFilter, normalizeTag, DEFAULT_MEAL_EMOJI } from '@/lib/meal-constants';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { useTranslate } from '@/i18n';

interface SidebarLibraryProps {
  meals: SavedMeal[];
  selectedMealId: string | null;
  onSelectMeal: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onAddMeal: () => void;
}

function starRating(rating: number | undefined): string {
  if (!rating) return '';
  const filled = Math.round(rating);
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

export default function SidebarLibrary({
  meals,
  selectedMealId,
  onSelectMeal,
  onToggleFavorite,
  onAddMeal,
}: SidebarLibraryProps) {
  const t = useTranslate('editor');
  // Tag + difficulty labels live in `core.meal.*` (shared with /remote so
  // both surfaces resolve them without lazy-fetching the editor bundle).
  const tCore = useTranslate('core');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');

  // Library filter pill labels — re-uses tag translations for the tag-named
  // filters so "Quick"/"Schnell"/etc. stay consistent across the modal.
  const filterLabelMap = useMemo<Record<LibraryFilter, string>>(
    () => ({
      all: t('mealPlannerModal.library.filters.all'),
      favorites: t('mealPlannerModal.library.filters.favorites'),
      quick: tCore('meal.tags.quick'),
      healthy: tCore('meal.tags.healthy'),
      comfort: tCore('meal.tags.comfort'),
      'kid-friendly': tCore('meal.tags.kid-friendly'),
    }),
    [t, tCore],
  );

  const filteredMeals = useMemo(() => {
    let result = meals;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }

    if (filter === 'favorites') {
      result = result.filter((m) => m.isFavorite);
    } else if (filter !== 'all') {
      result = result.filter((m) =>
        m.tags?.some((t) => normalizeTag(t) === filter),
      );
    }

    return result;
  }, [meals, search, filter]);

  const isFiltered = Boolean(search) || filter !== 'all';

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-4 py-3 border-b border-hs-border-strong">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-hs-text-faint"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            className={`${MODAL_INPUT_CLASS} pl-8`}
            placeholder={t('mealPlannerModal.library.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 px-4 py-2 overflow-x-auto border-b border-hs-border-strong">
        {LIBRARY_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 px-2.5 py-1 text-xs rounded-full border transition-colors ${
              filter === f
                ? 'bg-amber-500/10 border-amber-500/50 text-amber-500'
                : 'border-hs-border-strong text-hs-text-faint hover:text-hs-text-muted'
            }`}
          >
            {filterLabelMap[f]}
          </button>
        ))}
      </div>

      {/* Meal list */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredMeals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-hs-text-faint gap-2 py-8">
            <svg
              className="w-10 h-10 opacity-40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.379a48.474 48.474 0 00-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265zm-3 0a.375.375 0 11-.53 0L9 2.845l.265.265zm6 0a.375.375 0 11-.53 0L15 2.845l.265.265z"
              />
            </svg>
            <span className="text-xs">
              {isFiltered
                ? t('mealPlannerModal.library.noMealsMatch')
                : t('mealPlannerModal.library.noMealsYet')}
            </span>
          </div>
        ) : (
          filteredMeals.map((meal) => {
            const isSelected = meal.id === selectedMealId;
            const meta: string[] = [];
            if (meal.prepTime) {
              meta.push(t('mealPlannerModal.picker.prepTimeShort', { minutes: meal.prepTime }));
            }
            if (meal.difficulty) {
              meta.push(tCore(`meal.difficulty.${meal.difficulty}`));
            }
            if (meal.rating) meta.push(starRating(meal.rating));

            return (
              <div
                key={meal.id}
                onClick={() => onSelectMeal(meal.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-1.5 border-transparent hover:bg-hs-card transition cursor-pointer ${
                  isSelected ? 'bg-amber-500/8 border-amber-500/20' : ''
                }`}
              >
                <span className="text-2xl w-8 text-center shrink-0">
                  {meal.emoji || DEFAULT_MEAL_EMOJI}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-hs-text-body truncate">
                    {meal.name}
                  </div>
                  {meta.length > 0 && (
                    <div className="text-xs text-hs-text-faint">
                      {meta.join(' · ')}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(meal.id);
                  }}
                  className="shrink-0 flex items-center justify-center min-w-[28px] min-h-[28px] text-base transition-colors"
                >
                  {meal.isFavorite ? (
                    <span className="text-hs-danger">&#9829;</span>
                  ) : (
                    <span className="text-hs-text-faint hover:text-hs-text-muted">&#9825;</span>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-hs-border-strong">
        <button
          type="button"
          className="w-full py-2.5 text-sm font-semibold border border-dashed border-hs-border-strong rounded-lg text-hs-text-faint hover:border-amber-500 hover:text-amber-500 hover:bg-amber-500/8 transition"
          onClick={onAddMeal}
        >
          {t('mealPlannerModal.library.addNewMealButton')}
        </button>
      </div>
    </div>
  );
}
