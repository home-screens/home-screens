import type { MealSaveFailure } from '@/hooks/useMealPlannerData';

/**
 * The editor's words for a meal change that did not save (a key under
 * `editor`), for the planner window's toast and the line under Edit Meal Plan
 * in the module's panel alike. Mealie's reason leads: a refused token is
 * fixed in Settings > API keys, not by checking that Mealie is running.
 */
export function mealSaveFailedKey(failure: MealSaveFailure, onMealie: boolean): string {
  if (failure.problem === 'token') return 'mealPlannerModal.toast.mealieTokenSaveFailed';
  if (failure.problem === 'not-connected') return 'mealPlannerModal.toast.mealieNotConnectedSaveFailed';
  return onMealie || failure.problem ? 'mealPlannerModal.toast.mealieSaveFailed' : 'mealPlannerModal.toast.saveFailed';
}
