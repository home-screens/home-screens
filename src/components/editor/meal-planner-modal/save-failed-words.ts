import type { MealSaveFailure } from '@/hooks/useMealPlannerData';
import type { TranslateFn } from '@/i18n/types';
import { mealiePlaces } from '@/components/meals/mealie-places';

/**
 * The editor's words for a meal change that did not save, for the planner
 * window's toast and the line under Edit meal plan in the module's panel
 * alike. Mealie's reason leads: a refused token or a Mealie Home Screens
 * cannot use is fixed in Settings > API keys or in Mealie, not by checking
 * that Mealie is running. `t` reads `editor`, `tCore` reads `core`.
 */
export function mealSaveFailedText(failure: MealSaveFailure, onMealie: boolean, t: TranslateFn, tCore: TranslateFn): string {
  return t(mealSaveFailedKey(failure, onMealie), mealiePlaces(tCore));
}

function mealSaveFailedKey(failure: MealSaveFailure, onMealie: boolean): string {
  if (failure.problem === 'token') return 'mealPlannerModal.toast.mealieTokenSaveFailed';
  if (failure.problem === 'setup') return 'mealPlannerModal.toast.mealieSetupSaveFailed';
  if (failure.problem === 'not-connected') return 'mealPlannerModal.toast.mealieNotConnectedSaveFailed';
  return onMealie || failure.problem ? 'mealPlannerModal.toast.mealieSaveFailed' : 'mealPlannerModal.toast.saveFailed';
}
