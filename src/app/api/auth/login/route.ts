import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  verifyPassword,
  readAuthState,
  createSessionCookie,
  buildSessionCookie,
  getSessionMaxAge,
} from '@/lib/auth';
import { errorResponse, createRateLimiter, getClientIP, parseJsonBody } from '@/lib/api-utils';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// 10 rather than 5: the password is typed on a phone keyboard, and four
// typos used to lock a parent out of their own hub for a quarter of an hour.
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const limiter = createRateLimiter(10, LOCKOUT_WINDOW_MS);

/* ─── POST /api/auth/login ───────────────────── */

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    if (limiter.isLimited(ip)) {
      // `code` + `retryAfterSeconds` are what the login page renders: the
      // English `error` string is a fallback for non-browser callers, and
      // showing it verbatim left the red line untranslated on a German page.
      const retryAfterSeconds = Math.ceil(limiter.retryAfterMs(ip) / 1000);
      return NextResponse.json(
        {
          error: 'Too many failed attempts. Try again later.',
          code: 'rate_limited',
          retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      );
    }

    const body = await parseJsonBody<{ password?: unknown; rememberMe?: unknown }>(request);
    if (body instanceof NextResponse) return body;
    const { password, rememberMe } = body;

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password is required', code: 'password_required' },
        { status: 400 },
      );
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      limiter.recordFailure(ip);
      audit({ action: 'login_failure', ip });
      return NextResponse.json(
        { error: 'Invalid password', code: 'invalid_password' },
        { status: 401 },
      );
    }

    limiter.clear(ip);
    audit({ action: 'login_success', ip });

    const state = await readAuthState();
    if (!state.cookieSecret) {
      return NextResponse.json(
        { error: 'Auth state invalid', code: 'auth_state_invalid' },
        { status: 500 },
      );
    }

    const remember = rememberMe === true;
    const token = createSessionCookie(state.cookieSecret, remember, state.sessionEpoch);
    const cookie = buildSessionCookie(token, request, getSessionMaxAge(remember));

    return NextResponse.json({ ok: true }, {
      headers: { 'Set-Cookie': cookie },
    });
  } catch (error) {
    return errorResponse(error, 'Login failed');
  }
}
