'use client';

import { useCallback } from 'react';
import type { SavedMeal } from '@/types/config';
import { mealShownMinutes, splitMinutes } from '@/lib/meal-dish-rules';
import { useTranslate } from '@/i18n';

/**
 * A dish's time as the editor writes it ("2 hr 20 min", "45 min"), or null
 * when it has none. Mealie recipes show their whole time, the family's own
 * meals their prep time (see `mealShownMinutes`).
 */
export function useDishTime(): (meal: SavedMeal | null | undefined) => string | null {
  const t = useTranslate('editor');
  return useCallback((meal) => {
    const total = mealShownMinutes(meal)?.minutes;
    if (!total) return null;
    const { hours, minutes } = splitMinutes(total);
    if (hours === 0) return t('mealPlannerModal.time.minutes', { minutes });
    if (minutes === 0) return t('mealPlannerModal.time.hours', { hours });
    return t('mealPlannerModal.time.hoursMinutes', { hours, minutes });
  }, [t]);
}
