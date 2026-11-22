import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createRateLimiter, getClientIP, parseJsonBody, publicErrorResponse, SMALL_BODY_BYTES } from '@/lib/api-utils';
import { audit } from '@/lib/audit';
import {
  isGrownUpCode,
  WRONG_CODE_HUB_WAIT_MS,
  WRONG_CODE_WAIT_MS,
  WRONG_CODES_PER_ADDRESS,
  WRONG_CODES_PER_HUB,
} from '@/lib/grown-up-code';
import { checkGrownUpCode } from '@/lib/grown-up-code-data';

export const dynamic = 'force-dynamic';

// Per address, and for the whole hub under one key, so guessing from many
// addresses at once waits too. In memory: a restart forgets the count, which
// for four digits behind a minute's wait is an acceptable gift.
const perAddress = createRateLimiter(WRONG_CODES_PER_ADDRESS, WRONG_CODE_WAIT_MS);
const perHub = createRateLimiter(WRONG_CODES_PER_HUB, WRONG_CODE_HUB_WAIT_MS);
const HUB = '*';

function waitResponse(ms: number) {
  const retryAfterSeconds = Math.max(1, Math.ceil(ms / 1000));
  return NextResponse.json(
    { error: 'Too many tries. Try again in a minute.', code: 'rate_limited', retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

/**
 * POST — the wall, the kids' chores page or an unsigned phone checks a
 * grown-up code. Open on the LAN like the kid routes (KID_VIEW_POST_ROUTES in
 * src/proxy.ts): the code is the proof, and wrong tries are limited. A right
 * code is answered with an unlock the ticked jobs accept for the minutes set
 * in Settings.
 */
export const POST = async (request: NextRequest) => {
  try {
    const ip = getClientIP(request);
    if (perAddress.isLimited(ip)) return waitResponse(perAddress.retryAfterMs(ip));
    if (perHub.isLimited(HUB)) return waitResponse(perHub.retryAfterMs(HUB));

    const body = await parseJsonBody<{ code?: unknown }>(request, { maxBytes: SMALL_BODY_BYTES });
    if (body instanceof NextResponse) return body;
    if (!isGrownUpCode(body.code)) {
      return NextResponse.json({ error: 'The code is four numbers.', code: 'bad_code' }, { status: 400 });
    }

    const result = await checkGrownUpCode(body.code);
    if (result.ok) {
      perAddress.clear(ip);
      return NextResponse.json({ token: result.token, expiresAt: result.expiresAt });
    }
    if (result.reason === 'none') {
      // Nothing to unlock: every job goes ahead without one.
      return NextResponse.json({ error: 'No grown-up code is set.', code: 'no_code' }, { status: 409 });
    }
    perAddress.recordFailure(ip);
    perHub.recordFailure(HUB);
    audit({ action: 'grown_up_code_wrong', ip });
    if (perAddress.isLimited(ip)) return waitResponse(perAddress.retryAfterMs(ip));
    // 422, never 401: a page's fetcher reads a 401 as an expired sign-in and leaves for the login screen.
    return NextResponse.json({ error: "That's not it.", code: 'wrong_code' }, { status: 422 });
  } catch (error) {
    return publicErrorResponse(error, 'Failed to check the grown-up code');
  }
};
