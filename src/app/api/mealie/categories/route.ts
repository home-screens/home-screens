import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { listMealieCategories } from '@/lib/mealie';
import { withMealieErrors } from '@/lib/mealie-api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mealie/categories: the household's Mealie recipe categories, for
 * the Library's filters on the phone and in the editor. `{ categories: [{ name, slug }] }`.
 */
export const GET = withAuth(withMealieErrors(async () => {
  return NextResponse.json({ categories: await listMealieCategories() });
}), 'Failed to read Mealie categories');
