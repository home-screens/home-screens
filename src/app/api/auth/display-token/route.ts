import { NextResponse } from 'next/server';
import { getDisplayToken, regenerateDisplayToken, isAuthEnabled } from '@/lib/auth';
import { withAuth } from '@/lib/api-utils';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** GET — return the current display token (session-only, admin action) */
export const GET = withAuth(async () => {
  const enabled = await isAuthEnabled();
  if (!enabled) {
    return NextResponse.json({ displayToken: null });
  }
  const token = await getDisplayToken();
  return NextResponse.json({ displayToken: token });
}, 'Failed to read display token');

/** POST — regenerate the display token (session-only, admin action) */
export const POST = withAuth(async () => {
  const enabled = await isAuthEnabled();
  if (!enabled) {
    return NextResponse.json({ error: 'Auth is not enabled' }, { status: 400 });
  }
  const token = await regenerateDisplayToken();
  audit({ action: 'display_token_regenerate' });
  return NextResponse.json({ displayToken: token });
}, 'Failed to regenerate display token');
