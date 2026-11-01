import type { MealieProblem } from '@/lib/meal-sources';

const WORDS = {
  'not-connected': 'mealieNotConnected',
  token: 'mealieTokenRefused',
  setup: 'mealieSetup',
  unreachable: 'mealieUnreachable',
} as const satisfies Record<MealieProblem, string>;

/**
 * The wall's message (a `meal-planner.*` key, its hint under the same key
 * plus `Hint`) for a meal plan in Mealie with no copy to show: not connected,
 * token refused, not a Mealie Home Screens can use, or Mealie not answering.
 */
export function mealieWords(problem: MealieProblem): (typeof WORDS)[MealieProblem] {
  return WORDS[problem];
}
