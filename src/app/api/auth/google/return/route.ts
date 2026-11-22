import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { exchangeCalendarWebCode } from '@/lib/google-auth';
import { exchangePickerCode } from '@/lib/google-picker';
import { signInPurpose } from '@/lib/google-web-sign-in';
import { withAuth, parseJsonBody } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * POST: a Google web sign-in coming back through the hub's return page
 * (`/editor/connect/google`), `{ code, state }`. The waiting sign-in `state`
 * names says which integration it was for, so the code lands in Google
 * Photos import's grant or Calendar's. Answers `{ connected, purpose }`, plus
 * `canAddEvents` for Calendar; a failure that means "sign in again" carries
 * `expired: true`.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ code?: unknown; state?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  if (typeof body.code !== 'string' || !body.code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  if (typeof body.state !== 'string') return NextResponse.json({ error: 'Invalid state' }, { status: 400 });

  // Nothing waiting (used, replaced, timed out, or a forged value): Photos'
  // redeem answers that as an expired sign-in, as it always has.
  if (signInPurpose(body.state) === 'calendar') {
    const result = await exchangeCalendarWebCode(body.code, body.state);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, ...(result.expired ? { expired: true } : {}) }, { status: 400 });
    }
    return NextResponse.json({ connected: true, purpose: 'calendar', canAddEvents: result.canAddEvents });
  }
  const result = await exchangePickerCode(body.code, body.state);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, ...(result.expired ? { expired: true } : {}) }, { status: 400 });
  }
  return NextResponse.json({ connected: true, purpose: 'photos' });
}, 'Sign-in failed');
