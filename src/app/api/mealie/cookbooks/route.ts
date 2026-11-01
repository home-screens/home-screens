import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { listMealieCookbooks } from '@/lib/mealie';
import { withMealieErrors } from '@/lib/mealie-api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mealie/cookbooks: the household's Mealie cookbooks, in the
 * household's own order, for the Library's and the pickers' filters.
 * `{ cookbooks: [{ name, slug }] }`.
 */
export const GET = withAuth(withMealieErrors(async () => {
  return NextResponse.json({ cookbooks: await listMealieCookbooks() });
}), 'Failed to read Mealie cookbooks');
