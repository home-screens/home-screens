'use client';

import { useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { SavedMeal, PlannedMeal } from '@/types/config';
import { normalizeTag } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import { useMealForm } from './useMealForm';
import type { MealsConfirmAction } from '../components/meals-shared';

interface MealsLibraryParams {
  savedMeals: SavedMeal[];
  setSavedMeals: Dispatch<SetStateAction<SavedMeal[]>>;
  plan: PlannedMeal[];
  setPlan: Dispatch<SetStateAction<PlannedMeal[]>>;
  saveData: (meals: SavedMeal[], planData: PlannedMeal[], grocery?: string[]) => Promise<boolean>;
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
  const [filterTag, setFilterTag] = useState<string>('all');

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

    const mealData = form.buildMealData();

    let newMeals: SavedMeal[];
    if (form.editingMeal === 'new') {
      newMeals = [...savedMeals, mealData];
    } else {
      newMeals = savedMeals.map((m) => (m.id === mealData.id ? mealData : m));
    }

    const ok = await saveData(newMeals, plan);
    setSaving(false);
    if (ok) {
      setSavedMeals(newMeals);
      form.setEditingMeal(null);
    }
  };

  const deleteMeal = () => {
    if (form.editingMeal === 'new' || form.editingMeal === null) return;
    const mealToDelete = form.editingMeal;
    setConfirmAction({
      title: t('mealsTab.confirm.deleteMeal.title', { name: mealToDelete.name }),
      description: t('mealsTab.confirm.deleteMeal.description'),
      confirmLabel: t('mealsTab.confirm.deleteMeal.confirmLabel'),
      onConfirm: async () => {
        const id = mealToDelete.id;
        const newMeals = savedMeals.filter((m) => m.id !== id);
        const newPlan = plan.filter((p) => p.mealId !== id);
        setSavedMeals(newMeals);
        setPlan(newPlan);
        form.setEditingMeal(null);
        setConfirmAction(null);
        await saveData(newMeals, newPlan);
      },
    });
  };

  const toggleFavorite = async (mealId: string) => {
    const newMeals = savedMeals.map((m) =>
      m.id === mealId ? { ...m, isFavorite: !m.isFavorite } : m,
    );
    setSavedMeals(newMeals);
    await saveData(newMeals, plan);
  };

  const filteredMeals = useMemo(() => {
    let result = savedMeals;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        m.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (filterTag === 'favorites') {
      result = result.filter((m) => m.isFavorite);
    } else if (filterTag !== 'all') {
      result = result.filter((m) => m.tags?.some((t) => normalizeTag(t) === filterTag));
    }
    return result;
  }, [savedMeals, searchQuery, filterTag]);

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
