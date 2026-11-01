import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { MealSettings, MealSlotType } from '@/types/config';
import { isValidISODate } from './api-utils';
import { MealieError, type MealieFailure } from './mealie';
import { MealieMapError } from './mealie-map';
import { MealieShoppingGoneError, type MealieShoppingResult } from './mealie-shopping';
import { fromISODate, SLOT_ORDER } from './meal-constants';

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

/**
 * The answer for an error thrown while talking to Mealie; anything else is
 * rethrown for the route's own handler. A list or item gone from Mealie is
 * `reason: 'gone'`, which the surfaces take as "read the list again" rather
 * than as Mealie being down.
 */
export function mealieErrorResponse(err: unknown): NextResponse {
  if (err instanceof MealieError) return mealieFailureResponse(err.failure);
  if (err instanceof MealieShoppingGoneError) return NextResponse.json({ error: err.message, reason: 'gone' }, { status: 404 });
  if (err instanceof MealieMapError) return NextResponse.json({ error: err.message }, { status: 400 });
  throw err;
}

/** A route handler whose Mealie errors answer through `mealieErrorResponse`. Goes inside `withAuth` / `withDisplayAuth`. */
export function withMealieErrors<C>(handler: (request: NextRequest, context: C) => Promise<Response>) {
  return async (request: NextRequest, context: C): Promise<Response> => {
    try {
      return await handler(request, context);
    } catch (err) {
      return mealieErrorResponse(err);
    }
  };
}

/**
 * A shopping list read as the Grocery tab takes it, with `extra` beside it. A
 * Mealie problem with no copy at all is a refusal saying which, with the
 * saved address so the tab can still offer Open Mealie.
 */
export function mealieShoppingResponse(result: MealieShoppingResult, extra?: Record<string, unknown>): NextResponse {
  if (result.status === 'failed') return mealieFailureResponse(result.failure, result.baseUrl ? { baseUrl: result.baseUrl } : undefined);
  return NextResponse.json({ ...result, ...extra });
}

// ── What the plan routes take ──

/** The longest stretch a surface keeps in view: the shared weeks plus the furthest it paged. */
const MAX_RANGE_DAYS = 16 * 7;

function isPlanDate(date: unknown): date is string {
  return typeof date === 'string' && isValidISODate(date);
}

function dayCount(start: string, end: string): number {
  return Math.round((fromISODate(end).getTime() - fromISODate(start).getTime()) / 86_400_000) + 1;
}

/**
 * `{ start, end }` as two days at most sixteen weeks apart, for every route
 * that reads or answers with Mealie's plan: a longer range would have the hub
 * ask Mealie for years of plan and keep it.
 */
export function parsePlanRange(raw: unknown): { start: string; end: string } | NextResponse {
  const r = raw && typeof raw === 'object' ? raw as { start?: unknown; end?: unknown } : null;
  if (!r || !isPlanDate(r.start) || !isPlanDate(r.end) || r.end < r.start || dayCount(r.start, r.end) > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: 'start and end must be dates like 2026-11-01, at most sixteen weeks apart' }, { status: 400 });
  }
  return { start: r.start, end: r.end };
}

const SLOTS: ReadonlySet<string> = new Set(SLOT_ORDER);

/** One meal a plan route was asked about, with the rest of what was sent for it. */
export interface PlanCell {
  date: string;
  slot: MealSlotType;
  raw: Record<string, unknown>;
}

/** Between 1 and `max` meals, each a day and a meal slot, none listed twice. */
export function parsePlanCells(raw: unknown, max: number): PlanCell[] | NextResponse {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > max) {
    return NextResponse.json({ error: `cells must list between 1 and ${max} meals` }, { status: 400 });
  }
  const cells: PlanCell[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const c = item && typeof item === 'object' ? item as Record<string, unknown> : null;
    if (!c || !isPlanDate(c.date) || typeof c.slot !== 'string' || !SLOTS.has(c.slot)) {
      return NextResponse.json({ error: 'each meal needs a date like 2026-11-01 and a slot' }, { status: 400 });
    }
    const key = `${c.date}|${c.slot}`;
    if (seen.has(key)) return NextResponse.json({ error: 'a meal is listed twice' }, { status: 400 });
    seen.add(key);
    cells.push({ date: c.date, slot: c.slot as MealSlotType, raw: c });
  }
  return cells;
}

/**
 * The refusal for a write to Mealie's plan once the family has moved the plan
 * back to Home Screens, or null while it lives in Mealie.
 */
export function mealiePlanMovedResponse(settings: Pick<MealSettings, 'planSource'>): NextResponse | null {
  if (settings.planSource === 'mealie') return null;
  return NextResponse.json({ error: 'The meal plan lives in Home Screens now. Reopen the meal planner and try again.' }, { status: 409 });
}
