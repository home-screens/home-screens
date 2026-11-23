import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { MealCourseKind, MealSlotType, PlannedMeal } from '@/types/config';
import { withDisplayAuth, parseJsonBody, isValidISODate } from '@/lib/api-utils';
import { hasEditorSession } from '@/lib/auth';
import { readConfig } from '@/lib/config';
import { requireGrownUp } from '@/lib/grown-up-gate';
import { householdToday } from '@/lib/household-day';
import { readMealData, updateMealData, type MealData } from '@/lib/meal-data';
import { mealsAnswer } from '@/lib/meal-answer';
import { COURSE_KINDS } from '@/lib/meal-courses';
import { applyWallPlanChange, undoWallPlanChange, wallCanPlanMeal, wallMayPlanMeals, wallPlanDayOpen, type WallPlanChange, type WallPlanOutcome } from '@/lib/meal-plan-wall';
import { planCellChanges } from '@/lib/meal-sources';
import { mealieFailureResponse, withMealieErrors } from '@/lib/mealie-api';
import { parseMealieMealId } from '@/lib/mealie-map';
import { buildDefaultMealieBlock, saveMealieCells } from '@/lib/mealie-plan';
import { asObject } from '@/lib/todo-api';
import { forgetWallPlanUndo, noteWallPlanChange, wallPlanUndo } from '@/lib/wall-plan-undo';

export const dynamic = 'force-dynamic';

const ACTIONS: readonly WallPlanChange['action'][] = ['put', 'swap', 'both', 'off'];
const SLOTS: readonly MealSlotType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MAX_MEAL_ID_LENGTH = 200;

type Refusal = 'taken' | 'changed' | 'full' | 'moved';

function entryAt(plan: readonly PlannedMeal[], date: string, slot: MealSlotType): PlannedMeal | null {
  return plan.find((p) => p.date === date && p.slot === slot) ?? null;
}

/** The plan as it reads now, wherever it lives, or the refusal to answer with while Mealie is not answering. */
async function readPlan(data: MealData): Promise<PlannedMeal[] | NextResponse> {
  if (data.settings.planSource !== 'mealie') return data.plan;
  const block = await buildDefaultMealieBlock(data.settings, data.mealieExtras);
  // A copy that may be out of date is no ground for a change.
  if (block.status !== 'ok') return mealieFailureResponse(block.failure ?? 'upstream');
  return block.plan;
}

/**
 * Write one meal's change where the plan lives. `edit` is given the plan as
 * it reads at that moment and answers the plan after the change, or the
 * reason it cannot be made. In Home Screens the edit runs inside the store's
 * write queue, so nothing lands between its read and its write; in Mealie
 * the save itself refuses a meal that moved since the read (`changed`).
 */
async function changePlan(
  data: MealData,
  edit: (plan: PlannedMeal[]) => { plan: PlannedMeal[] } | { refusal: Refusal },
): Promise<{ before: PlannedMeal[]; after: PlannedMeal[] } | { refusal: Refusal } | NextResponse> {
  if (data.settings.planSource !== 'mealie') {
    let done: { before: PlannedMeal[]; after: PlannedMeal[] } | { refusal: Refusal } | null = null;
    await updateMealData((existing) => {
      const result = edit(existing.plan);
      if ('refusal' in result) {
        done = result;
        return existing;
      }
      done = { before: existing.plan, after: result.plan };
      return result.plan === existing.plan ? existing : { ...existing, plan: result.plan };
    });
    return done!;
  }
  const plan = await readPlan(data);
  if (plan instanceof NextResponse) return plan;
  const result = edit(plan);
  if ('refusal' in result) return result;
  const saved = await saveMealieCells(planCellChanges(plan, result.plan));
  if (saved.ok) return { before: plan, after: result.plan };
  if (saved.reason === 'conflict') return { refusal: 'changed' };
  return mealieFailureResponse(saved.failure, saved.reason === 'partial' ? { reason: 'partial' } : undefined);
}

/**
 * POST /api/meals/plan/wall: one change to the menu, made at a wall.
 *
 * `{ action, date, slot, mealId, kind, expect? }` puts a recipe on a meal
 * (`put`), answers the wall's question about a meal that already has a main
 * dish (`swap`, `both`, with `expect` naming the dish it asked about), or
 * takes the recipe off (`off`). `{ undo }` puts the meal back as it was,
 * quoting the ticket an earlier answer carried. The rules are
 * `meal-plan-wall.ts`: nothing is replaced that the wall did not name.
 *
 * Answers like `GET /api/meals/data`, read after the change, with `wall`
 * beside it: what happened (`outcome`), whether anything was written
 * (`changed`) and the Undo ticket. A change that cannot be made is a 409
 * with `reason` and the same answer, so the wall redraws the days as they
 * are.
 *
 * A wall changes the menu with the display token, held back to the least it
 * needs: only while some meal card has "Plan meals on the wall" on, only a
 * recipe, only today to the end of next week, only a meal the household
 * plans. The grown-up code is asked for when the household ticked "Changing
 * the menu". The whole plan (`PUT /api/meals/data`) stays with signed-in
 * people.
 */
