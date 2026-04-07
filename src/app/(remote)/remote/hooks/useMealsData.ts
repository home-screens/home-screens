'use client';

import { useState, useCallback } from 'react';
import type { SavedMeal, PlannedMeal, MealSettings } from '@/types/config';
import { DEFAULT_MEAL_SETTINGS, normalizeMealSettings } from '@/lib/meal-constants';

export function useMealsData() {
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [plan, setPlan] = useState<PlannedMeal[]>([]);
  const [groceryChecked, setGroceryChecked] = useState<string[]>([]);
  const [settings, setSettings] = useState<MealSettings>({ ...DEFAULT_MEAL_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/meals/data');
      if (!res.ok) return;
      const data = await res.json();
      setSavedMeals(Array.isArray(data.savedMeals) ? data.savedMeals : []);
      setPlan(Array.isArray(data.plan) ? data.plan : []);
      setGroceryChecked(Array.isArray(data.groceryChecked) ? data.groceryChecked : []);
      // Defensive client-side normalization — protects against partial/stale API
      // responses (e.g. an old server returning only some fields, or a proxy
      // dropping the settings block) that would otherwise crash subsequent renders.
      setSettings(normalizeMealSettings(data.settings));
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  const saveData = useCallback(async (
    meals: SavedMeal[],
    planData: PlannedMeal[],
    grocery?: string[],
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/meals/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          savedMeals: meals,
          plan: planData,
          ...(grocery !== undefined ? { groceryChecked: grocery } : {}),
          force: meals.length === 0 && planData.length === 0,
        }),
      });
      if (!res.ok) {
        setSaveError('Failed to save. Please try again.');
        return false;
      }
      return true;
    } catch {
      setSaveError('Network error. Please try again.');
      return false;
    }
  }, []);

  /**
   * Settings-only PUT — does not round-trip savedMeals/plan/groceryChecked.
   *
   * The API preserves omitted fields, so this can't accidentally clobber a
   * concurrent meal write from another surface (the editor modal, Settings →
   * Meals, etc.). Use this whenever you're only changing the shared `MealSettings`.
   */
  const saveSettingsOnly = useCallback(async (next: MealSettings): Promise<boolean> => {
    try {
      const res = await fetch('/api/meals/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: next }),
      });
      if (!res.ok) {
        setSaveError('Failed to save settings. Please try again.');
        return false;
      }
      return true;
    } catch {
      setSaveError('Network error. Please try again.');
      return false;
    }
  }, []);

  const toggleGroceryItem = useCallback(async (itemName: string) => {
    const lower = itemName.toLowerCase();
    // Optimistic update
    setGroceryChecked((prev) => {
      const idx = prev.indexOf(lower);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev, lower];
    });
    try {
      const res = await fetch('/api/meals/grocery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: lower }),
      });
      if (res.ok) {
        const data = await res.json();
        setGroceryChecked(data.groceryChecked ?? []);
      }
    } catch {
      /* silent */
    }
  }, []);

  return {
    savedMeals,
    setSavedMeals,
    plan,
    setPlan,
    groceryChecked,
    setGroceryChecked,
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
  };
}
