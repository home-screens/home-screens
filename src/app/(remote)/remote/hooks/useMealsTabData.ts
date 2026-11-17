'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { MealSettings, SavedMeal } from '@/types/config';
import { groceryWeekKey } from '@/lib/grocery-checks';
import { canEditMergedPlan, mealieRangeWanted, mealieStatus, mealieWeekHeld } from '@/lib/meal-sources';
import { currentMealSlot } from '@/lib/meal-constants';
import type { MealPickTarget } from '@/lib/meal-courses';
import { usePickedMeals } from '@/components/meals/usePickedMeals';
import { useMealsData } from './useMealsData';
import { useMealsWeekNav } from './useMealsWeekNav';
import { useMealsPlanActions } from './useMealsPlanActions';
import { useMealsLibrary } from './useMealsLibrary';
import { useMealsGrocery } from './useMealsGrocery';
import type { MealSlotRef, MealsConfirmAction } from '../components/meals-shared';

/**
 * Whether the viewed week can be drawn: `ready`, or, in Mealie mode for a
 * week beyond the ones every answer carries, `loading` while the hub asks
 * Mealie for it and `failed` when the hub did not answer or Mealie is not
 * answering.
 */
export type MealsWeekState = 'ready' | 'loading' | 'failed';

/**
 * Everything the Meals tab renders, wired together from focused hooks:
 * `useMealsData` (fetch/save), `useMealsWeekNav` (which week + wall clock),
 * `useMealsPlanActions` (plan and course edits), `useMealsLibrary` (saved
 * meals + form), and `useMealsGrocery` (derived list). This hook owns the
 * state those pieces share (the meal sheet, the recipe picker, the confirm
 * dialog), where the plan comes from, and the settings write, which is the
 * one save that bypasses the meal/plan round trip.
 *
 * `keptWeek` is the week the address kept across a reload (`readMealsPlace`).
 */
