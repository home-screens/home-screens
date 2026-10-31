import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { getMealieConfig, getMealieUser, searchMealieRecipes, type MealieRecipeFilter } from '@/lib/mealie';
import { mealieRecipeToMeal } from '@/lib/mealie-map';
import { mealieErrorResponse, mealieFailureResponse } from '@/lib/mealie-api';

export const dynamic = 'force-dynamic';

const FILTERS: ReadonlySet<string> = new Set(['all', 'favorites', 'recent']);

/**
 * GET /api/mealie/recipes?search=&filter=all|favorites|recent&category=&page=: one page
 * of the family's Mealie recipes for the phone's and the editor's pickers,
 * searched in Mealie each time and handed back as saved meals. Nothing is
 * copied into Home Screens.
 */
export const GET = withAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const filter = params.get('filter') ?? 'all';
  if (!FILTERS.has(filter)) return NextResponse.json({ error: 'filter must be all, favorites or recent' }, { status: 400 });
  const page = Number(params.get('page') ?? '1');
  const search = (params.get('search') ?? '').slice(0, 100);
  const category = params.get('category') ?? undefined;
  if (category !== undefined && !/^[a-z0-9-]{1,100}$/.test(category)) {
    return NextResponse.json({ error: 'category must be a Mealie category slug' }, { status: 400 });
  }
  try {
    const cfg = await getMealieConfig();
    if (!cfg) return mealieFailureResponse('not-set-up');
    const [result, user] = await Promise.all([
      searchMealieRecipes({ search, filter: filter as MealieRecipeFilter, category, page: Number.isInteger(page) ? page : 1 }),
      getMealieUser(),
    ]);
    const ctx = { baseUrl: cfg.url, groupSlug: user.groupSlug };
    return NextResponse.json({
      items: result.items.map((r) => mealieRecipeToMeal(r, ctx)),
      page: result.page,
      totalPages: result.totalPages,
      total: result.total,
    });
  } catch (err) {
    return mealieErrorResponse(err);
  }
}, 'Failed to search Mealie recipes');
