import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readMealData, updateMealData } from '@/lib/meal-data';
import { withDisplayAuth, parseJsonBody, isValidISODate } from '@/lib/api-utils';
import { householdToday } from '@/lib/household-day';
import {
  groceryChecksForWeek,
  groceryWeekKey,
  pruneGroceryChecked,
  setGroceryCheck,
} from '@/lib/grocery-checks';
import { MealieShoppingGoneError, readMealieShopping, setMealieShoppingItemChecked } from '@/lib/mealie-shopping';
import { mealieErrorResponse, mealieFailureResponse } from '@/lib/mealie-api';
import { shoppingTicksForName } from '@/lib/shopping-list';

export const dynamic = 'force-dynamic';

const WEEK_ERROR = 'week must be a date like 2026-09-27 when provided';

/** GET /api/meals/grocery: one week's grocery checked state.
 *  `?week=` is any date in the week; omitted, it is the household's current
 *  week, the same one `/api/meals/grocery/list` resolves. */
export const GET = withDisplayAuth(async (req: NextRequest) => {
  const week = req.nextUrl.searchParams.get('week');
  if (week !== null && !isValidISODate(week)) {
    return NextResponse.json({ error: WEEK_ERROR }, { status: 400 });
  }
  const [data, day] = await Promise.all([readMealData(), week ?? householdToday()]);
  const key = groceryWeekKey(day, data.settings.weekStartDay);
  return NextResponse.json({ week: key, groceryChecked: groceryChecksForWeek(data.groceryChecked, key) });
}, 'Failed to read grocery data');

/** POST /api/meals/grocery — toggle a grocery item checked state.
 *  Display-token auth (not session-only) so LAN callers like Home Assistant
 *  voice commands can check items off — a low-risk flip, matching the
 *  sibling chore toggle endpoint's posture.
 *
 *  `item` is normalized to trimmed lowercase — the checked store has always
 *  held lowercase names (every existing client lowercases before posting),
 *  so normalizing here lets callers send the display-cased name instead.
 *
 *  `week` (optional, any date in the week) names the list the tick belongs
 *  to. A tick on next week's list must never show on this week's. Omitted,
 *  it is the household's current week, which is what a voice "check off
 *  milk" means.
 *
 *  `direction` ('check' | 'uncheck', optional) makes the call idempotent:
 *  omitted it stays the historical flip; set, the call only ever moves the
 *  item in that direction and no-ops when it's already there — so a
 *  repeated voice "check off milk" can never silently un-check it. The
 *  response's `changed` reports whether this call actually flipped anything.
 *
 *  While the plan lives in Mealie the tick goes to the Mealie list the family
 *  shops from, on every item of that name ("salt" from two recipes is two
 *  items; "eggs" and "egg" both find "4 eggs"), and `week` is not used: a
 *  Mealie list has no weeks. `matched` says how many items carry the name,
 *  so a caller can tell "not on the list" (0) from "already done". */
export const POST = withDisplayAuth(async (req: NextRequest) => {
  const body = await parseJsonBody<{ item?: unknown; direction?: unknown; week?: unknown }>(req);
  if (body instanceof NextResponse) return body;
  const { item, direction, week } = body;

  if (typeof item !== 'string' || !item.trim()) {
    return NextResponse.json(
      { error: 'item must be a non-empty string' },
      { status: 400 },
    );
  }
  if (direction !== undefined && direction !== 'check' && direction !== 'uncheck') {
    return NextResponse.json(
      { error: 'direction must be "check" or "uncheck" when provided' },
      { status: 400 },
    );
  }
  if (week !== undefined && (typeof week !== 'string' || !isValidISODate(week))) {
    return NextResponse.json({ error: WEEK_ERROR }, { status: 400 });
  }
  const stored = await readMealData();
  if (stored.settings.planSource === 'mealie') {
    // Fresh: a tick made in Mealie's app in the last few seconds counts.
    const result = await readMealieShopping(stored.mealieShoppingList, { fresh: true });
    if (result.status !== 'ok') return mealieFailureResponse(result.failure ?? 'unreachable');
    if (!result.list) return NextResponse.json({ changed: false, matched: 0, source: 'mealie' });
    const { ids, checked, matched } = shoppingTicksForName(result.list, item, direction);
    let changed = false;
    for (const id of ids) {
      try {
        changed = (await setMealieShoppingItemChecked(id, checked)) || changed;
      } catch (err) {
        // Cleared in Mealie a moment ago: nothing left to tick.
        if (err instanceof MealieShoppingGoneError) continue;
        return mealieErrorResponse(err);
      }
    }
    return NextResponse.json({ changed, matched, source: 'mealie' });
  }
  const day = typeof week === 'string' ? week : await householdToday();

  // Read and write inside one `updateMealData` cycle. Reading with
  // `readMealData` and writing back with `writeMealData` left a window between
  // the two transactions, so two phones tapping the same list could each build
  // a list from the same snapshot and the second write would drop the first
  // toggle. Returning `current` unchanged is the store's no-op signal, so an
  // idempotent call still skips the disk write.
  let changed = false;
  let key = '';
  const data = await updateMealData((current) => {
    key = groceryWeekKey(day, current.settings.weekStartDay);
    // Weeks the plan has forgotten go first, so the file never outgrows the
    // plan; the tick is applied after, so the week it lands on is kept.
    const kept = pruneGroceryChecked(current.groceryChecked, current.plan, current.settings.weekStartDay);
    const next = setGroceryCheck(kept, key, item, direction);
    changed = next !== kept; // recomputed if the mutator is ever re-run
    return next === current.groceryChecked ? current : { ...current, groceryChecked: next };
  });

  return NextResponse.json({ week: key, groceryChecked: groceryChecksForWeek(data.groceryChecked, key), changed });
}, 'Failed to toggle grocery item');
