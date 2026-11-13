'use client';

import { useState } from 'react';
import { useFetchData } from '@/hooks/useFetchData';
import { displayCache } from '@/lib/display-cache';
import { displayFetch } from '@/lib/display-fetch';
import { MEAL_RATINGS_URL, MEAL_RATINGS_POLL_MS } from '@/lib/meal-ratings';
import type { MealRatingsAnswer } from '@/types/meal-ratings';

export function useFamilyMealRatings() {
  const [raw, loadError] = useFetchData<MealRatingsAnswer>(MEAL_RATINGS_URL, MEAL_RATINGS_POLL_MS);
  const data = raw && Array.isArray(raw.ratings) && Array.isArray(raw.members) ? raw : null;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  async function save(mealId: string, memberId: string, rating: number | null) {
    if (saving) return;
    setSaving(true);
    setSaveError(false);
    setSaved(false);
    try {
      const response = await displayFetch(MEAL_RATINGS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mealId, memberId, rating }) });
      if (!response.ok) throw new Error('Rating was not saved');
      const answer: MealRatingsAnswer = await response.json();
      if (!Array.isArray(answer.ratings) || !Array.isArray(answer.members)) throw new Error('Invalid ratings answer');
      // Refetch instead of publishing a response that may predate another member's completed save.
      displayCache.invalidate(MEAL_RATINGS_URL);
      setSaved(true);
    } catch {
      setSaveError(true);
    } finally { setSaving(false); }
  }
  return { data, loadError, saving, saveError, saved, save, retry: () => displayCache.invalidate(MEAL_RATINGS_URL) };
}
