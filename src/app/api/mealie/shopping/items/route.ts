import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { hasEditorSession, requireSession } from '@/lib/auth';
import { readConfig } from '@/lib/config';
import { readMealData } from '@/lib/meal-data';
import { addMealieShoppingItem, isMealieShoppingId, readMealieShopping } from '@/lib/mealie-shopping';
import { mealieShoppingResponse, withMealieErrors } from '@/lib/mealie-api';
import { tidyShoppingText } from '@/lib/shopping-list';
import { asObject } from '@/lib/todo-api';
import { textLength } from '@/lib/text-length';
import { WALL_ITEM_MAX_LENGTH, wallMayAddToMealie } from '@/lib/todo-wall';
import { noteWallAdded } from '@/lib/wall-added';

export const dynamic = 'force-dynamic';

/** Longer than anything typed into a shopping list box. */
const MAX_TEXT = 200;

/**
 * POST /api/mealie/shopping/items `{ list, text }`: put a typed item on one
 * of the household's Mealie lists ("Milk"), the way Mealie's own box does.
 * Answers like `GET /api/mealie/shopping` for that list, read fresh, so the
 * new item is in it, plus `added`: the new item's id, for Undo, or null when
 * Mealie merged the words into an item already on the list.
 *
 * The phone adds with a session, to any of the household's lists. A wall's
 * grocery card adds with the display token, held back to the least it needs:
 * only to the list the family shops from, only while some grocery card offers
 * an Add row (`wallMayAddToMealie`), only words, at most
 * `WALL_ITEM_MAX_LENGTH` characters. The hub remembers what it added for a
 * wall for a few minutes, so the wall's Undo can take it off again.
 */
export const POST = withDisplayAuth(withMealieErrors(async (request: NextRequest) => {
  const parsed = await parseJsonBody<unknown>(request, { maxBytes: 4 * 1024 });
  if (parsed instanceof NextResponse) return parsed;
  const body = asObject(parsed);
  if (body instanceof NextResponse) return body;
  const { list, text } = body;
  if (!isMealieShoppingId(list)) {
    return NextResponse.json({ error: 'list must be a Mealie shopping list id' }, { status: 400 });
  }
  const words = typeof text === 'string' ? tidyShoppingText(text) : '';
  if (!words || words.length > MAX_TEXT) {
    return NextResponse.json({ error: `text must be 1 to ${MAX_TEXT} characters` }, { status: 400 });
  }

  const fromWall = !(await hasEditorSession(request));
  if (fromWall) {
    if (Object.keys(body).some((f) => f !== 'list' && f !== 'text')) await requireSession(request);
    const [config, meals] = await Promise.all([readConfig(), readMealData()]);
    const family = wallMayAddToMealie(config, meals.settings) ? await readMealieShopping(meals.mealieShoppingList) : null;
    if (!family || family.status === 'failed' || family.list?.id !== list) {
      return NextResponse.json({ error: 'Adding from the wall is turned off for this list', code: 'lists.wallAddOff' }, { status: 403 });
    }
    if (textLength(words) > WALL_ITEM_MAX_LENGTH) {
      return NextResponse.json({ error: `text must be 1 to ${WALL_ITEM_MAX_LENGTH} characters` }, { status: 400 });
    }
  }

  const added = await addMealieShoppingItem(list, words);
  if (fromWall && added) noteWallAdded(added);
  return mealieShoppingResponse(await readMealieShopping(list, { fresh: true }), { added });
}), 'Failed to add to the Mealie shopping list');
