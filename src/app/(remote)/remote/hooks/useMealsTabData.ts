'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MealSlotType, MealSettings } from '@/types/config';
import { useMealsData } from './useMealsData';
import { useMealsWeekNav } from './useMealsWeekNav';
import { useMealsPlanActions } from './useMealsPlanActions';
import { useMealsLibrary } from './useMealsLibrary';
import { useMealsGrocery } from './useMealsGrocery';
import type { MealsConfirmAction } from '../components/meals-shared';

/**
 * Everything the Meals tab renders, wired together from focused hooks:
 * `useMealsData` (fetch/save), `useMealsWeekNav` (which week + wall clock),
 * `useMealsPlanActions` (plan CRUD), `useMealsLibrary` (saved meals + form),
 * and `useMealsGrocery` (derived list). This hook only owns the state those
 * pieces share — the slot picker and the confirm dialog — and the settings
 * write, which is the one save that bypasses the meal/plan round trip.
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
    loading,
    saving,
    setSaving,
    saveError,
    setSaveError,
    saveData,
    saveSettingsOnly,
    toggleGroceryItem,
    fetchData,
  } = useMealsData();

  const [pickingSlot, setPickingSlot] = useState<{ date: string; slot: MealSlotType } | null>(null);
  const [confirmAction, setConfirmAction] = useState<MealsConfirmAction | null>(null);

  const weekNav = useMealsWeekNav(settings);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const planActions = useMealsPlanActions({
    savedMeals,
    plan,
    setPlan,
    saveData,
    settings,
    weekDates: weekNav.weekDates,
    viewingWeekStart: weekNav.viewingWeekStart,
    setPickingSlot,
    setConfirmAction,
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

  const grocery = useMealsGrocery({
    weekPlan: planActions.weekPlan,
    savedMeals,
    groceryChecked,
  });

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
    }
    return ok;
  }, [settings, saveSettingsOnly, setSettings]);

  return {
    savedMeals,
    weekPlan: planActions.weekPlan,
    settings,
    loading,
    saving,
    saveError,
    setSaveError,
    form: library.form,
    weekDates: weekNav.weekDates,
    todayISO: weekNav.todayISO,
    currentHour: weekNav.currentHour,
    activeSlotType: weekNav.activeSlotType,
    isCurrentWeek: weekNav.isCurrentWeek,
    navigateWeek: weekNav.navigateWeek,
    jumpToToday: weekNav.jumpToToday,
    getMealForSlot: planActions.getMealForSlot,
    assignMealToSlot: planActions.assignMealToSlot,
    clearSlot: planActions.clearSlot,
    setSlotTime: planActions.setSlotTime,
    clearAllPlan: planActions.clearAllPlan,
    suggestRandom: planActions.suggestRandom,
    copyLastWeek: planActions.copyLastWeek,
    hasPreviousWeekEntries: planActions.hasPreviousWeekEntries,
    pickingSlot,
    setPickingSlot,
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
    toggleGroceryItem,
    confirmAction,
    setConfirmAction,
    saveSettings,
  };
}
