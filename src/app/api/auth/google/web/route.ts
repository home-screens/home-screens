import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCalendarWebAuthUrl, exchangeCalendarWebCode } from '@/lib/google-auth';
import { confirmHubAddress } from '@/lib/google-web-sign-in';
import { VIA_TRUSTED_PROXY_HEADER } from '@/lib/client-ip';
import { withAuth, parseJsonBody } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * GET: the Google web sign-in link that lets Home Screens add and change
 * events. `?origin=` is the address the editor sees; a confirmed one rides
 * along so the sign-in comes straight back here. Answers `{ url, returnsToHub }`.
 */
export const GET = withAuth(async (request: NextRequest) => {
  const hubAddress = confirmHubAddress(request.nextUrl.searchParams.get('origin'), {
    host: request.headers.get('host'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    viaTrustedProxy: request.headers.get(VIA_TRUSTED_PROXY_HEADER) === '1',
  });
  return NextResponse.json(await getCalendarWebAuthUrl(hubAddress));
}, 'Failed to build sign-in link');

/**
 * POST: redeem a pasted sign-in code (or the whole pasted link), `{ code }`.
 * Codes that come back through the hub's return page go to
 * `/api/auth/google/return` instead. Answers `{ connected, canAddEvents }`;
 * a failure that means "sign in again" carries `expired: true`.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ code?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  if (typeof body.code !== 'string' || !body.code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  const result = await exchangeCalendarWebCode(body.code);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, ...(result.expired ? { expired: true } : {}) }, { status: 400 });
  }
  return NextResponse.json({ connected: true, canAddEvents: result.canAddEvents });
}, 'Sign-in failed');