export function useMealsTabData(keptWeek: string | null = null) {
  const {
    savedMeals,
    setSavedMeals,
    plan,
    setPlan,
    groceryChecked,
    familyRatings,
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
  } = useMealsData();

  const [picker, setPicker] = useState<MealPickTarget | null>(null);
  const [sheet, setSheet] = useState<MealSlotRef | null>(null);
  const [confirmAction, setConfirmAction] = useState<MealsConfirmAction | null>(null);
  // A plain message over the tab that is not an error ("every meal this
  // week is already planned"); it goes away on its own. `undo` puts back
  // what was just done, under the button's own words when `undoLabel` gives
  // them ("Take it down" for a recipe sent to the wall), else "Undo".
  const [notice, setNotice] = useState<{ message: string; undo?: () => void; undoLabel?: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback((message: string, undo?: () => void, undoLabel?: string) => {
    setNotice({ message, undo, undoLabel });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    // Long enough to reach Undo.
    noticeTimer.current = setTimeout(() => setNotice(null), undo ? 12_000 : 4_000);
  }, []);
  const dismissNotice = useCallback(() => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(null);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  // Mealie recipes picked from a search. The plan a save hands back carries
  // every recipe it uses, but until it answers the new dish is only an id;
  // keeping the picked recipe here lets the row show its name and photo at
  // once instead of an empty slot. A dish a change took off the plan is kept
  // too, so an Undo draws it at once.
  const picked = usePickedMeals(savedMeals);
  const { meals, keep: keepMeals } = picked;

  const weekNav = useMealsWeekNav(settings, keptWeek, !loading && !loadError);
  // Today's meal being served now, by its serving time: the same rule the
  // wall's Today, Week and Next meal views use, so the phone's NOW agrees.
  const activeSlotType = useMemo(
    () => currentMealSlot(weekNav.todayISO, weekNav.nowMinutes, settings.enabledSlots, plan, meals, settings.defaultSlotTimes),
    [weekNav.todayISO, weekNav.nowMinutes, settings.enabledSlots, settings.defaultSlotTimes, plan, meals],
  );

  // Where the plan comes from and whether it can be changed right now: the
  // same two rules the editor and the wall use.
  const merged = useMemo(() => ({ plan, savedMeals, source, mealie }), [plan, savedMeals, source, mealie]);
  const status = useMemo(() => mealieStatus(merged), [merged]);
  const canEdit = canEditMergedPlan(merged);

  // Paging past the weeks every answer carries: ask Mealie for the week and
  // the one before it, by the rule the editor uses too.
  const shownWeek = { start: weekNav.weekDates[0].date, end: weekNav.weekDates[6].date };
  const weekHeld = mealieWeekHeld(merged, shownWeek);
  const wanted = mealieRangeWanted(merged, shownWeek);
  const wantedStart = wanted?.start;
  const wantedEnd = wanted?.end;
  useEffect(() => {
    if (wantedStart && wantedEnd) void showMealieRange({ start: wantedStart, end: wantedEnd });
  }, [wantedStart, wantedEnd, showMealieRange]);
  // A week the copy does not hold is on its way, or missing: the hub did not
  // answer for it, or Mealie is not answering, when nothing is asked.
  const weekState: MealsWeekState = weekHeld ? 'ready' : !wanted || (rangeFailed && !rangeLoading) ? 'failed' : 'loading';
  const retryWeek = useCallback(() => {
    // While Mealie is not answering, ask the hub again; the week follows
    // once Mealie is back.
    if (!weekHeld && wantedStart && wantedEnd) void showMealieRange({ start: wantedStart, end: wantedEnd });
    else void fetchData();
  }, [weekHeld, wantedStart, wantedEnd, showMealieRange, fetchData]);

  const planActions = useMealsPlanActions({
    savedMeals: meals,
    plan,
    setPlan,
    saveData,
    settings,
    weekDates: weekNav.weekDates,
    todayISO: weekNav.todayISO,
    setConfirmAction,
    savesToMealie: source === 'mealie',
    suggestFromMealie,
    showNotice,
    keepEntry: picked.keepEntry,
  });

  const library = useMealsLibrary({
    savedMeals,
    setSavedMeals,
    plan,
    setPlan,
    saveData,
    saving,
    setSaving,
    setSaveError,
    setConfirmAction,
    showNotice,
    todayISO: weekNav.todayISO,
  });

  // Ticks belong to the list they were made on: the viewed week's.
  const groceryWeek = groceryWeekKey(weekNav.weekDates[0].date, settings.weekStartDay);
  const grocery = useMealsGrocery({
    weekPlan: planActions.weekPlan,
    savedMeals,
    groceryChecked,
    week: groceryWeek,
  });
  const toggleViewedGroceryItem = useCallback(
    (itemName: string) => toggleGroceryItem(groceryWeek, itemName),
    [toggleGroceryItem, groceryWeek],
  );

  const { applyPick } = planActions;

  /** A dish chosen in the picker: the main dish, a new course, or a swap. */
  const pickMeal = useCallback((target: MealPickTarget, meal: SavedMeal) => {
    keepMeals([meal]);
    setPicker(null);
    void applyPick(target, { mealId: meal.id }, meal.name);
  }, [keepMeals, applyPick]);

  /** Words typed in the picker instead of a recipe (a note, in Mealie). */
  const pickText = useCallback((target: MealPickTarget, text: string) => {
    const typed = text.trim();
    if (!typed) return;
    setPicker(null);
    void applyPick(target, { customText: typed }, typed);
  }, [applyPick]);

  const saveSettings = useCallback(async (next: MealSettings): Promise<boolean> => {
    const prev = settings;
    setSettings(next); // optimistic update
    // Settings-only PUT — does not round-trip meals/plan, so it can't clobber
    // a concurrent meal write from the editor or another /remote tab.
    const ok = await saveSettingsOnly(next);
    if (!ok) {
      // Server rejected the write — revert local state so the UI matches
      // what's actually on disk. The useMealsData hook will have set
      // `saveError` which the toast already renders.
      setSettings(prev);
    } else if (next.planSource !== prev.planSource) {
      // The plan now lives in the other app: show that app's plan, not this
      // one under the new heading. The sheet and picker were open on a meal
      // of the old plan.
      setSheet(null);
      setPicker(null);
      void reloadFresh();
    } else if (next.weekStartDay !== prev.weekStartDay) {
      // The hub moved every week's grocery ticks to the new weeks; fetch them
      // rather than show the realigned week unticked until the next poll.
      fetchData();
    }
    return ok;
  }, [settings, saveSettingsOnly, setSettings, fetchData, reloadFresh]);

  return {
    savedMeals,
    meals,
    familyRatings,
    nowMinutes: weekNav.nowMinutes,
    weekPlan: planActions.weekPlan,
    week: planActions.week,
    settings,
    globalTimeFormat,
    loading,
    loadError,
    retryLoad: fetchData,
    saving,
    saveError,
    setSaveError,
    notice,
    showNotice,
    dismissNotice,
    form: library.form,
    weekDates: weekNav.weekDates,
    todayISO: weekNav.todayISO,
    activeSlotType,
    isCurrentWeek: weekNav.isCurrentWeek,
    navigateWeek: weekNav.navigateWeek,
    jumpToToday: weekNav.jumpToToday,
    source,
    status,
    canEdit,
    mealieConnected,
    weekState,
    retryWeek,
    getMealForSlot: planActions.getMealForSlot,
    setSlotTime: planActions.setSlotTime,
    clearMeal: planActions.clearMeal,
    removeCourse: planActions.removeCourse,
    moveCourse: planActions.moveCourse,
    clearAllPlan: planActions.clearAllPlan,
    suggestRandom: planActions.suggestRandom,
    copyLastWeek: planActions.copyLastWeek,
    hasPreviousWeekEntries: planActions.hasPreviousWeekEntries,
    picker,
    setPicker,
    pickMeal,
    pickText,
    sheet,
    setSheet,
    searchQuery: library.searchQuery,
    setSearchQuery: library.setSearchQuery,
    filterTag: library.filterTag,
    setFilterTag: library.setFilterTag,
    filteredMeals: library.filteredMeals,
    openNewMealForm: library.openNewMealForm,
    openEditMealForm: library.openEditMealForm,
    saveMealForm: library.saveMealForm,
    deleteMeal: library.deleteMeal,
    toggleFavorite: library.toggleFavorite,
    groceryList: grocery.groceryList,
    groceryStats: grocery.groceryStats,
    groceryWithoutIngredients: grocery.withoutIngredients,
    toggleGroceryItem: toggleViewedGroceryItem,
    confirmAction,
    setConfirmAction,
    saveSettings,
  };
}
