import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { validateMealieConnection } from '@/lib/mealie';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mealie/validate: the Integrations card's Test button. Is there a
 * Mealie at the saved address, is it 2.0 or newer, does it take the key, and
 * whose household's plan will show. Never answers with the key.
 */
export const GET = withAuth(async () => {
  return NextResponse.json(await validateMealieConnection());
}, 'Failed to check the Mealie connection');
