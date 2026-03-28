import { NextResponse } from 'next/server';
import { revokeAllSessions, isAuthEnabled } from '@/lib/auth';
import { withAuth } from '@/lib/api-utils';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** POST — revoke all active sessions by bumping the session epoch */
export const POST = withAuth(async () => {
  const enabled = await isAuthEnabled();
  if (!enabled) {
    return NextResponse.json({ error: 'Auth is not enabled' }, { status: 400 });
  }
  await revokeAllSessions();
  audit({ action: 'session_revoke_all' });
  return NextResponse.json({ ok: true });
}, 'Failed to revoke sessions');
