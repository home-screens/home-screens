'use client';

import { useEffect, useState } from 'react';
import { searchMealieRecipes } from '@/lib/meal-client';
import { editorFetch } from '@/lib/editor-fetch';

/** A recipe count barely moves; asking Mealie once every few minutes is plenty. */
const COUNT_TTL_MS = 5 * 60_000;

let cached: { total: number; at: number } | null = null;
let inFlight: Promise<number> | null = null;

function fetchCount(): Promise<number> {
  if (cached && Date.now() - cached.at < COUNT_TTL_MS) return Promise.resolve(cached.total);
  inFlight ??= searchMealieRecipes(editorFetch, { filter: 'all' })
    .then((page) => {
      cached = { total: page.total, at: Date.now() };
      return page.total;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * How many recipes the family keeps in Mealie, for "Search 848 recipes in
 * Mealie". Null until Mealie has said (or when it cannot), and the search box
 * then reads without a number.
 */
export function useMealieRecipeCount(enabled: boolean): number | null {
  const [total, setTotal] = useState<number | null>(() => cached?.total ?? null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchCount().then((n) => { if (live) setTotal(n); }, () => { /* the box reads without a number */ });
    return () => { live = false; };
  }, [enabled]);
  return enabled ? total : null;
}
