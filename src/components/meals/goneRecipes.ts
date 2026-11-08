'use client';

import { useSyncExternalStore } from 'react';

/**
 * Recipes this page found gone from Mealie (a card opened on one answered
 * `reason: 'gone'`), by meal id. A recipe book read before the delete still
 * lists it until it reads Mealie again; it leaves the tile out from the
 * moment anything here learns, so nobody taps the same dead recipe twice.
 */
const gone = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();
const NONE: ReadonlySet<string> = new Set();

/** Record that Mealie no longer has this recipe. */
export function markRecipeGone(mealId: string): void {
  if (gone.has(mealId)) return;
  gone.add(mealId);
  snapshot = new Set(gone);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The recipes found gone so far on this page. */
export function useGoneRecipes(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => snapshot, () => NONE);
}

/** Forget every recipe found gone; for tests. */
export function resetGoneRecipes(): void {
  gone.clear();
  snapshot = new Set();
  for (const listener of listeners) listener();
}
