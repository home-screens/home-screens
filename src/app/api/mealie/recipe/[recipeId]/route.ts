import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { getMealieConfig, getMealieRecipe, getMealieUser } from '@/lib/mealie';
import { mealieRecipeDetail } from '@/lib/mealie-map';
import { normalizeRecipeScale } from '@/lib/meal-courses';
import { mealieErrorResponse, mealieFailureResponse } from '@/lib/mealie-api';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ recipeId: string }> };

/**
 * GET /api/mealie/recipe/[recipeId]?scale=: one Mealie recipe's ingredients
 * and steps, for the editor's Detail tab and the wall's recipe views.
 * `scale` (a double batch is 2) multiplies the amounts the way Mealie does;
 * omitted, the lines are Mealie's own. Display access, so a wall can read it
 * too. The recipe is cached ten minutes on the hub.
 */
export const GET = withDisplayAuth(async (request: NextRequest, ctx: RouteContext) => {
  const { recipeId } = await ctx.params;
  if (!/^[0-9a-f-]{32,36}$/i.test(recipeId)) return NextResponse.json({ error: 'Unknown recipe' }, { status: 400 });
  const rawScale = request.nextUrl.searchParams.get('scale');
  const scale = rawScale === null ? 1 : normalizeRecipeScale(Number(rawScale)) ?? (Number(rawScale) === 1 ? 1 : null);
  if (scale === null) return NextResponse.json({ error: 'scale must be a number above 0 and at most 100' }, { status: 400 });
  try {
    const cfg = await getMealieConfig();
    if (!cfg) return mealieFailureResponse('not-set-up');
    const [recipe, user] = await Promise.all([getMealieRecipe(recipeId), getMealieUser()]);
    return NextResponse.json(mealieRecipeDetail(recipe, { baseUrl: cfg.url, groupSlug: user.groupSlug }, scale));
  } catch (err) {
    return mealieErrorResponse(err);
  }
}, 'Failed to read the Mealie recipe');
