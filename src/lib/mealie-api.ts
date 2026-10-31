import { NextResponse } from 'next/server';
import { MealieError, type MealieFailure } from './mealie';
import { MealieMapError } from './mealie-map';

/**
 * How the `/api/mealie/*` routes answer when Mealie is the problem. The
 * phone and the editor key their messages off `failure`, so the wording lives
 * with them, in the family's language; `error` is a plain English fallback.
 */
const FAILURE_STATUS: Record<MealieFailure, number> = {
  'not-set-up': 400,
  'bad-address': 400,
  'key-rejected': 400,
  'too-old': 400,
  'not-mealie': 502,
  unreachable: 502,
  upstream: 502,
};

const FAILURE_TEXT: Record<MealieFailure, string> = {
  'not-set-up': 'Mealie is not connected yet.',
  'bad-address': 'The Mealie address is not a web address.',
  'key-rejected': 'Mealie did not accept the key.',
  'too-old': 'This Mealie is too old. Update it to 2.0 or newer.',
  'not-mealie': 'Something answered at that address, but it is not Mealie.',
  unreachable: "We couldn't reach Mealie.",
  upstream: 'Mealie had a problem with that.',
};

export function mealieFailureResponse(failure: MealieFailure, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: FAILURE_TEXT[failure], failure, ...extra }, { status: FAILURE_STATUS[failure] });
}

/** The answer for an error thrown while talking to Mealie; anything else is rethrown for the route's own handler. */
export function mealieErrorResponse(err: unknown): NextResponse {
  if (err instanceof MealieError) return mealieFailureResponse(err.failure);
  if (err instanceof MealieMapError) return NextResponse.json({ error: err.message }, { status: 400 });
  throw err;
}
