import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { addMealieShoppingItem, isMealieShoppingId, readMealieShopping } from '@/lib/mealie-shopping';
import { mealieShoppingResponse, withMealieErrors } from '@/lib/mealie-api';
import { tidyShoppingText } from '@/lib/shopping-list';

export const dynamic = 'force-dynamic';

/** Longer than anything typed into a shopping list box. */
const MAX_TEXT = 200;

/**
 * POST /api/mealie/shopping/items `{ list, text }`: put a typed item on one
 * of the household's Mealie lists ("Milk"), the way Mealie's own box does.
 * Answers like `GET /api/mealie/shopping` for that list, read fresh, so the
 * new item is in it, plus `added`: the new item's id, for Undo, or null when
 * Mealie merged the words into an item already on the list.
 */
export const POST = withAuth(withMealieErrors(async (request: NextRequest) => {
  const body = await parseJsonBody<{ list?: unknown; text?: unknown }>(request, { maxBytes: 4 * 1024 });
  if (body instanceof NextResponse) return body;
  const { list, text } = body;
  if (!isMealieShoppingId(list)) {
    return NextResponse.json({ error: 'list must be a Mealie shopping list id' }, { status: 400 });
  }
  const words = typeof text === 'string' ? tidyShoppingText(text) : '';
  if (!words || words.length > MAX_TEXT) {
    return NextResponse.json({ error: `text must be 1 to ${MAX_TEXT} characters` }, { status: 400 });
  }
  const added = await addMealieShoppingItem(list, words);
  return mealieShoppingResponse(await readMealieShopping(list, { fresh: true }), { added });
}), 'Failed to add to the Mealie shopping list');
