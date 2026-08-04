'use client';

import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { SavedMeal, PlannedMeal, MealSlotType, MealSettings } from '@/types/config';
import { generateRandomPlan } from '@/lib/meal-shuffle';
import {
  filterPlanToWeek,
  replaceWeekInPlan,
  copyWeekEntries,
} from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import { getWeekDates, type MealsConfirmAction } from '../components/meals-shared';

interface MealsPlanActionsParams {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  setPlan: Dispatch<SetStateAction<PlannedMeal[]>>;
  saveData: (meals: SavedMeal[], planData: PlannedMeal[], grocery?: string[]) => Promise<boolean>;
  settings: MealSettings;
  /** The viewed week, from `useMealsWeekNav` */
  weekDates: ReturnType<typeof getWeekDates>;
  /** Origin of the viewed week — needed to address the *previous* week */
  viewingWeekStart: Date;
  setPickingSlot: Dispatch<SetStateAction<{ date: string; slot: MealSlotType } | null>>;
  setConfirmAction: Dispatch<SetStateAction<MealsConfirmAction | null>>;
}

/**
 * Reads and writes of the meal plan for the currently-viewed week: slot
 * assignment, clearing, per-slot times, and the bulk actions (clear week,
 * shuffle, copy last week). Every write is optimistic — local state first,
 * then the PUT.
 */
export function useMealsPlanActions({
  savedMeals,
  plan,
  setPlan,
  saveData,
  settings,
  weekDates,
  viewingWeekStart,
  setPickingSlot,
  setConfirmAction,
}: MealsPlanActionsParams) {
  const t = useTranslate('remote');

  // Filter plan to viewed week
  const weekPlan = useMemo(
    () => filterPlanToWeek(plan, weekDates[0].date, weekDates[6].date),
    [plan, weekDates],
  );

  const getMealForSlot = useCallback((date: string, slot: MealSlotType): { planned: PlannedMeal | undefined; meal: SavedMeal | undefined } => {
    const planned = weekPlan.find((p) => p.date === date && p.slot === slot);
    const meal = planned?.mealId ? savedMeals.find((m) => m.id === planned.mealId) : undefined;
    return { planned, meal };
  }, [weekPlan, savedMeals]);

  const assignMealToSlot = useCallback(async (date: string, slot: MealSlotType, mealId: string) => {
    const existing = plan.find((p) => p.date === date && p.slot === slot);
    const newPlan = plan.filter((p) => !(p.date === date && p.slot === slot));
    // Preserve existing per-instance fields (time, notes, customText) when swapping the meal
    newPlan.push({ ...(existing ?? {}), date, slot, mealId });
    setPlan(newPlan);
    setPickingSlot(null);
    await saveData(savedMeals, newPlan);
  }, [plan, savedMeals, saveData, setPlan, setPickingSlot]);

  const clearSlot = useCallback(async (date: string, slot: MealSlotType) => {
    const newPlan = plan.filter((p) => !(p.date === date && p.slot === slot));
    setPlan(newPlan);
    await saveData(savedMeals, newPlan);
  }, [plan, savedMeals, saveData, setPlan]);

  const setSlotTime = useCallback(async (date: string, slot: MealSlotType, time: string | undefined) => {
    const existing = plan.find((p) => p.date === date && p.slot === slot);
    if (!existing) return;
    const updated: PlannedMeal = { ...existing };
    if (time) {
      updated.time = time;
    } else {
      delete updated.time;
    }
    const newPlan = plan.map((p) => (p === existing ? updated : p));
    setPlan(newPlan);
    await saveData(savedMeals, newPlan);
  }, [plan, savedMeals, saveData, setPlan]);

  const clearAllPlan = useCallback(() => {
    setConfirmAction({
      title: t('mealsTab.confirm.clearWeek.title'),
      description: t('mealsTab.confirm.clearWeek.description'),
      confirmLabel: t('mealsTab.confirm.clearWeek.confirmLabel'),
      onConfirm: async () => {
        const weekSet = new Set(weekDates.map((d) => d.date));
        const remaining = plan.filter((p) => !weekSet.has(p.date));
        setPlan(remaining);
        await saveData(savedMeals, remaining);
        setConfirmAction(null);
      },
    });
  }, [savedMeals, plan, weekDates, saveData, setPlan, setConfirmAction, t]);

  const suggestRandom = useCallback(async () => {
    if (savedMeals.length === 0) return;
    const weekDateStrs = weekDates.map((d) => d.date);
    const newWeek = generateRandomPlan(savedMeals, settings.enabledSlots, weekDateStrs);
    const merged = replaceWeekInPlan(plan, weekDateStrs, newWeek);
    setPlan(merged);
    await saveData(savedMeals, merged);
  }, [savedMeals, plan, weekDates, settings.enabledSlots, saveData, setPlan]);

  const copyLastWeek = useCallback(async () => {
    const prevStart = new Date(viewingWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    // Pass the household's weekStartDay so the previous-week window aligns
    // correctly for Monday-start households. Without this, prevStart was rolled
    // back to a Sunday and the 7-day window was shifted by one day.
    const prevWeekDates = getWeekDates(prevStart, settings.weekStartDay).map((d) => d.date);
    const weekDateStrs = weekDates.map((d) => d.date);
    const restamped = copyWeekEntries(plan, prevWeekDates, weekDateStrs);
    if (restamped.length === 0) return;
    const merged = replaceWeekInPlan(plan, weekDateStrs, restamped);
    setPlan(merged);
    await saveData(savedMeals, merged);
  }, [plan, savedMeals, viewingWeekStart, weekDates, settings.weekStartDay, saveData, setPlan]);

  const hasPreviousWeekEntries = useMemo(() => {
    const prevStart = new Date(viewingWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    // Same fix as copyLastWeek — must honor weekStartDay or the previous-week
    // window is misaligned for Monday-start households.
    const prevWeekDates = getWeekDates(prevStart, settings.weekStartDay);
    return filterPlanToWeek(plan, prevWeekDates[0].date, prevWeekDates[6].date).length > 0;
  }, [plan, viewingWeekStart, settings.weekStartDay]);

  return {
    weekPlan,
    getMealForSlot,
    assignMealToSlot,
    clearSlot,
    setSlotTime,
    clearAllPlan,
    suggestRandom,
    copyLastWeek,
    hasPreviousWeekEntries,
  };
}
