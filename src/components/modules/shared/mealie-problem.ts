import type { MealieProblem } from '@/lib/meal-sources';

const WORDS = {
  'not-connected': 'mealieNotConnected',
  token: 'mealieTokenRefused',
  setup: 'mealieSetup',
  unreachable: 'mealieUnreachable',
} as const satisfies Record<MealieProblem, string>;

const TITLES = {
  mealieNotConnected: 'mealie.notConnected.title',
  mealieTokenRefused: 'mealie.tokenRefused.title',
  mealieSetup: 'mealie.setup.title',
  mealieUnreachable: 'mealie.unreachable.title',
} as const satisfies Record<(typeof WORDS)[MealieProblem], string>;

/**
 * The wall's word for a meal plan in Mealie with no copy to show: not
 * connected, token refused, not a Mealie Home Screens can use, or Mealie not
 * answering. Its title is `mealieTitleKey`; its hint is the `meal-planner.*`
 * key made of the word plus `Hint`.
 */
export function mealieWords(problem: MealieProblem): (typeof WORDS)[MealieProblem] {
  return WORDS[problem];
}

/** The title for one of those words: a key under `core`, the sentence the phone and the editor say too. */
export function mealieTitleKey(word: (typeof WORDS)[MealieProblem]): (typeof TITLES)[(typeof WORDS)[MealieProblem]] {
  return TITLES[word];
}
