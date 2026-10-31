import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { readMealData, updateMealData } from '@/lib/meal-data';
import { isMealieShoppingId, mealieShoppingListExists, readMealieShopping } from '@/lib/mealie-shopping';
import { mealieErrorResponse, mealieFailureResponse } from '@/lib/mealie-api';

export const dynamic = 'force-dynamic';

/**
 * The read as the Grocery tab takes it. A Mealie problem with no copy at all
 * is a refusal saying which, with the saved address so the tab can still offer
 * Open Mealie.
 */
async function shoppingResponse(listId: string | undefined): Promise<NextResponse> {
  const result = await readMealieShopping(listId);
  if (result.status === 'failed') return mealieFailureResponse(result.failure, result.baseUrl ? { baseUrl: result.baseUrl } : undefined);
  return NextResponse.json(result);
}

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
  return shoppingResponse(asked ?? (await readMealData()).mealieShoppingList);
}, 'Failed to read the Mealie shopping list');

/**
 * PUT /api/mealie/shopping `{ list }`: the list the family shops from, for
 * the phone, the editor and the voice answer alike. Answers like GET, with
 * that list.
 */
export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ list?: unknown }>(request, { maxBytes: 1024 });
  if (body instanceof NextResponse) return body;
  const { list } = body;
  if (!isMealieShoppingId(list)) {
    return NextResponse.json({ error: 'list must be a Mealie shopping list id' }, { status: 400 });
  }
  try {
    if (!(await mealieShoppingListExists(list))) {
      return NextResponse.json({ error: "Mealie doesn't have that list any more." }, { status: 404 });
    }
  } catch (err) {
    return mealieErrorResponse(err);
  }
  await updateMealData((current) => (current.mealieShoppingList === list ? current : { ...current, mealieShoppingList: list }));
  return shoppingResponse(list);
}, 'Failed to choose the Mealie shopping list');
