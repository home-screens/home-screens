import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { getMealieContext, getMealieRecipe } from '@/lib/mealie';
import { isMealieRecipeId, mealieRecipeDetail } from '@/lib/mealie-map';
import { normalizeRecipeScale } from '@/lib/meal-courses';
import { withMealieErrors } from '@/lib/mealie-api';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ recipeId: string }> };

/**
 * GET /api/mealie/recipe/[recipeId]?scale=: one Mealie recipe's ingredients
 * and steps, for the editor's Detail tab and the wall's recipe views.
 * `scale` (a double batch is 2) multiplies the amounts the way Mealie does;
 * omitted, the lines are Mealie's own. Display access, so a wall can read it
 * too. The recipe is cached ten minutes on the hub.
 */
export const GET = withDisplayAuth(withMealieErrors(async (request: NextRequest, ctx: RouteContext) => {
  const { recipeId } = await ctx.params;
  if (!isMealieRecipeId(recipeId)) return NextResponse.json({ error: 'Unknown recipe' }, { status: 400 });
  const rawScale = request.nextUrl.searchParams.get('scale');
  const scale = rawScale === null ? 1 : normalizeRecipeScale(Number(rawScale)) ?? (Number(rawScale) === 1 ? 1 : null);
  if (scale === null) return NextResponse.json({ error: 'scale must be a number above 0 and at most 100' }, { status: 400 });
  const [recipe, mealie] = await Promise.all([getMealieRecipe(recipeId), getMealieContext()]);
  return NextResponse.json(mealieRecipeDetail(recipe, mealie, scale));
}), 'Failed to read the Mealie recipe');
