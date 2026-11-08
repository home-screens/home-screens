import { NextResponse } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { getMealieRecipesRevision } from '@/lib/mealie';
import { withMealieErrors } from '@/lib/mealie-api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mealie/recipes/revision: `{ revision }`, a short string that
 * changes whenever the family's Mealie recipes, favorites, categories or
 * cookbooks do. A wall showing the recipe book asks once a minute and reads
 * its recipes again only when this moves. Kept half a minute on the hub and
 * shared by every wall. Display access, read only.
 */
export const GET = withDisplayAuth(withMealieErrors(async () => {
  return NextResponse.json({ revision: await getMealieRecipesRevision() });
}), 'Failed to read Mealie');
