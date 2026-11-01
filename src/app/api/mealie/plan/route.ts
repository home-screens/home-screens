import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { MealSlotType, PlannedMeal } from '@/types/config';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { readMealData } from '@/lib/meal-data';
import { normalizeMealCourses, normalizeRecipeScale } from '@/lib/meal-courses';
import { buildMealieBlock, saveMealieCells, type MealieCellChange } from '@/lib/mealie-plan';
import { mealieFailureResponse, mealiePlanMovedResponse, parsePlanCells, parsePlanRange, withMealieErrors } from '@/lib/mealie-api';
import { mealsAnswer } from '@/lib/meal-answer';

export const dynamic = 'force-dynamic';

/** A week view saves at most one week's meals at once; a few weeks covers copy and shuffle with room to spare. */
const MAX_CELLS = 200;

/**
 * GET /api/mealie/plan?start=YYYY-MM-DD&end=YYYY-MM-DD: Mealie's plan for
 * weeks outside the ones `GET /api/meals/data` already carries, for the phone
 * and the editor paging further ahead or back.
 */
export const GET = withAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const range = parsePlanRange({ start: params.get('start'), end: params.get('end') });
  if (range instanceof NextResponse) return range;
  const data = await readMealData();
  return NextResponse.json({ mealie: await buildMealieBlock(range, data.mealieExtras) });
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
  const scale = after.mealId ? normalizeRecipeScale(r.scale) : undefined;
  if (scale) after.scale = scale;
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
export const PUT = withAuth(withMealieErrors(async (request: NextRequest) => {
  const body = await parseJsonBody<{ cells?: unknown; range?: unknown }>(request, { maxBytes: 256 * 1024 });
  if (body instanceof NextResponse) return body;
  // The days the surface has in view, when it paged past the shared weeks;
  // the answer covers them so the save does not drop them from its copy.
  const range = body.range === undefined ? undefined : parsePlanRange(body.range);
  if (range instanceof NextResponse) return range;
  const cells = parsePlanCells(body.cells, MAX_CELLS);
  if (cells instanceof NextResponse) return cells;
  const changes: MealieCellChange[] = [];
  for (const { date, slot, raw: c } of cells) {
    if (!Array.isArray(c.before) || c.before.length > 40 || !c.before.every((s) => typeof s === 'string')) {
      return NextResponse.json({ error: 'before must list what the meal held' }, { status: 400 });
    }
    const after = parseAfter(c.after, date, slot);
    if (after === 'invalid') return NextResponse.json({ error: 'after must be a meal or null' }, { status: 400 });
    changes.push({ date, slot, before: c.before as string[], after });
  }

  const moved = mealiePlanMovedResponse((await readMealData()).settings);
  if (moved) return moved;

  const result = await saveMealieCells(changes);
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
}), 'Failed to save the Mealie plan');
