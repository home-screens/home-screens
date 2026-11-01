import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { readMealData, updateMealData } from '@/lib/meal-data';
import { isMealieShoppingId, readMealieShopping, requireMealieShoppingList } from '@/lib/mealie-shopping';
import { mealieShoppingResponse, withMealieErrors } from '@/lib/mealie-api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mealie/shopping?list=<id>: the household's Mealie shopping lists
 * (`lists`, each with how many items are still to get) and one of them in
 * full (`list`): the one asked for, else the one the family shops from, else
 * the one made first. `status` is `stale` with the last good copy while Mealie
 * is not answering. Display auth, so a wall can show the list too.
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const asked = request.nextUrl.searchParams.get('list');
  if (asked !== null && !isMealieShoppingId(asked)) {
    return NextResponse.json({ error: 'list must be a Mealie shopping list id' }, { status: 400 });
  }
  return mealieShoppingResponse(await readMealieShopping(asked ?? (await readMealData()).mealieShoppingList));
}, 'Failed to read the Mealie shopping list');

/**
 * PUT /api/mealie/shopping `{ list }`: the list the family shops from, for
 * the phone, the editor and the voice answer alike. Answers like GET, with
 * that list; a list Mealie no longer has is a 404 with `reason: 'gone'`, the
 * same as adding to it.
 */
export const PUT = withAuth(withMealieErrors(async (request: NextRequest) => {
  const body = await parseJsonBody<{ list?: unknown }>(request, { maxBytes: 1024 });
  if (body instanceof NextResponse) return body;
  const { list } = body;
  if (!isMealieShoppingId(list)) {
    return NextResponse.json({ error: 'list must be a Mealie shopping list id' }, { status: 400 });
  }
  await requireMealieShoppingList(list);
  await updateMealData((current) => (current.mealieShoppingList === list ? current : { ...current, mealieShoppingList: list }));
  return mealieShoppingResponse(await readMealieShopping(list));
}), 'Failed to choose the Mealie shopping list');
