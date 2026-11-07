'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { SavedMeal } from '@/types/config';
import { saveMealFavorite, type MealFetch } from '@/lib/meal-client';
import { claimsMealieId } from '@/lib/mealie-map';

/**
 * Hearts changed on this page, by meal id, until what the page loads agrees.
 * A wall tile, the recipe card it opened and a phone list draw the same heart
 * at once, without any of them loading again. A heart taken off on Favorites
 * stays drawn empty on its card until that list loads again, rather than the
 * card jumping away under the finger.
 */
const changed = new Map<string, boolean>();
/** Saves still on their way, by meal id; a heart is not forgotten while one is. */
const saving = new Map<string, number>();
/** Each meal's saves, one after another, so two quick taps land in the order they were made. */
const queue = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
/** `changed` as of the last change, a new map each time, for lists that read every heart. */
let changedSnapshot: ReadonlyMap<string, boolean> = new Map();
const NO_HEARTS: ReadonlyMap<string, boolean> = new Map();

function emit() {
  changedSnapshot = new Map(changed);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** What the loaded meal says, or null when it does not say (a Mealie meal from the plan, before its recipe loads). */
function loaded(meal: Pick<SavedMeal, 'id' | 'isFavorite'>): boolean | null {
  if (meal.isFavorite !== undefined) return meal.isFavorite;
  // A family recipe without the flag is not a favorite; a Mealie recipe
  // without it has simply not been asked about.
  return claimsMealieId(meal.id) ? null : false;
}

export interface MealFavorite {
  /** A favorite or not, counting a heart just changed here; null while not known yet. */
  isFavorite: boolean | null;
  /** Change the heart now and save it; it goes back, and `onFailed` hears why, if the save fails. */
  toggle: () => void;
}

/**
 * The heart of one meal: in Mealie's favorites for a Mealie recipe, in
 * meals.json for one of the family's own (`POST /api/meals/favorite`).
 */
export function useMealFavorite(
  meal: Pick<SavedMeal, 'id' | 'isFavorite'> | null,
  fetcher: MealFetch,
  onFailed?: (err: unknown) => void,
): MealFavorite {
  const id = meal?.id ?? '';
  const mine = useSyncExternalStore(subscribe, () => (id ? changed.get(id) : undefined), () => undefined);
  const busy = useSyncExternalStore(subscribe, () => (id ? saving.has(id) : false), () => false);
  const base = meal ? loaded(meal) : null;
  const isFavorite = mine ?? base;

  // Once what was loaded says the same as the heart changed here, the loaded
  // copy is the truth again, so a heart changed later in Mealie shows.
  useEffect(() => {
    if (mine !== undefined && base === mine && !busy) {
      changed.delete(id);
      emit();
    }
  }, [id, mine, base, busy]);

  const toggle = useCallback(() => {
    if (!id || isFavorite === null) return;
    const next = !isFavorite;
    changed.set(id, next);
    saving.set(id, (saving.get(id) ?? 0) + 1);
    emit();
    const run = (queue.get(id) ?? Promise.resolve())
      .then(() => saveMealFavorite(fetcher, id, next))
      .catch((err: unknown) => {
        // Back to how it was, unless a later tap has changed it again.
        if (changed.get(id) === next) changed.set(id, !next);
        onFailed?.(err);
      })
      .finally(() => {
        const left = (saving.get(id) ?? 1) - 1;
        if (left > 0) saving.set(id, left);
        else saving.delete(id);
        if (queue.get(id) === run) queue.delete(id);
        emit();
      });
    queue.set(id, run);
  }, [id, isFavorite, fetcher, onFailed]);

  return { isFavorite, toggle };
}

/**
 * Every heart changed on this page and not yet in what the page loaded, by
 * meal id, for a list that filters on hearts (the wall's Favorites) to count
 * them before the meals load again.
 */
export function useMealHeartsChangedHere(): ReadonlyMap<string, boolean> {
  return useSyncExternalStore(subscribe, () => changedSnapshot, () => NO_HEARTS);
}

/** The same, read once (when a list is chosen). */
export function mealHeartsChangedHere(): ReadonlyMap<string, boolean> {
  return changedSnapshot;
}

/** Forget every heart changed on this page; for tests. */
export function resetMealFavorites(): void {
  changed.clear();
  saving.clear();
  queue.clear();
  emit();
}
