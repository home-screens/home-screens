'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import { MealClientError, MealSession, type MealEdit, type MealieRange, type MealSnapshot } from '@/lib/meal-client';
import type { MealieProblem, MealieWireBlock } from '@/lib/meal-sources';
import { groceryTapDirection, setGroceryCheck, type GroceryChecked } from '@/lib/grocery-checks';
import { displayCache } from '@/lib/display-cache';
import type {
  ModuleInstance,
  MealSettings,
  MealSlotType,
  SavedMeal,
  PlannedMeal,
} from '@/types/config';

/** What the modal renders: the two editable halves, the grocery ticks and the shared settings. */
export interface MealsPayload {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  groceryChecked: GroceryChecked;
  settings: MealSettings;
  /** Where `plan` and `savedMeals` came from; in Mealie mode they are Mealie's. */
  source: MealSnapshot['source'];
  /** Mealie's block (status, range, address) while the plan lives there. */
  mealie: MealieWireBlock | null;
  /** Mealie's address and token are saved. */
  mealieConnected: boolean;
  /**
   * A load has landed. Until then the empty arrays here were never received
   * (they read as the family's own plan with no meals), so nothing may plan
   * against them.
   */
  loaded: boolean;
}

/**
 * Why the last meal save failed: Mealie's reason when Mealie refused it, so
 * a refused token is not reported as Mealie being down, or nothing more than
 * that it failed.
 */
export interface MealSaveFailure {
  problem?: MealieProblem;
}

function saveFailure(err: unknown): MealSaveFailure {
  return { problem: err instanceof MealClientError ? err.problem : undefined };
}

/** How often an open planner window asks the hub for the meals again. */
const OPEN_REFRESH_MS = 15_000;

const EMPTY_PAYLOAD = (): MealsPayload => ({
  savedMeals: [],
  plan: [],
  groceryChecked: {},
  settings: { ...DEFAULT_MEAL_SETTINGS },
  source: 'local',
  mealie: null,
  mealieConnected: false,
  loaded: false,
});

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

