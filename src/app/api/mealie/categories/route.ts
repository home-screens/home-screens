import { NextResponse } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { listMealieCategories } from '@/lib/mealie';
import { withMealieErrors } from '@/lib/mealie-api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mealie/categories: the household's Mealie recipe categories, for
 * the Library's filters on the phone and in the editor and the wall's recipe
 * book (display access, read only). `{ categories: [{ name, slug }] }`.
 */
export const GET = withDisplayAuth(withMealieErrors(async () => {
  return NextResponse.json({ categories: await listMealieCategories() });
}), 'Failed to read Mealie categories');
