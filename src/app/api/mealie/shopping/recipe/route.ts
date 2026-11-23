import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { hasEditorSession } from '@/lib/auth';
import { readConfig } from '@/lib/config';
import { readMealData } from '@/lib/meal-data';
import { wallMayPlanMeals } from '@/lib/meal-plan-wall';
import { mealieShoppingResponse, withMealieErrors } from '@/lib/mealie-api';
import { parseMealieMealId } from '@/lib/mealie-map';
import { addMealieRecipeToShopping, readMealieShopping } from '@/lib/mealie-shopping';
import { asObject } from '@/lib/todo-api';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mealie/shopping/recipe `{ mealId }`: put a Mealie recipe's
 * ingredients on the list the family shops from, the way Mealie's own "Add
 * to list" does. Answers like `GET /api/mealie/shopping` for that list, read
 * fresh.
 *
 * Offered on the wall right after a recipe goes on the menu, since Mealie
 * does not build its shopping list from the plan. A wall may do it with the
 * display token only while the plan lives in Mealie and some meal card has
 * "Plan meals on the wall" on, and only ever to the family's own list.
 */
export const POST = withDisplayAuth(withMealieErrors(async (request: NextRequest) => {
  const parsed = await parseJsonBody<unknown>(request, { maxBytes: 4 * 1024 });
  if (parsed instanceof NextResponse) return parsed;
  const body = asObject(parsed);
  if (body instanceof NextResponse) return body;
  const recipeId = typeof body.mealId === 'string' ? parseMealieMealId(body.mealId) : null;
  if (!recipeId) return NextResponse.json({ error: 'mealId must name a Mealie recipe' }, { status: 400 });

  const meals = await readMealData();
  const allowed = meals.settings.planSource === 'mealie'
    && ((await hasEditorSession(request)) || wallMayPlanMeals(await readConfig()));
  if (!allowed) {
    return NextResponse.json({ error: 'Planning meals from the wall is turned off', code: 'meals.wallPlanOff' }, { status: 403 });
  }
  const family = await readMealieShopping(meals.mealieShoppingList);
  if (family.status === 'failed') return mealieShoppingResponse(family);
  if (!family.list) return NextResponse.json({ error: 'There is no shopping list in Mealie yet', reason: 'gone' }, { status: 404 });

  await addMealieRecipeToShopping(family.list.id, recipeId);
  return mealieShoppingResponse(await readMealieShopping(family.list.id, { fresh: true }));
}), 'Failed to add the recipe to the Mealie shopping list');
