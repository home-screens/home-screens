import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { MealSlotType, PlannedMeal } from '@/types/config';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { readMealData } from '@/lib/meal-data';
import { normalizeMealCourses } from '@/lib/meal-courses';
import { buildMealieBlock, isPlanDate, saveMealieCells, type MealieCellChange } from '@/lib/mealie-plan';
import { mealieErrorResponse, mealieFailureResponse } from '@/lib/mealie-api';
import { mealsAnswer } from '@/lib/meal-answer';
import { fromISODate } from '@/lib/meal-constants';

export const dynamic = 'force-dynamic';

const SLOTS: ReadonlySet<string> = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
/** A week view saves at most one week's meals at once; a few weeks covers copy and shuffle with room to spare. */
const MAX_CELLS = 200;
/** The longest stretch a surface keeps in view: the shared weeks plus the furthest it paged. */
const MAX_RANGE_DAYS = 16 * 7;

function dayCount(start: string, end: string): number {
  return Math.round((fromISODate(end).getTime() - fromISODate(start).getTime()) / 86_400_000) + 1;
}

/**
 * GET /api/mealie/plan?start=YYYY-MM-DD&end=YYYY-MM-DD: Mealie's plan for
 * weeks outside the ones `GET /api/meals/data` already carries, for the phone
 * and the editor paging further ahead or back.
 */
export const GET = withAuth(async (request: NextRequest) => {
  const start = request.nextUrl.searchParams.get('start');
  const end = request.nextUrl.searchParams.get('end');
  if (!isPlanDate(start) || !isPlanDate(end) || end < start || dayCount(start, end) > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: 'start and end must be dates like 2026-11-01, at most sixteen weeks apart' }, { status: 400 });
  }
  const data = await readMealData();
  return NextResponse.json({ mealie: await buildMealieBlock({ start, end }, data.mealieExtras) });
}, 'Failed to read the Mealie plan');

function parseAfter(raw: unknown, date: string, slot: MealSlotType): PlannedMeal | null | 'invalid' {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object') return 'invalid';
  const r = raw as Record<string, unknown>;
  const after: PlannedMeal = { date, slot };
  if (typeof r.mealId === 'string' && r.mealId) after.mealId = r.mealId;
  else if (typeof r.customText === 'string' && r.customText.trim()) after.customText = r.customText.trim().slice(0, 200);
  if (typeof r.notes === 'string' && r.notes.trim()) after.notes = r.notes.trim().slice(0, 2000);
  if (typeof r.time === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(r.time)) after.time = r.time;
  if (typeof r.sourceId === 'string' && r.sourceId) after.sourceId = r.sourceId;
  const courses = normalizeMealCourses(r.courses, true);
  if (courses) after.courses = courses;
  return after;
}

/**
 * PUT /api/mealie/plan: write changed meals to Mealie.
 *
 * Body `{ cells: [{ date, slot, before, after }], range? }`: each meal as it should
 * read now (`after`, null to clear it) and the `sourceId`s it held in the copy
 * the edit was made on (`before`). Answers with the same shape as
 * `GET /api/meals/data`, Mealie's plan included, so the surface adopts it
 * without asking again. A meal somebody changed in Mealie meanwhile makes it
 * a 409 (`reason: 'revision'`, the same reason the local save uses) carrying
 * Mealie's current plan, nothing written.
 */
export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ cells?: unknown; range?: unknown }>(request, { maxBytes: 256 * 1024 });
  if (body instanceof NextResponse) return body;
  // The days the surface has in view, when it paged past the shared weeks;
  // the answer covers them so the save does not drop them from its copy.
  let range: { start: string; end: string } | undefined;
  if (body.range !== undefined) {
    const r = body.range as { start?: unknown; end?: unknown } | null;
    if (!r || !isPlanDate(r.start) || !isPlanDate(r.end) || r.end < r.start || dayCount(r.start, r.end) > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: 'range must be two dates at most sixteen weeks apart' }, { status: 400 });
    }
    range = { start: r.start, end: r.end };
  }
  if (!Array.isArray(body.cells) || body.cells.length === 0 || body.cells.length > MAX_CELLS) {
    return NextResponse.json({ error: `cells must list between 1 and ${MAX_CELLS} meals` }, { status: 400 });
  }
  const changes: MealieCellChange[] = [];
  const seen = new Set<string>();
  for (const raw of body.cells) {
    const c = raw as Record<string, unknown> | null;
    if (!c || !isPlanDate(c.date) || typeof c.slot !== 'string' || !SLOTS.has(c.slot)) {
      return NextResponse.json({ error: 'each meal needs a date like 2026-11-01 and a slot' }, { status: 400 });
    }
    const key = `${c.date}|${c.slot}`;
    if (seen.has(key)) return NextResponse.json({ error: 'a meal is listed twice' }, { status: 400 });
    seen.add(key);
    if (!Array.isArray(c.before) || c.before.length > 40 || !c.before.every((s) => typeof s === 'string')) {
      return NextResponse.json({ error: 'before must list what the meal held' }, { status: 400 });
    }
    const after = parseAfter(c.after, c.date, c.slot as MealSlotType);
    if (after === 'invalid') return NextResponse.json({ error: 'after must be a meal or null' }, { status: 400 });
    changes.push({ date: c.date, slot: c.slot as MealSlotType, before: c.before as string[], after });
  }

  const stored = await readMealData();
  if (stored.settings.planSource !== 'mealie') {
    return NextResponse.json({ error: 'The meal plan lives in Home Screens now. Reopen the meal planner and try again.' }, { status: 409 });
  }

  let result;
  try {
    result = await saveMealieCells(changes);
  } catch (err) {
    return mealieErrorResponse(err);
  }
  const answer = await mealsAnswer(await readMealData(), range);
  if (result.ok) return NextResponse.json(answer);
  if (result.reason === 'conflict') {
    return NextResponse.json(
      { error: 'Somebody changed these meals in Mealie. Your change was not saved; try it again.', reason: 'revision', ...answer },
      { status: 409 },
    );
  }
  if (result.reason === 'partial') {
    return mealieFailureResponse(result.failure, { reason: 'partial', error: 'Mealie only took part of that change.', ...answer });
  }
  return mealieFailureResponse(result.failure);
}, 'Failed to save the Mealie plan');
