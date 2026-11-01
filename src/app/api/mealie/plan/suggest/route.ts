import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { readMealData } from '@/lib/meal-data';
import { suggestMealieMeals } from '@/lib/mealie-plan';
import { mealieFailureResponse, mealiePlanMovedResponse, parsePlanCells, parsePlanRange } from '@/lib/mealie-api';
import { mealsAnswer } from '@/lib/meal-answer';

export const dynamic = 'force-dynamic';

/** A week of four meals. */
const MAX_CELLS = 28;

/**
 * POST /api/mealie/plan/suggest: fill the empty meals among `cells` with
 * Mealie's own picks, which follow the household's meal plan rules there.
 * Body `{ cells: [{ date, slot }], range? }`. Meals already planned are left
 * alone. Answers like `GET /api/meals/data`, plus `suggested: { created,
 * skipped }` (skipped: no recipe fit Mealie's rules for that meal).
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ cells?: unknown; range?: unknown }>(request, { maxBytes: 16 * 1024 });
  if (body instanceof NextResponse) return body;
  const cells = parsePlanCells(body.cells, MAX_CELLS);
  if (cells instanceof NextResponse) return cells;
  const range = body.range === undefined ? undefined : parsePlanRange(body.range);
  if (range instanceof NextResponse) return range;

  const moved = mealiePlanMovedResponse((await readMealData()).settings);
  if (moved) return moved;
  const result = await suggestMealieMeals(cells.map(({ date, slot }) => ({ date, slot })));
  if (!result.ok) return mealieFailureResponse(result.failure);
  return NextResponse.json({ ...(await mealsAnswer(await readMealData(), range)), suggested: { created: result.created, skipped: result.skipped, entries: result.entries } });
}, 'Failed to ask Mealie for suggestions');
