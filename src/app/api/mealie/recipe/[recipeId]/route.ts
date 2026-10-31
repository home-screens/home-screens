import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { getMealieConfig, getMealieRecipe, getMealieUser } from '@/lib/mealie';
import { mealieRecipeDetail } from '@/lib/mealie-map';
import { mealieErrorResponse, mealieFailureResponse } from '@/lib/mealie-api';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ recipeId: string }> };

/**
 * GET /api/mealie/recipe/[recipeId]: one Mealie recipe's ingredients and
 * steps, for the editor's Detail tab (and any view that shows a recipe).
 * Display access, so a wall can read it too. Cached ten minutes on the hub.
 */
export const GET = withDisplayAuth(async (_request: NextRequest, ctx: RouteContext) => {
  const { recipeId } = await ctx.params;
  if (!/^[0-9a-f-]{32,36}$/i.test(recipeId)) return NextResponse.json({ error: 'Unknown recipe' }, { status: 400 });
  try {
    const cfg = await getMealieConfig();
    if (!cfg) return mealieFailureResponse('not-set-up');
    const [recipe, user] = await Promise.all([getMealieRecipe(recipeId), getMealieUser()]);
    return NextResponse.json(mealieRecipeDetail(recipe, { baseUrl: cfg.url, groupSlug: user.groupSlug }));
  } catch (err) {
    return mealieErrorResponse(err);
  }
}, 'Failed to read the Mealie recipe');
