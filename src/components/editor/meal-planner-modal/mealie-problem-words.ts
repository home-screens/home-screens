import type { MealieClientProblem } from '@/lib/meal-client';
import type { MealieProblem } from '@/lib/meal-sources';

const PROBLEM_WORDS: Record<MealieProblem, string> = {
  'not-connected': 'notConnected',
  token: 'tokenRefused',
  setup: 'setup',
  unreachable: 'unreachable',
};

/** How to fix what waiting will not, a key under `editor`. */
const FIX: Partial<Record<MealieProblem, string>> = {
  token: 'mealPlannerModal.mealie.tokenFix',
  setup: 'mealPlannerModal.mealie.setupFix',
};

/**
 * The editor's words for why Mealie gave no answer: the start of a key under
 * `editor`, finished with `Title` or `Body`. No reason reads as Mealie not
 * answering.
 */
export function mealieProblemKey(problem: MealieProblem | null | undefined): string {
  return `mealPlannerModal.mealie.${PROBLEM_WORDS[problem ?? 'unreachable']}`;
}

/**
 * The editor's words when Mealie did not answer one request (a recipe
 * search, a recipe's ingredients): the reason's own title when Mealie is not
 * connected, refuses the token or is not a Mealie Home Screens can use, with
 * how to fix the last two, since waiting will not; that Home Screens itself
 * did not answer when the request never reached it; otherwise `fallback`,
 * the request's own line, which a retry may cure. Keys under `editor`.
 */
export function mealieRequestFailedKeys(
  problem: MealieClientProblem | null | undefined,
  fallback: string,
): { title: string; fix: string | null } {
  if (problem === 'connection') return { title: 'mealPlannerModal.mealie.grocery.connectionTitle', fix: null };
  if (problem === 'not-connected' || problem === 'token' || problem === 'setup') {
    return { title: `${mealieProblemKey(problem)}Title`, fix: FIX[problem] ?? null };
  }
  return { title: fallback, fix: null };
}
