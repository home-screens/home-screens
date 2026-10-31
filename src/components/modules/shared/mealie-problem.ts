import type { MealieFailure } from '@/lib/mealie';
import { mealieProblem } from '@/lib/meal-sources';

/**
 * The wall's message (a `meal-planner.*` key, its hint under the same key
 * plus `Hint`) for a meal plan in Mealie with no copy to show: not connected,
 * token refused, or Mealie not answering.
 */
export function mealieWords(failure: MealieFailure | undefined): 'mealieNotConnected' | 'mealieTokenRefused' | 'mealieUnreachable' {
  const problem = mealieProblem(failure);
  return problem === 'not-connected' ? 'mealieNotConnected' : problem === 'token' ? 'mealieTokenRefused' : 'mealieUnreachable';
}
