'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { searchMealieRecipes } from '@/lib/meal-client';
import { editorFetch } from '@/lib/editor-fetch';

/**
 * Half a minute: the box said "Search 850 recipes" over a list holding 851
 * for five minutes after a recipe was added in Mealie. A list showing All
 * says the number itself as it loads (`noteMealieRecipeCount`), so this is
 * only for a box opened on another chip.
 */
const COUNT_TTL_MS = 30_000;

let cached: { total: number; at: number } | null = null;
let inFlight: Promise<number> | null = null;
const listeners = new Set<() => void>();

function publish(total: number): void {
  const changed = cached?.total !== total;
  cached = { total, at: Date.now() };
  if (changed) for (const listener of listeners) listener();
}

/** How many recipes Mealie holds, as an answer for All with nothing typed just said. */
export function noteMealieRecipeCount(total: number): void {
  publish(total);
}

function fetchCount(fresh: boolean): Promise<number> {
  if (!fresh && cached && Date.now() - cached.at < COUNT_TTL_MS) return Promise.resolve(cached.total);
  inFlight ??= searchMealieRecipes(editorFetch, { filter: 'all' })
    .then((page) => {
      publish(page.total);
      return page.total;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * How many recipes the family keeps in Mealie, for "Search 848 recipes in
 * Mealie". Null until Mealie has said (or when it cannot), and the search box
 * then reads without a number. `refresh` changing asks Mealie again whatever
 * is kept (the search's `recovered` once Mealie answers after an outage, a
 * refresh of the list).
 */
export function useMealieRecipeCount(enabled: boolean, refresh = 0): number | null {
  const total = useSyncExternalStore(subscribe, () => cached?.total ?? null, () => null);
  const asked = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const fresh = asked.current !== null && asked.current !== refresh;
    asked.current = refresh;
    fetchCount(fresh).catch(() => { /* the box reads without a number */ });
  }, [enabled, refresh]);
  return enabled ? total : null;
}

/** Forget the count; for tests. */
export function resetMealieRecipeCount(): void {
  cached = null;
  inFlight = null;
}
