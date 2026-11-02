'use client';

import { useState, useCallback, useRef } from 'react';
import { useTranslate } from '@/i18n';
import type { SavedMeal, PlannedMeal, MealSettings, TimeFormat } from '@/types/config';
import { DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import { MealClientError, saveMealSettings, type MealEdit, type MealSnapshot } from '@/lib/meal-client';
import { HubUnreachableError } from '@/lib/hub-request';
import type { MealieWireBlock } from '@/lib/meal-sources';
import { groceryTapDirection, setGroceryCheck, type GroceryChecked } from '@/lib/grocery-checks';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { isRepeatTap, type LastTap } from '@/lib/sheet-tap-guard';
import { useMealSession } from '@/components/meals/useMealSession';
import { mealieSaveFailedWords } from '../components/MealsMealieStatus';

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
  // Loading again behind the loading line (see `reloadFresh`).
  const [reloading, setReloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Where the plan above came from. In Mealie mode `plan` and `savedMeals`
  // are Mealie's plan and the recipes it uses, and saves go to Mealie.
  const [source, setSource] = useState<MealSnapshot['source']>('local');
  const [mealie, setMealie] = useState<MealieWireBlock | null>(null);
  const [mealieConnected, setMealieConnected] = useState(false);

  const adoptData = useCallback((snapshot: MealSnapshot) => {
    setSavedMeals(snapshot.savedMeals);
    setPlan(snapshot.plan);
    setGroceryChecked(snapshot.groceryChecked);
    setSource(snapshot.source);
    setMealie(snapshot.mealie);
    setMealieConnected(snapshot.mealieConnected);
  }, []);

  // Loads and saves share one session with the editor's planner window
  // (`useMealSession`): it keeps the copy the hub last answered with, quotes
  // its revision on every save, re-applies an edit to the hub's newer copy
  // when somebody else saved first, asks the hub again after Mealie refused
  // something, and loads again every so often while the tab is open.
  const {
    session,
    loadState,
    load: fetchData,
    save,
    suggest: suggestFromMealie,
    showMealieRange,
    mealieWeeks,
  } = useMealSession({
    show: (snapshot, from) => {
      // Nothing loaded means nothing to edit: the tab shows its load error.
      if (!snapshot) return;
      adoptData(snapshot);
      if (from === 'load') {
        setSettings(snapshot.settings);
        setGlobalTimeFormat(snapshot.globalTimeFormat);
      }
    },
    refused: (err, what) => {
      // Why Mealie refused, when it was Mealie: a refused token is not fixed
      // by trying again. Suggest says Mealie having trouble its own way.
      const problem = err instanceof MealClientError ? err.problem : undefined;
      if (what === 'suggest') setSaveError(t((problem !== 'unreachable' && mealieSaveFailedWords(problem)) || 'mealie.suggest.failed'));
      else if (err instanceof HubUnreachableError) setSaveError(t('mealsTab.saveFailedConnection'));
      else setSaveError(t(mealieSaveFailedWords(problem) ?? 'mealsTab.saveFailed'));
    },
  }, { poll: true });

  /**
   * Load again behind the loading line: after the plan moved between Home
   * Screens and Mealie, the copy on screen is the other app's plan, and
   * showing it for a moment under the new heading would be wrong.
   */
  const reloadFresh = useCallback(async () => {
    setReloading(true);
    await fetchData();
    setReloading(false);
  }, [fetchData]);

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
  const saveData: (edit: MealEdit) => Promise<boolean> = save;

  /**
   * Save the shared `MealSettings` and nothing else, so a meal another surface
   * (the editor's window, Settings > Meals) saved meanwhile is kept.
   */
  const saveSettingsOnly = useCallback(async (next: MealSettings): Promise<boolean> => {
    try {
      await saveMealSettings(editorFetch, next);
      return true;
    } catch (err) {
      if (isSessionExpired(err)) return false;
      setSaveError(t(err instanceof HubUnreachableError ? 'mealsTab.saveFailedConnection' : 'mealsSettings.save.saveFailed'));
      return false;
    }
  }, [t]);

  const groceryRef = useRef(groceryChecked);
  groceryRef.current = groceryChecked;
  const lastTap = useRef<LastTap | null>(null);
  /**
   * Tick or untick one item on the list of `week` (that week's key). Sent
   * through the session's queue like any save, so a reload or an older tick's
   * answer can never put back what this one changed. A quick double tap on
   * one item is one tap.
   */
  const toggleGroceryItem = useCallback(async (week: string, itemName: string) => {
    const tap = { id: `${week}/${itemName}`, at: Date.now() };
    if (isRepeatTap(lastTap.current, tap.id, tap.at)) return;
    lastTap.current = tap;
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
    loading: loadState === 'loading' || reloading,
    // The meals have never loaded and the last try failed: said in so many
    // words, never shown as an empty week (which reads as "nothing planned").
    loadError: loadState === 'failed',
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
    // A week beyond the ones every answer carries is on its way from Mealie,
    // or the hub did not answer for it.
    rangeLoading: mealieWeeks === 'loading',
    rangeFailed: mealieWeeks === 'failed',
    suggestFromMealie,
  };
}