function view(snapshot: MealSnapshot): MealsPayload {
  return {
    savedMeals: snapshot.savedMeals,
    plan: snapshot.plan,
    groceryChecked: snapshot.groceryChecked,
    settings: snapshot.settings,
    source: snapshot.source,
    mealie: snapshot.mealie,
    mealieConnected: snapshot.mealieConnected,
    loaded: true,
  };
}

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
 * Loading and saving go through `MealSession` (`lib/meal-client.ts`), which the
 * phone uses too. Until a load has succeeded there is nothing to edit: the
 * empty arrays held here were never received, and an edit computed from them
 * would replace the stored library with its one meal. The session applies an
 * edit to the loaded copy (waiting for a load still in flight), and refuses
 * it, reported through `saveError`, when the load failed.
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
  const [mealData, setMealData] = useState<MealsPayload>(EMPTY_PAYLOAD);
  const [saveError, setSaveError] = useState<MealSaveFailure | null>(null);
  const [session] = useState(() => new MealSession(editorFetch));

  const fetchMealData = useCallback(() => {
    session.load()
      .then((snapshot) => { if (session.idle) setMealData(view(snapshot)); })
      .catch(() => {});
  }, [session]);

  useEffect(() => { fetchMealData(); }, [fetchMealData, showModal]);

  // While the window is open, ask again every so often (as often as the
  // phone's Meals tab does) and when the tab comes back into view, so a meal
  // planned on the phone shows here without a save from this side first. A
  // copy answered while a save is on its way is not adopted, and the meal
  // being edited in Detail keeps its fields, so nothing typed is replaced.
  useEffect(() => {
    if (!showModal) return;
    const whenVisible = () => {
      if (document.visibilityState === 'visible') fetchMealData();
    };
    document.addEventListener('visibilitychange', whenVisible);
    const poll = setInterval(whenVisible, OPEN_REFRESH_MS);
    return () => {
      document.removeEventListener('visibilitychange', whenVisible);
      clearInterval(poll);
    };
  }, [showModal, fetchMealData]);

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

  /**
   * Apply one edit optimistically and save it. Only the half the edit changed
   * goes on the wire; `settings` is never sent, it belongs to /remote and
   * Settings > Meals. Saves queue in the session, so the panel keeps showing
   * its optimistic state until the last queued save is answered, then adopts
   * what the hub has (which may include another surface's edits).
   */
  const handleModalUpdate = useCallback(async (edit: MealEdit) => {
    const current = mealDataRef.current;
    const changes = edit(current);
    setMealData({
      ...current,
      savedMeals: changes.savedMeals ?? current.savedMeals,
      plan: changes.plan ?? current.plan,
    });
    setSaveError(null);
    try {
      const saved = await session.save(edit);
      if (session.idle) setMealData(view(saved));
    } catch (err) {
      // A 401 already triggered a login redirect; don't flash an error at a
      // user who is being navigated away.
      if (isSessionExpired(err)) return;
      // Roll back so the panel stops showing an edit the server rejected:
      // to the loaded copy, or to nothing when there is none.
      setMealData(session.current ? view(session.current) : EMPTY_PAYLOAD());
      setSaveError(saveFailure(err));
    }
  }, [session]);

  /**
   * Tick or untick one item on the list of `week` (that week's key), in the
   * same store and by the same rules as the phone, so the dialog and the
   * phone show one list. Applied optimistically, sent through the session's
   * queue like any save, and put back if refused.
   */
  const toggleGroceryItem = useCallback(async (week: string, item: string) => {
    const direction = groceryTapDirection(mealDataRef.current.groceryChecked, week, item);
    const apply = (dir: typeof direction) =>
      setMealData((d) => ({ ...d, groceryChecked: setGroceryCheck(d.groceryChecked, week, item, dir) }));
    apply(direction);
    setSaveError(null);
    try {
      const saved = await session.tick(week, item, direction);
      if (session.idle) setMealData(view(saved));
    } catch (err) {
      if (isSessionExpired(err)) return;
      apply(direction === 'check' ? 'uncheck' : 'check');
      setSaveError(saveFailure(err));
    }
  }, [session]);

  /**
   * In Mealie mode, bring the days of `range` into the copy when the modal
   * pages past the weeks every answer carries. `mealieWeeks` says whether
   * that is on its way or failed, so the week can say so instead of looking
   * empty.
   */
  const [mealieWeeks, setMealieWeeks] = useState<'idle' | 'loading' | 'failed'>('idle');
  const showMealieRange = useCallback(async (range: MealieRange) => {
    setMealieWeeks('loading');
    try {
      const snapshot = await session.showMealieRange(range);
      if (session.idle) setMealData(view(snapshot));
      setMealieWeeks('idle');
    } catch (err) {
      if (isSessionExpired(err)) return;
      setMealieWeeks('failed');
    }
  }, [session]);

  /**
   * Mealie's own picks for the empty meals among `cells` (Suggest, while the
   * plan lives in Mealie). How many it filled and had nothing for, or null
   * when the hub or Mealie refused.
   */
  const suggestFromMealie = useCallback(async (cells: { date: string; slot: MealSlotType }[]) => {
    try {
      const { snapshot, created, skipped, entries } = await session.suggestFromMealie(cells);
      if (session.idle) setMealData(view(snapshot));
      return { created, skipped, entries };
    } catch (err) {
      if (!isSessionExpired(err)) setSaveError(saveFailure(err));
      return null;
    }
  }, [session]);

  return {
    mealData,
    handleModalUpdate,
    toggleGroceryItem,
    saveError,
    /** Ask the hub again (after Mealie stopped answering). */
    reload: fetchMealData,
    showMealieRange,
    mealieWeeks,
    suggestFromMealie,
  };
}
