'use client';

import { useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { SavedMeal, PlannedMeal } from '@/types/config';
import type { LibraryFilter } from '@/lib/meal-constants';
import { filterLibraryMeals } from '@/lib/meal-dish-rules';
import {
  upsertSavedMeal,
  removeSavedMeal,
  toggleSavedMealFavorite,
} from '@/lib/meal-plan-actions';
import type { MealEdit } from '@/lib/meal-client';
import { useTranslate } from '@/i18n';
import { useMealForm } from './useMealForm';
import type { MealsConfirmAction } from '../components/meals-shared';

interface MealsLibraryParams {
  savedMeals: SavedMeal[];
  setSavedMeals: Dispatch<SetStateAction<SavedMeal[]>>;
  plan: PlannedMeal[];
  setPlan: Dispatch<SetStateAction<PlannedMeal[]>>;
  saveData: (edit: MealEdit) => Promise<boolean>;
  saving: boolean;
  setSaving: Dispatch<SetStateAction<boolean>>;
  setSaveError: Dispatch<SetStateAction<string | null>>;
  setConfirmAction: Dispatch<SetStateAction<MealsConfirmAction | null>>;
}

/**
 * The saved-meal library: search/tag filtering plus the add/edit/delete form
 * flow. Owns the form state (`useMealForm`) since nothing outside the library
 * view touches it.
 */
export function useMealsLibrary({
  savedMeals,
  setSavedMeals,
  plan,
  setPlan,
  saveData,
  saving,
  setSaving,
  setSaveError,
  setConfirmAction,
}: MealsLibraryParams) {
  const t = useTranslate('remote');

  const form = useMealForm();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState<LibraryFilter>('all');

  const openNewMealForm = () => {
    form.openNew(() => setSaveError(null));
  };

  const openEditMealForm = (meal: SavedMeal) => {
    form.openEdit(meal, () => setSaveError(null));
  };

  const saveMealForm = async () => {
    if (!form.formName.trim() || saving) return;
    setSaving(true);
    setSaveError(null);

    const meal = form.buildMealData();
    // Not optimistic: the form stays open until the hub has the meal, and
    // `saveData` adopts the saved library on success.
    const ok = await saveData((c) => ({ savedMeals: upsertSavedMeal(c.savedMeals, meal) }));
    setSaving(false);
    if (ok) form.setEditingMeal(null);
  };

  const deleteMeal = () => {
    if (form.editingMeal === 'new' || form.editingMeal === null) return;
    const mealToDelete = form.editingMeal;
    setConfirmAction({
      title: t('mealsTab.confirm.deleteMeal.title', { name: mealToDelete.name }),
      description: t('mealsTab.confirm.deleteMeal.description'),
      confirmLabel: t('mealsTab.confirm.deleteMeal.confirmLabel'),
      onConfirm: async () => {
        const next = removeSavedMeal(savedMeals, plan, mealToDelete.id);
        setSavedMeals(next.savedMeals);
        setPlan(next.plan);
        form.setEditingMeal(null);
        setConfirmAction(null);
        // Both halves: deleting a meal also prunes the plan entries for it.
        await saveData((c) => removeSavedMeal(c.savedMeals, c.plan, mealToDelete.id));
      },
    });
  };

  const toggleFavorite = async (mealId: string) => {
    setSavedMeals(toggleSavedMealFavorite(savedMeals, mealId));
    await saveData((c) => ({ savedMeals: toggleSavedMealFavorite(c.savedMeals, mealId) }));
  };

  const filteredMeals = useMemo(
    () => filterLibraryMeals(savedMeals, searchQuery, filterTag),
    [savedMeals, searchQuery, filterTag],
  );

  return {
    form,
    searchQuery,
    setSearchQuery,
    filterTag,
    setFilterTag,
    filteredMeals,
    openNewMealForm,
    openEditMealForm,
    saveMealForm,
    deleteMeal,
    toggleFavorite,
  };
}
