'use client';

import { useState, useCallback, useRef } from 'react';
import { useTranslate } from '@/i18n';
import type { SavedMeal, PlannedMeal, MealSettings, MealSlotType, TimeFormat } from '@/types/config';
import { DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import { MealClientError, MealSession, type MealEdit, type MealSnapshot, type MealieRange } from '@/lib/meal-client';
import type { MealieWireBlock } from '@/lib/meal-sources';
import { groceryTapDirection, setGroceryCheck, type GroceryChecked } from '@/lib/grocery-checks';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';

export function useMealsData() {
  const t = useTranslate('remote');
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [plan, setPlan] = useState<PlannedMeal[]>([]);
  const [groceryChecked, setGroceryChecked] = useState<GroceryChecked>({});
  const [settings, setSettings] = useState<MealSettings>({ ...DEFAULT_MEAL_SETTINGS });
  // Household GlobalSettings.timeFormat, reported alongside the meal settings
  // (always present in the GET response). Meal surfaces resolve their effective
  // format against this when the shared settings carry no override.
  const [globalTimeFormat, setGlobalTimeFormat] = useState<TimeFormat>('12h');
  const [loading, setLoading] = useState(true);
  // The meals have never loaded and the last try failed: said in so many
  // words, never shown as an empty week (which reads as "nothing planned").
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Where the plan above came from. In Mealie mode `plan` and `savedMeals`
  // are Mealie's plan and the recipes it uses, and saves go to Mealie.
  const [source, setSource] = useState<MealSnapshot['source']>('local');
  const [mealie, setMealie] = useState<MealieWireBlock | null>(null);
  const [mealieConnected, setMealieConnected] = useState(false);
  // A week beyond the ones every answer carries is on its way from Mealie.
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeFailed, setRangeFailed] = useState(false);

  // Loads and saves share one session (`lib/meal-client.ts`): it keeps the
  // copy the hub last answered with, quotes its revision on every save, and
  // re-applies an edit to the hub's newer copy when somebody else saved first.
  const [session] = useState(() => new MealSession(editorFetch));

  const adoptData = useCallback((snapshot: MealSnapshot) => {
    setSavedMeals(snapshot.savedMeals);
    setPlan(snapshot.plan);
    setGroceryChecked(snapshot.groceryChecked);
    setSource(snapshot.source);
    setMealie(snapshot.mealie);
    setMealieConnected(snapshot.mealieConnected);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const snapshot = await session.load();
      setLoadError(false);
      // A load answered while a save or a tick is out is older than its answer.
      if (!session.idle) return;
      adoptData(snapshot);
      setSettings(snapshot.settings);
      setGlobalTimeFormat(snapshot.globalTimeFormat);
    } catch (err) {
      // A refresh that fails keeps what is on screen.
      if (!isSessionExpired(err) && !session.current) setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [session, adoptData]);

  /**
   * Load again behind the loading line: after the plan moved between Home
   * Screens and Mealie, the copy on screen is the other app's plan, and
   * showing it for a moment under the new heading would be wrong.
   */
  const reloadFresh = useCallback(async () => {
    setLoading(true);
    await fetchData();
  }, [fetchData]);

  /**
   * Bring Mealie's plan for `range` in, when the week shown is outside the
   * weeks every answer carries. The session keeps those days through later
   * saves and reloads; a copy that already holds them asks nothing.
   */
  const showMealieRange = useCallback(async (range: MealieRange) => {
    setRangeLoading(true);
    setRangeFailed(false);
    try {
      const snapshot = await session.showMealieRange(range);
      if (session.idle) adoptData(snapshot);
    } catch (err) {
      // The hub did not answer for those weeks at all. (Mealie being down is
      // not this: that arrives as the copy's own status.)
      if (!isSessionExpired(err)) setRangeFailed(true);
    } finally {
      setRangeLoading(false);
    }
  }, [session, adoptData]);

  /**
   * Save one edit, written as a function of the copy it applies to (see
   * `MealEdit`). Return only the half the action changed: assigning a meal to
   * a slot returns `{ plan }`, editing the library `{ savedMeals }`, deleting a
   * meal both. The API preserves omitted fields, so an open editor modal and
   * this phone cannot overwrite each other's untouched half; the revision the
   * session quotes stops a stale copy of the same half replacing a newer one.
   *
   * Callers apply their optimistic state first. Once the last queued save is
   * answered, the hub's copy replaces it; on failure the last loaded copy
   * does, so the tab never keeps showing an edit that was not saved.
   */
  const saveData = useCallback(async (edit: MealEdit): Promise<boolean> => {
    try {
      const saved = await session.save(edit);
      if (session.idle) adoptData(saved);
      return true;
    } catch (err) {
      if (isSessionExpired(err)) return false;
      setSaveError(err instanceof MealClientError ? 'Failed to save. Please try again.' : 'Network error. Please try again.');
      if (session.current && session.idle) adoptData(session.current);
      // A save Mealie refused is often Mealie going away: ask again, so the
      // tab shows that and pauses planning instead of failing the next tap.
      if (session.current?.source === 'mealie') void fetchData();
      return false;
    }
  }, [session, adoptData, fetchData]);

  /**
   * Mealie's own picks for the empty meals among `cells` (Suggest, in Mealie
   * mode). Answers how many it filled and how many it had nothing for, or
   * null when the hub or Mealie refused.
   */
  const suggestFromMealie = useCallback(async (cells: { date: string; slot: MealSlotType }[]) => {
    try {
      const { snapshot, created, skipped, entries } = await session.suggestFromMealie(cells);
      if (session.idle) adoptData(snapshot);
      return { created, skipped, entries };
    } catch (err) {
      if (isSessionExpired(err)) return null;
      setSaveError(t('mealie.suggest.failed'));
      void fetchData();
      return null;
    }
  }, [session, adoptData, fetchData, t]);

  /**
   * Settings-only PUT — does not round-trip savedMeals/plan/groceryChecked.
   *
   * The API preserves omitted fields, so this can't accidentally clobber a
   * concurrent meal write from another surface (the editor modal, Settings →
   * Meals, etc.). Use this whenever you're only changing the shared `MealSettings`.
   */
  const saveSettingsOnly = useCallback(async (next: MealSettings): Promise<boolean> => {
    try {
      const res = await editorFetch('/api/meals/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: next }),
      });
      if (!res.ok) {
        setSaveError('Failed to save settings. Please try again.');
        return false;
      }
      return true;
    } catch (err) {
      if (isSessionExpired(err)) return false;
      setSaveError('Network error. Please try again.');
      return false;
    }
  }, []);

  const groceryRef = useRef(groceryChecked);
  groceryRef.current = groceryChecked;
  /**
   * Tick or untick one item on the list of `week` (that week's key). Sent
   * through the session's queue like any save, so a reload or an older tick's
   * answer can never put back what this one changed.
   */
  const toggleGroceryItem = useCallback(async (week: string, itemName: string) => {
    // What this tap means, from what this phone shows (see groceryTapDirection).
    const direction = groceryTapDirection(groceryRef.current, week, itemName);
    setGroceryChecked((prev) => setGroceryCheck(prev, week, itemName, direction));
    try {
      const saved = await session.tick(week, itemName, direction);
      if (session.idle) adoptData(saved);
    } catch (err) {
      if (isSessionExpired(err)) return;
      setGroceryChecked((prev) => setGroceryCheck(prev, week, itemName, direction === 'check' ? 'uncheck' : 'check'));
      setSaveError(t('mealsTab.saveFailed'));
    }
  }, [session, adoptData, t]);

  return {
    savedMeals,
    setSavedMeals,
    plan,
    setPlan,
    groceryChecked,
    setGroceryChecked,
    settings,
    setSettings,
    globalTimeFormat,
    loading,
    loadError,
    saving,
    setSaving,
    saveError,
    setSaveError,
    saveData,
    saveSettingsOnly,
    toggleGroceryItem,
    fetchData,
    reloadFresh,
    source,
    mealie,
    mealieConnected,
    showMealieRange,
    rangeLoading,
    rangeFailed,
    suggestFromMealie,
  };
}
