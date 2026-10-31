import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { getMealieConfig, listMealieCookbooks } from '@/lib/mealie';
import { mealieErrorResponse, mealieFailureResponse } from '@/lib/mealie-api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mealie/cookbooks: the household's Mealie cookbooks, in the
 * household's own order, for the Library's and the pickers' filters.
 * `{ cookbooks: [{ name, slug }] }`.
 */
export const GET = withAuth(async () => {
  try {
    if (!(await getMealieConfig())) return mealieFailureResponse('not-set-up');
    return NextResponse.json({ cookbooks: await listMealieCookbooks() });
  } catch (err) {
    return mealieErrorResponse(err);
  }
}, 'Failed to read Mealie cookbooks');
