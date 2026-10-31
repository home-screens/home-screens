import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { getMealieConfig, listMealieCategories } from '@/lib/mealie';
import { mealieErrorResponse, mealieFailureResponse } from '@/lib/mealie-api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mealie/categories: the household's Mealie recipe categories, for
 * the Library's filters on the phone and in the editor. `{ categories: [{ name, slug }] }`.
 */
export const GET = withAuth(async () => {
  try {
    if (!(await getMealieConfig())) return mealieFailureResponse('not-set-up');
    return NextResponse.json({ categories: await listMealieCategories() });
  } catch (err) {
    return mealieErrorResponse(err);
  }
}, 'Failed to read Mealie categories');
