'use client';

import { useEffect, useState } from 'react';
import type { MealCourseKind } from '@/types/config';
import { fetchMealieCategories, type MealFetch, type MealieCategory } from '@/lib/meal-client';
import { matchCourseCategory } from '@/lib/meal-dish-rules';
import { getMealCourseLabelKey } from '@/lib/meal-courses';
import { useTranslate } from '@/i18n';

/**
 * The household's Mealie category a course picker should open on ("Add a
 * side" opens on the Side category), or null when there is none or the
 * picker is not for a course. Shared by the phone's and the editor's pickers.
 */
export function useMealieCourseCategory(fetcher: MealFetch, kind: MealCourseKind | null): { category: MealieCategory | null; ready: boolean } {
  const tModules = useTranslate('modules');
  const tCore = useTranslate('core');
  const [state, setState] = useState<{ kind: MealCourseKind | null; category: MealieCategory | null } | null>(null);
  const localWords = kind ? [tModules(getMealCourseLabelKey(kind)), tCore(`meal.kind.${kind}`)] : [];
  const wordsKey = localWords.join('|');
  useEffect(() => {
    if (!kind) return;
    const controller = new AbortController();
    fetchMealieCategories(fetcher, controller.signal).then(
      (categories) => setState({ kind, category: matchCourseCategory(categories, kind, wordsKey.split('|')) }),
      () => { if (!controller.signal.aborted) setState({ kind, category: null }); },
    );
    return () => controller.abort();
  }, [fetcher, kind, wordsKey]);
  if (!kind) return { category: null, ready: true };
  return state?.kind === kind ? { category: state.category, ready: true } : { category: null, ready: false };
}
