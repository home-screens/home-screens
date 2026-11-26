import { NextResponse } from 'next/server';
import { getDisplayToken, regenerateDisplayToken } from '@/lib/auth';
import { withAuth } from '@/lib/api-utils';
import { audit } from '@/lib/audit';
import { lastRefusedKey } from '@/lib/display-key-refusals';

export const dynamic = 'force-dynamic';

/**
 * GET: the display key (session-only), made on first ask whether or not a
 * password is set, so it can go into Home Assistant before one is. With it,
 * the last time a key that doesn't match was turned away, and from where.
 */
export const GET = withAuth(async () => {
  const token = await getDisplayToken();
  return NextResponse.json({ displayToken: token, lastRefused: lastRefusedKey() });
}, 'Failed to read display token');

/** POST: make a new display key (session-only). */
export const POST = withAuth(async () => {
  const token = await regenerateDisplayToken();
  audit({ action: 'display_token_regenerate' });
  return NextResponse.json({ displayToken: token, lastRefused: lastRefusedKey() });
}, 'Failed to regenerate display token');
