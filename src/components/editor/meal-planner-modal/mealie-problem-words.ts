import type { TranslateFn } from '@/i18n/types';
import type { MealieClientProblem } from '@/lib/meal-client';
import type { MealieProblem } from '@/lib/meal-sources';
import { mealiePlaces } from '@/components/meals/mealie-places';

const PROBLEM_WORDS: Record<MealieClientProblem, string> = {
  'not-connected': 'notConnected',
  token: 'tokenRefused',
  setup: 'setup',
  unreachable: 'unreachable',
  connection: 'connection',
};

/** How to fix what waiting will not, a key under `editor`. */
const FIX: Partial<Record<MealieProblem, string>> = {
  token: 'mealPlannerModal.mealie.tokenFix',
  setup: 'mealPlannerModal.mealie.setupFix',
};

/**
 * The title for why Mealie gave no answer: a key under `core`, the sentence
 * the phone and the wall say too. No reason reads as Mealie not answering.
 */
export function mealieProblemTitleKey(problem: MealieClientProblem | null | undefined): string {
  return `mealie.${PROBLEM_WORDS[problem ?? 'unreachable']}.title`;
}

/**
 * The line under that title. Mealie not answering is said in the words the
 * phone uses (`core`); the rest say where to fix it on the computer and are
 * the editor's own.
 */
export function mealieProblemBody(problem: MealieProblem | null | undefined, t: TranslateFn, tCore: TranslateFn): string {
  if (!problem || problem === 'unreachable') return tCore('mealie.unreachable.description');
  return t(`mealPlannerModal.mealie.${PROBLEM_WORDS[problem]}Body`, mealiePlaces(tCore));
}

/**
 * The editor's words when Mealie did not answer one request (a recipe
 * search, a recipe's ingredients): the reason's own title when Mealie is not
 * connected, refuses the token or is not a Mealie Home Screens can use, with
 * how to fix the last two, since waiting will not; that Home Screens itself
 * did not answer when the request never reached it; otherwise `fallback`,
 * the request's own line, which a retry may cure.
 */
export function mealieRequestFailedWords(
  problem: MealieClientProblem | null | undefined,
  fallback: string,
  t: TranslateFn,
  tCore: TranslateFn,
): { title: string; fix: string | null } {
  if (problem === 'connection') return { title: tCore(mealieProblemTitleKey(problem)), fix: null };
  if (problem === 'not-connected' || problem === 'token' || problem === 'setup') {
    const fix = FIX[problem];
    return { title: tCore(mealieProblemTitleKey(problem)), fix: fix ? t(fix, mealiePlaces(tCore)) : null };
  }
  return { title: fallback, fix: null };
}
