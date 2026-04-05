import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-utils';
import { validateImmichConnection } from '@/lib/immich';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  const result = await validateImmichConnection();
  return NextResponse.json(result);
}, 'Failed to validate Immich connection');
