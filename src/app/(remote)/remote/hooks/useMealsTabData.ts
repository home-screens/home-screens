'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { MealSettings, SavedMeal } from '@/types/config';
import { groceryWeekKey } from '@/lib/grocery-checks';
import { canEditMergedPlan, mealieStatus, rangeCovers } from '@/lib/meal-sources';
import { isMealieMeal } from '@/lib/meal-dish-rules';
import { useMealsData } from './useMealsData';
import { useMealsWeekNav } from './useMealsWeekNav';
import { useMealsPlanActions } from './useMealsPlanActions';
import { useMealsLibrary } from './useMealsLibrary';
import { useMealsGrocery } from './useMealsGrocery';
import type { MealPickTarget, MealSlotRef, MealsConfirmAction } from '../components/meals-shared';

const MEALS_POLL_MS = 15_000;

/**
 * Whether the viewed week can be drawn: `ready`, or, in Mealie mode for a
 * week beyond the ones every answer carries, `loading` while the hub asks
 * Mealie for it and `failed` when the hub did not answer.
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
 */
export function useMealsTabData() {
  const {
    savedMeals,
    setSavedMeals,
    plan,
    setPlan,
    groceryChecked,
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
  // A plain message at the bottom of the tab that is not an error ("every
  // meal this week is already planned"); it goes away on its own.
  const [notice, setNotice] = useState<{ message: string; undo?: () => void } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback((message: string, undo?: () => void) => {
    setNotice({ message, undo });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    // Long enough to reach Undo.
    noticeTimer.current = setTimeout(() => setNotice(null), undo ? 12_000 : 4_000);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  // Mealie recipes picked from a search. The plan a save hands back carries
  // every recipe it uses, but until it answers the new dish is only an id;
  // keeping the picked recipe here lets the row show its name and photo at
  // once instead of an empty slot.
  const [pickedMeals, setPickedMeals] = useState<ReadonlyMap<string, SavedMeal>>(() => new Map());
  const meals = useMemo(() => {
    if (pickedMeals.size === 0) return savedMeals;
    const known = new Set(savedMeals.map((m) => m.id));
    const extra = [...pickedMeals.values()].filter((m) => !known.has(m.id));
    return extra.length > 0 ? [...savedMeals, ...extra] : savedMeals;
  }, [savedMeals, pickedMeals]);

  const weekNav = useMealsWeekNav(settings);

  // Load once, again whenever the phone comes back to this page or back
  // onto the network, and every so often while it is open. A tab left open
  // on Sunday's plan would otherwise keep an hours-old copy, a grocery item
  // ticked on another phone would never show, and a load that failed during
  // a Wi-Fi blip would leave the tab empty for good.
  useEffect(() => {
    fetchData();
    const whenVisible = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    document.addEventListener('visibilitychange', whenVisible);
    window.addEventListener('online', fetchData);
    const poll = setInterval(whenVisible, MEALS_POLL_MS);
    return () => {
      document.removeEventListener('visibilitychange', whenVisible);
      window.removeEventListener('online', fetchData);
      clearInterval(poll);
    };
  }, [fetchData]);

  // Where the plan comes from and whether it can be changed right now: the
  // same two rules the editor and the wall use.
  const merged = useMemo(() => ({ plan, savedMeals, source, mealie }), [plan, savedMeals, source, mealie]);
  const status = useMemo(() => mealieStatus(merged), [merged]);
  const canEdit = canEditMergedPlan(merged);

  // Paging past the weeks every answer carries: ask Mealie for that week.
  const weekStart = weekNav.weekDates[0].date;
  const weekEnd = weekNav.weekDates[6].date;
  const weekOutsideCopy = source === 'mealie' && !!mealie && !rangeCovers(mealie.range, { start: weekStart, end: weekEnd });
  useEffect(() => {
    if (!weekOutsideCopy) return;
    void showMealieRange({ start: weekStart, end: weekEnd });
  }, [weekOutsideCopy, weekStart, weekEnd, showMealieRange]);
  const weekState: MealsWeekState = !weekOutsideCopy ? 'ready' : rangeFailed && !rangeLoading ? 'failed' : 'loading';
  const retryWeek = useCallback(() => {
    if (weekOutsideCopy) void showMealieRange({ start: weekStart, end: weekEnd });
    else void fetchData();
  }, [weekOutsideCopy, weekStart, weekEnd, showMealieRange, fetchData]);

  const planActions = useMealsPlanActions({
    savedMeals: meals,
    plan,
    setPlan,
    saveData,
    settings,
    weekDates: weekNav.weekDates,
    viewingWeekStart: weekNav.viewingWeekStart,
    setConfirmAction,
    savesToMealie: source === 'mealie',
    suggestFromMealie,
    showNotice,
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

  const { assignMealToSlot, setSlotText, addCourse, changeCourse } = planActions;

  /** A dish chosen in the picker: the main dish, a new course, or a swap. */
  const pickMeal = useCallback((target: MealPickTarget, meal: SavedMeal) => {
    if (isMealieMeal(meal)) {
      setPickedMeals((prev) => (prev.get(meal.id) === meal ? prev : new Map(prev).set(meal.id, meal)));
    }
    setPicker(null);
    if (target.pick === 'main') void assignMealToSlot(target.date, target.slot, meal.id);
    else if (target.pick === 'add') void addCourse(target.date, target.slot, { kind: target.kind, mealId: meal.id });
    else void changeCourse(target.date, target.slot, target.index, { mealId: meal.id });
  }, [assignMealToSlot, addCourse, changeCourse]);

  /** Words typed in the picker instead of a recipe (a note, in Mealie). */
  const pickText = useCallback((target: MealPickTarget, text: string) => {
    const typed = text.trim();
    if (!typed) return;
    setPicker(null);
    if (target.pick === 'main') void setSlotText(target.date, target.slot, typed);
    else if (target.pick === 'add') void addCourse(target.date, target.slot, { kind: target.kind, customText: typed });
    else void changeCourse(target.date, target.slot, target.index, { customText: typed });
  }, [setSlotText, addCourse, changeCourse]);

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
    weekPlan: planActions.weekPlan,
    settings,
    globalTimeFormat,
    loading,
    loadError,
    retryLoad: fetchData,
    saving,
    saveError,
    setSaveError,
    notice,
    dismissNotice: () => setNotice(null),
    form: library.form,
    weekDates: weekNav.weekDates,
    todayISO: weekNav.todayISO,
    activeSlotType: weekNav.activeSlotType,
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
    toggleGroceryItem: toggleViewedGroceryItem,
    confirmAction,
    setConfirmAction,
    saveSettings,
  };
}
