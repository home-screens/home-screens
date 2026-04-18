/**
 * GET  /api/system/reporter-token  → { token: string | null }
 * POST /api/system/reporter-token  → { token: string } (rotates)
 *
 * The reporter token gates `POST /api/display/status` requests that carry
 * `hwStats`. `scripts/install.sh` generates it on full-hub installs; display-
 * only Pis receive it via the install-time prompt (the operator copies it
 * from this endpoint's UI in the editor).
 *
 * Rotating invalidates every deployed reporter until the new token is
 * redistributed — intentional, since the whole point is reclaiming hw-stat
 * posting rights from a compromised token.
 */

import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { withAuth } from '@/lib/api-utils';
import { getSecret, setSecret } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

function generateToken(): string {
  return randomBytes(16).toString('hex');
}

export const GET = withAuth(async () => {
  const token = await getSecret('reporter_token');
  return NextResponse.json({ token });
}, 'Failed to read reporter token');

export const POST = withAuth(async () => {
  const token = generateToken();
  await setSecret('reporter_token', token);
  return NextResponse.json({ token });
}, 'Failed to rotate reporter token');
