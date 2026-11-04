import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getPickerAuthUrl, exchangePickerCode } from '@/lib/google-picker';
import { confirmHubAddress } from '@/lib/google-picker-sign-in';
import { VIA_TRUSTED_PROXY_HEADER } from '@/lib/client-ip';
import { withAuth, parseJsonBody } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * GET: the Google sign-in link the editor opens in a new tab.
 * `?origin=` is the address the editor sees (`window.location.origin`); with
 * Home Screens' own Google app on, a confirmed one rides along so the sign-in
 * comes straight back here. Answers `{ url, returnsToHub }`.
 */
export const GET = withAuth(async (request: NextRequest) => {
  const hubAddress = confirmHubAddress(request.nextUrl.searchParams.get('origin'), {
    host: request.headers.get('host'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    viaTrustedProxy: request.headers.get(VIA_TRUSTED_PROXY_HEADER) === '1',
  });
  return NextResponse.json(await getPickerAuthUrl(hubAddress));
}, 'Failed to build sign-in link');

/**
 * POST: redeem a sign-in code. Body: `{ code }` for a pasted code (or the
 * whole pasted link), `{ code, state }` from the hub's return page. A failure
 * that means "sign in again" carries `expired: true`.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ code?: string; state?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  if (!body.code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  }
  if (body.state !== undefined && typeof body.state !== 'string') {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
  }
  const result = await exchangePickerCode(body.code, body.state);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, ...(result.expired ? { expired: true } : {}) }, { status: 400 });
  }
  return NextResponse.json({ connected: true });
}, 'Sign-in failed');
