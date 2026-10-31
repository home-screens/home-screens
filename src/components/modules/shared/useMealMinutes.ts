'use client';

import { useCallback } from 'react';
import type { SavedMeal } from '@/types/config';
import { mealShownMinutes, splitMinutes } from '@/lib/meal-dish-rules';
import { useTranslate } from '@/i18n';

/**
 * A dish's time as the wall writes it ("2 hr 20 min", or "2h 20m" with
 * `short`), or null when it has none. Mealie recipes show their whole time
 * and the family's own meals their prep time, the same rule the phone and the
 * editor follow (`mealShownMinutes`).
 */
export function useMealMinutes(): (meal: SavedMeal | null | undefined, short?: boolean) => string | null {
  const t = useTranslate('modules');
  return useCallback((meal, short = false) => {
    const total = mealShownMinutes(meal)?.minutes;
    if (!total) return null;
    const { hours, minutes } = splitMinutes(total);
    const end = short ? 'Short' : '';
    if (hours === 0) return t(`meal-planner.time.minutes${end}`, { minutes });
    if (minutes === 0) return t(`meal-planner.time.hours${end}`, { hours });
    return t(`meal-planner.time.hoursMinutes${end}`, { hours, minutes });
  }, [t]);
}
