import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { getMealieContext, isMealieRecipeFilter, searchMealieRecipes } from '@/lib/mealie';
import { mealieRecipeToMeal } from '@/lib/mealie-map';
import { withMealieErrors } from '@/lib/mealie-api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mealie/recipes?search=&filter=all|favorites|recent&category=&cookbook=&page=: one page
 * of the family's Mealie recipes for the phone's and the editor's pickers,
 * searched in Mealie each time and handed back as saved meals. Nothing is
 * copied into Home Screens.
 */
export const GET = withAuth(withMealieErrors(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const filter = params.get('filter') ?? 'all';
  if (!isMealieRecipeFilter(filter)) return NextResponse.json({ error: 'filter must be all, favorites or recent' }, { status: 400 });
  const page = Number(params.get('page') ?? '1');
  const search = (params.get('search') ?? '').slice(0, 100);
  const category = params.get('category') ?? undefined;
  if (category !== undefined && !/^[a-z0-9-]{1,100}$/.test(category)) {
    return NextResponse.json({ error: 'category must be a Mealie category slug' }, { status: 400 });
  }
  const cookbook = params.get('cookbook') ?? undefined;
  if (cookbook !== undefined && !/^[a-z0-9-]{1,100}$/.test(cookbook)) {
    return NextResponse.json({ error: 'cookbook must be a Mealie cookbook slug' }, { status: 400 });
  }
  const [result, mealie] = await Promise.all([
    searchMealieRecipes({ search, filter, category, cookbook, page: Number.isInteger(page) ? page : 1 }),
    getMealieContext(),
  ]);
  return NextResponse.json({
    items: result.items.map((r) => mealieRecipeToMeal(r, mealie)),
    page: result.page,
    totalPages: result.totalPages,
    total: result.total,
  });
}), 'Failed to search Mealie recipes');
