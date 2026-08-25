'use client';

import { useMemo } from 'react';
import { useFetchData } from '@/hooks/useFetchData';
import { choresDataUrl, choresUrl, mealsDataUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { normalizeMealSettings } from '@/lib/meal-constants';
import { buildExtrasIndex, EMPTY_EXTRAS, type ExtrasIndex } from '@/lib/calendar-extras';
import type { ChoreCompletion, ChoreDefinition, ChoreMember, PlannedMeal, SavedMeal } from '@/types/config';

interface MealsResponse { savedMeals?: SavedMeal[]; plan?: PlannedMeal[]; settings?: unknown }
interface ChoreDataResponse { members?: ChoreMember[]; chores?: ChoreDefinition[] }
interface CompletionsResponse { completions?: ChoreCompletion[] }

/**
 * Meals and chores for the week list's household rows. Reads the same
 * endpoints (and TTLs) the meal planner and chore chart modules use, so the
 * calendar can never disagree with them about tonight's dinner or how many
 * chores are done. Each feed is only fetched while its toggle is on: an
 * empty URL makes `useFetchData` a no-op, so a calendar with both off costs
 * nothing extra.
 */
export function useCalendarExtras(
  enabled: { meals: boolean; chores: boolean },
  dates: readonly string[],
): ExtrasIndex {
  const mealsTtl = FETCH_KEY_REGISTRY['fullscreen-meal-planner']?.ttlMs ?? 60_000;
  // The chore chart's own 5s TTL is tap-feedback cadence; the calendar only
  // shows an aggregate done/total row, so it polls at the clock's pace.
  const choresTtl = 60_000;
  const [meals] = useFetchData<MealsResponse>(enabled.meals ? mealsDataUrl() : '', mealsTtl);
  const [choreData] = useFetchData<ChoreDataResponse>(enabled.chores ? choresDataUrl() : '', 60_000);
  const [completions] = useFetchData<CompletionsResponse>(enabled.chores ? choresUrl() : '', choresTtl);

  // The date list is rebuilt by the caller each render; key on its content
  // so a 60s clock tick with the same week does not rebuild the index. The
  // fetch payloads are keyed by content too: each poll mints new object
  // identities even when nothing changed, and a fresh ExtrasIndex would
  // re-render the whole memoized week list for identical data.
  const datesKey = dates.join(',');
  const contentKey = JSON.stringify([meals, choreData, completions]);
  return useMemo(() => {
    if (!enabled.meals && !enabled.chores) return EMPTY_EXTRAS;
    const dateList = datesKey ? datesKey.split(',') : [];
    return buildExtrasIndex({
      dates: dateList,
      meals: enabled.meals && meals
        ? { plan: meals.plan ?? [], savedMeals: meals.savedMeals ?? [], settings: normalizeMealSettings(meals.settings) }
        : null,
      chores: enabled.chores && choreData
        ? { members: choreData.members ?? [], chores: choreData.chores ?? [], completions: completions?.completions ?? [] }
        : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- meals/choreData/completions are represented by contentKey
  }, [enabled.meals, enabled.chores, contentKey, datesKey]);
}