export const POST = withDisplayAuth(withMealieErrors(async (request: NextRequest) => {
  const parsed = await parseJsonBody<unknown>(request, { maxBytes: 4 * 1024 });
  if (parsed instanceof NextResponse) return parsed;
  const body = asObject(parsed);
  if (body instanceof NextResponse) return body;

  if (!(await hasEditorSession(request)) && !wallMayPlanMeals(await readConfig())) {
    return NextResponse.json({ error: 'Planning meals from the wall is turned off', code: 'meals.wallPlanOff' }, { status: 403 });
  }
  const locked = await requireGrownUp(request, 'menu-change');
  if (locked) return locked;

  const data = await readMealData();
  const respond = async (wall: { outcome?: WallPlanOutcome; changed: boolean; undo?: string }, refusal?: Refusal) => {
    const answer = await mealsAnswer(await readMealData());
    if (refusal) return NextResponse.json({ error: 'The menu changed. Nothing was written.', reason: refusal, ...answer }, { status: 409 });
    return NextResponse.json({ ...answer, wall });
  };

  // ── Undo ──
  if (body.undo !== undefined) {
    const ticket = typeof body.undo === 'string' ? body.undo : '';
    const undo = ticket ? wallPlanUndo(ticket) : null;
    if (!undo) return respond({ changed: false }, 'moved');
    const result = await changePlan(data, (plan) => {
      const next = undoWallPlanChange(plan, undo.date, undo.slot, undo.before, undo.after);
      return next ? { plan: next } : { refusal: 'moved' };
    });
    if (result instanceof NextResponse) return result;
    forgetWallPlanUndo(ticket);
    if ('refusal' in result) return respond({ changed: false }, result.refusal);
    return respond({ changed: true });
  }

  // ── One change ──
  const { action, date, slot, mealId, kind, expect } = body;
  if (!ACTIONS.includes(action as WallPlanChange['action'])) {
    return NextResponse.json({ error: `action must be one of ${ACTIONS.join(', ')}` }, { status: 400 });
  }
  if (typeof date !== 'string' || !isValidISODate(date)) {
    return NextResponse.json({ error: 'date must be a date like 2026-09-27' }, { status: 400 });
  }
  if (!SLOTS.includes(slot as MealSlotType) || !data.settings.enabledSlots.includes(slot as MealSlotType)) {
    return NextResponse.json({ error: 'slot must be a meal the household plans' }, { status: 400 });
  }
  if (typeof mealId !== 'string' || !mealId || mealId.length > MAX_MEAL_ID_LENGTH) {
    return NextResponse.json({ error: 'mealId must name a recipe' }, { status: 400 });
  }
  if (!COURSE_KINDS.includes(kind as MealCourseKind)) {
    return NextResponse.json({ error: `kind must be one of ${COURSE_KINDS.join(', ')}` }, { status: 400 });
  }
  if (expect !== undefined && (typeof expect !== 'string' || expect.length > MAX_MEAL_ID_LENGTH + 2)) {
    return NextResponse.json({ error: 'expect must be the dish the wall asked about' }, { status: 400 });
  }
  if (!wallPlanDayOpen(date, await householdToday(), data.settings.weekStartDay)) {
    return NextResponse.json({ error: 'The wall plans today to the end of next week', code: 'meals.wallPlanDay' }, { status: 400 });
  }
  const inMealie = data.settings.planSource === 'mealie';
  // Taking a recipe off needs no recipe behind it: one deleted since is still on the menu.
  const known = inMealie
    ? parseMealieMealId(mealId) !== null
    : action === 'off' || wallCanPlanMeal(data.savedMeals.find((m) => m.id === mealId), false);
  if (!known) {
    return NextResponse.json({ error: 'That recipe cannot go on this menu', code: 'meals.wallPlanRecipe' }, { status: 400 });
  }

  const change: WallPlanChange = {
    action: action as WallPlanChange['action'], date, slot: slot as MealSlotType, mealId, kind: kind as MealCourseKind,
    ...(typeof expect === 'string' ? { expect } : {}),
  };
  let outcome: WallPlanOutcome = 'planned';
  const result = await changePlan(data, (plan) => {
    const applied = applyWallPlanChange(plan, change);
    if (!applied.ok) return { refusal: applied.reason };
    outcome = applied.outcome;
    return { plan: applied.plan };
  });
  if (result instanceof NextResponse) return result;
  if ('refusal' in result) return respond({ changed: false }, result.refusal);
  if (result.after === result.before) return respond({ outcome, changed: false });
  const undo = noteWallPlanChange({
    date, slot: change.slot,
    before: entryAt(result.before, date, change.slot),
    after: entryAt(result.after, date, change.slot),
  });
  return respond({ outcome, changed: true, undo });
}), 'Failed to change the menu');
