import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { hasEditorSession, requireSession } from '@/lib/auth';
import { forgetWallAdded, wallMayUndo } from '@/lib/wall-added';
import { readMealData } from '@/lib/meal-data';
import {
  deleteMealieShoppingItem,
  isMealieShoppingId,
  MealieShoppingGoneError,
  readMealieShopping,
  setMealieShoppingItemChecked,
} from '@/lib/mealie-shopping';
import { mealieFailureResponse, withMealieErrors } from '@/lib/mealie-api';
import { asObject } from '@/lib/todo-api';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ itemId: string }> };

/**
 * PATCH /api/mealie/shopping/items/[itemId] `{ checked }`: tick an item on a
 * Mealie list, or put it back. One-way: `changed` is false when the item was
 * already that way.
 *
 * The phone ticks with a session, on any of the household's lists. The
 * display token gets in too, the same as ticking a to-do on the wall, held to
 * what a grocery card shows: the tick and nothing else, and only on the list
 * the family shops from. An item on another list answers as one that is gone.
 */
export const PATCH = withDisplayAuth(withMealieErrors(async (request: NextRequest, ctx: RouteContext) => {
  const { itemId } = await ctx.params;
  if (!isMealieShoppingId(itemId)) {
    return NextResponse.json({ error: 'Not a Mealie shopping list item' }, { status: 400 });
  }
  const body = await parseJsonBody<unknown>(request, { maxBytes: 1024 });
  if (body instanceof NextResponse) return body;
  const fields = asObject(body);
  if (fields instanceof NextResponse) return fields;
  const { checked } = fields;
  if (typeof checked !== 'boolean') {
    return NextResponse.json({ error: 'checked must be true or false' }, { status: 400 });
  }
  let onList: string | undefined;
  if (!(await hasEditorSession(request))) {
    const meals = await readMealData();
    const family = await readMealieShopping(meals.mealieShoppingList);
    if (family.status === 'failed') return mealieFailureResponse(family.failure);
    if (!family.list) throw new MealieShoppingGoneError();
    onList = family.list.id;
  }
  return NextResponse.json({ changed: await setMealieShoppingItemChecked(itemId, checked, { onList }) });
}), 'Failed to tick the Mealie shopping list item');

/**
 * DELETE /api/mealie/shopping/items/[itemId]: take an item off its Mealie
 * list, for Undo right after adding it. Already gone answers 200 too.
 *
 * The display token gets in only for the wall's Undo: an item the hub added
 * for a wall in the last few minutes (`wall-added.ts`). Anything else needs
 * the phone's session; the wall can tick, not remove.
 */
export const DELETE = withDisplayAuth(withMealieErrors(async (request: NextRequest, ctx: RouteContext) => {
  const { itemId } = await ctx.params;
  if (!isMealieShoppingId(itemId)) {
    return NextResponse.json({ error: 'Not a Mealie shopping list item' }, { status: 400 });
  }
  const fromWall = !(await hasEditorSession(request));
  if (fromWall && !wallMayUndo(itemId)) await requireSession(request);
  await deleteMealieShoppingItem(itemId);
  if (fromWall) forgetWallAdded(itemId);
  return NextResponse.json({ ok: true });
}), 'Failed to take the item off the Mealie shopping list');
