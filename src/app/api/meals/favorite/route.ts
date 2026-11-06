import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseJsonBody, withDisplayAuth } from '@/lib/api-utils';
import { updateMealData } from '@/lib/meal-data';
import { setSavedMealFavorite } from '@/lib/meal-plan-actions';
import { setMealieFavorite } from '@/lib/mealie';
import { claimsMealieId, parseMealieMealId } from '@/lib/mealie-map';
import { withMealieErrors } from '@/lib/mealie-api';

export const dynamic = 'force-dynamic';

/**
 * POST /api/meals/favorite `{ mealId, favorite }`: put the heart on a recipe
 * or take it off. A Mealie recipe (`mealie:<recipe id>`) is hearted in Mealie,
 * for the person whose key the hub holds, which is the list every Favorites
 * chip reads, so it shows in Mealie's own pages too. One of the family's own
 * recipes is marked in meals.json.
 *
 * Display access, like a grocery tick: the wall's Recipe book has hearts
 * too, and a heart is a small change to undo. `favorite` sets rather than
 * flips, so a tap sent twice is still one heart.
 */
export const POST = withDisplayAuth(withMealieErrors(async (req: NextRequest) => {
  const body = await parseJsonBody<{ mealId?: unknown; favorite?: unknown }>(req);
  if (body instanceof NextResponse) return body;
  const { mealId, favorite } = body;
  if (typeof mealId !== 'string' || !mealId || mealId.length > 200) {
    return NextResponse.json({ error: 'mealId must be the id of a meal' }, { status: 400 });
  }
  if (typeof favorite !== 'boolean') {
    return NextResponse.json({ error: 'favorite must be true or false' }, { status: 400 });
  }

  if (claimsMealieId(mealId)) {
    const recipeId = parseMealieMealId(mealId);
    if (!recipeId) return NextResponse.json({ error: 'Unknown recipe' }, { status: 400 });
    await setMealieFavorite(recipeId, favorite);
    return NextResponse.json({ mealId, favorite });
  }

  let found = false;
  await updateMealData((current) => {
    found = current.savedMeals.some((m) => m.id === mealId);
    const savedMeals = setSavedMealFavorite(current.savedMeals, mealId, favorite);
    return savedMeals === current.savedMeals ? current : { ...current, savedMeals };
  });
  if (!found) return NextResponse.json({ error: 'No saved meal has that id' }, { status: 404 });
  return NextResponse.json({ mealId, favorite });
}), 'Failed to save the favorite');
