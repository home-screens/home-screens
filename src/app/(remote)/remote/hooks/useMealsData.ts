'use client';

import { useState, useCallback } from 'react';
import type { SavedMeal, PlannedMeal } from '@/types/config';

export function useMealsData() {
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [plan, setPlan] = useState<PlannedMeal[]>([]);
  const [groceryChecked, setGroceryChecked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/meals/data');
      if (!res.ok) return;
      const data = await res.json();
      setSavedMeals(data.savedMeals ?? []);
      setPlan(data.plan ?? []);
      setGroceryChecked(data.groceryChecked ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  const saveData = useCallback(async (meals: SavedMeal[], planData: PlannedMeal[], grocery?: string[]): Promise<boolean> => {
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
    loading,
    saving,
    setSaving,
    saveError,
    setSaveError,
    saveData,
    toggleGroceryItem,
    fetchData,
  };
}
