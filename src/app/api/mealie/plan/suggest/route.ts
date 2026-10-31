import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { MealSlotType } from '@/types/config';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { readMealData } from '@/lib/meal-data';
import { isPlanDate, suggestMealieMeals } from '@/lib/mealie-plan';
import { mealieFailureResponse } from '@/lib/mealie-api';
import { mealsAnswer } from '@/lib/meal-answer';

export const dynamic = 'force-dynamic';

const SLOTS: ReadonlySet<string> = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
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
  if (!Array.isArray(body.cells) || body.cells.length === 0 || body.cells.length > MAX_CELLS) {
    return NextResponse.json({ error: `cells must list between 1 and ${MAX_CELLS} meals` }, { status: 400 });
  }
  const cells: { date: string; slot: MealSlotType }[] = [];
  for (const raw of body.cells) {
    const c = raw as { date?: unknown; slot?: unknown } | null;
    if (!c || !isPlanDate(c.date) || typeof c.slot !== 'string' || !SLOTS.has(c.slot)) {
      return NextResponse.json({ error: 'each meal needs a date like 2026-11-01 and a slot' }, { status: 400 });
    }
    cells.push({ date: c.date, slot: c.slot as MealSlotType });
  }
  let range: { start: string; end: string } | undefined;
  if (body.range !== undefined) {
    const r = body.range as { start?: unknown; end?: unknown } | null;
    if (!r || !isPlanDate(r.start) || !isPlanDate(r.end) || r.end < r.start) {
      return NextResponse.json({ error: 'range must be two dates' }, { status: 400 });
    }
    range = { start: r.start, end: r.end };
  }

  const stored = await readMealData();
  if (stored.settings.planSource !== 'mealie') {
    return NextResponse.json({ error: 'The meal plan lives in Home Screens now. Reopen the meal planner and try again.' }, { status: 409 });
  }
  const result = await suggestMealieMeals(cells);
  if (!result.ok) return mealieFailureResponse(result.failure);
  return NextResponse.json({ ...(await mealsAnswer(await readMealData(), range)), suggested: { created: result.created, skipped: result.skipped, entries: result.entries } });
}, 'Failed to ask Mealie for suggestions');
