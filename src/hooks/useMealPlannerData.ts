'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import { displayCache } from '@/lib/display-cache';
import type {
  ModuleInstance,
  MealSettings,
  SavedMeal,
  PlannedMeal,
} from '@/types/config';

/** Wire type for `/api/meals/data`. */
export interface MealsPayload {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  settings: MealSettings;
}

/**
 * Legacy fields that used to be embedded in a meal-planner module's config
 * before meals moved to the shared `meals.json` store. None of them exist on
 * `MealPlannerConfig` or `FullscreenMealPlannerConfig` any more, so both
 * modules strip all five.
 */
const LEGACY_EMBEDDED_FIELDS = [
  'slots',
  'weekStartDay',
  'savedMeals',
  'plan',
  'previousPlan',
] as const;

/**
 * Shared meal data plumbing for the two meal-planner config sections.
 *
 * These sections previously carried ~65 byte-identical lines each, and the copy
 * had drifted twice: it deferred the `mealDataRef` assignment to an effect (so
 * an update fired in the same tick as a `setMealData` read the previous payload
 * and PUT stale meals), and it stripped only two of the five legacy embedded
 * fields (so a fullscreen module re-persisted meals the server migration had
 * just harvested out). Both behaviours are fixed here, once.
 *
 * Write failures are surfaced through `saveError` rather than swallowed. The
 * previous `catch {}` left the optimistic local state applied, so the editor
 * showed the user's change as saved while the server never received it.
 */
export function useMealPlannerData<C>({
  mod,
  set,
  showModal,
}: {
  mod: ModuleInstance;
  /** Setter from `useModuleConfig`, used to strip legacy embedded fields. */
  set: (patch: Partial<C>) => void;
  /** Re-fetch whenever the modal opens or closes so external edits land. */
  showModal: boolean;
}) {
  const [mealData, setMealData] = useState<MealsPayload>({
    savedMeals: [],
    plan: [],
    settings: { ...DEFAULT_MEAL_SETTINGS },
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchMealData = useCallback(() => {
    editorFetch('/api/meals/data')
      .then((r) => r.json())
      .then((d) => setMealData({
        savedMeals: d.savedMeals ?? [],
        plan: d.plan ?? [],
        settings: d.settings ?? { ...DEFAULT_MEAL_SETTINGS },
      }))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchMealData(); }, [fetchMealData, showModal]);

  // Assigned during render, NOT in an effect: `handleModalUpdate` can fire in
  // the same tick as a `setMealData`, and an effect-deferred ref would still
  // hold the previous payload at that point.
  const mealDataRef = useRef(mealData);
  mealDataRef.current = mealData;

  // One-time migration: strip stale fields from the in-memory module config.
  //
  // The server-side migration (in `parseAndMigrate` / `migrateLegacyMealSettings`)
  // already harvests any embedded `savedMeals` / `plan` from data/config.json
  // into the shared meals.json atomically on first read. This effect just
  // removes the now-orphan fields from the local Zustand store so the next
  // editor save doesn't persist them again. No network round-trip needed,
  // which eliminates the race where two mounted meal-planner modules
  // simultaneously GET-merge-PUT and clobber each other's embedded data.
  const modConfigRef = useRef(mod.config);
  modConfigRef.current = mod.config;
  useEffect(() => {
    const raw = modConfigRef.current as Record<string, unknown> | undefined;
    if (!raw) return;
    if (!LEGACY_EMBEDDED_FIELDS.some((f) => raw[f] !== undefined)) return;
    const cleared = Object.fromEntries(LEGACY_EMBEDDED_FIELDS.map((f) => [f, undefined]));
    set(cleared as Partial<C>);
    // Nudge the canvas preview so it re-fetches the (now migrated) meals.json
    // in case the server just backfilled embedded meals from this module.
    displayCache.invalidate('/api/meals/data');
    // Deliberately one-shot on mount: `set` and the config are read through
    // refs so a re-render cannot re-trigger the strip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleModalUpdate = useCallback(async (updates: Record<string, unknown>) => {
    const current = mealDataRef.current;
    // The modal only edits meals + plan. Don't include `settings` in the PUT body —
    // the API preserves existing settings when the field is omitted, which avoids
    // clobbering changes made concurrently from /remote or Settings → Meals since
    // this panel last fetched (the cached `current.settings` could be stale).
    const optimistic: MealsPayload = {
      savedMeals: (updates.savedMeals as SavedMeal[]) ?? current.savedMeals,
      plan: (updates.plan as PlannedMeal[]) ?? current.plan,
      settings: current.settings, // local optimistic state only — not sent
    };
    setMealData(optimistic);
    setSaveError(null);
    try {
      const res = await editorFetch('/api/meals/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          savedMeals: optimistic.savedMeals,
          plan: optimistic.plan,
          // settings deliberately omitted — API preserves existing
        }),
      });
      if (!res.ok) {
        // Roll back so the panel stops showing an edit the server rejected.
        setMealData(current);
        setSaveError('save-failed');
        return;
      }
      const data = await res.json();
      setMealData({
        savedMeals: data.savedMeals,
        plan: data.plan,
        // Use the server-returned settings (which may have been updated by
        // another surface in the meantime) so the local cache stays correct.
        settings: data.settings ?? optimistic.settings,
      });
      displayCache.invalidate('/api/meals/data');
    } catch (err) {
      // A 401 already triggered a login redirect; don't flash an error at a
      // user who is being navigated away.
      if (isSessionExpired(err)) return;
      setMealData(current);
      setSaveError('save-failed');
    }
  }, []);

  return { mealData, handleModalUpdate, saveError };
}
