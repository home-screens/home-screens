import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  verifyPassword,
  readAuthState,
  createSessionCookie,
  buildSessionCookie,
  getSessionMaxAge,
} from '@/lib/auth';
import { publicErrorResponse, createRateLimiter, getClientIP, parseJsonBody, SMALL_BODY_BYTES } from '@/lib/api-utils';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// 10 rather than 5: the password is typed on a phone keyboard, and four
// typos used to lock a parent out of their own hub for a quarter of an hour.
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const limiter = createRateLimiter(10, LOCKOUT_WINDOW_MS);

// Passwords are checked one at a time. A wrong one only counts once its hash
// has come back, so passwords checked side by side would all pass a limit
// none of them had reached yet: a burst got one guess each. In a line, every
// try meets the count the tries before it left, and one hash runs at a time,
// so a burst cannot fill the hub's worker threads either.
let line: Promise<unknown> = Promise.resolve();
let waiting = 0;

/**
 * How many tries may stand in the line. Past it a try is turned away
 * unchecked: a person sends one at a time, and a burst must not queue work
 * without end.
 */
const MAX_WAITING = 20;

function inTurn<T>(work: () => Promise<T>): Promise<T> | null {
  if (waiting >= MAX_WAITING) return null;
  waiting++;
  const turn = line.then(work).finally(() => { waiting--; });
  line = turn.catch(() => {});
  return turn;
}

function limitedResponse(ip: string): NextResponse {
  // `code` + `retryAfterSeconds` are what the login page renders: the
  // English `error` string is a fallback for non-browser callers, and
  // showing it verbatim left the red line untranslated on a German page.
  const retryAfterSeconds = Math.max(1, Math.ceil(limiter.retryAfterMs(ip) / 1000));
  return NextResponse.json(
    {
      error: 'Too many failed attempts. Try again later.',
      code: 'rate_limited',
      retryAfterSeconds,
    },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

/* ─── POST /api/auth/login ───────────────────── */

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    if (limiter.isLimited(ip)) return limitedResponse(ip);

    const body = await parseJsonBody<{ password?: unknown; rememberMe?: unknown }>(request, { maxBytes: SMALL_BODY_BYTES });
    if (body instanceof NextResponse) return body;
    const { password, rememberMe } = body;

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password is required', code: 'password_required' },
        { status: 400 },
      );
    }

    // Checked again inside the line: the tries ahead of this one may have
    // used up this address's guesses while it waited.
    const checked = inTurn(async (): Promise<'limited' | boolean> => {
      if (limiter.isLimited(ip)) return 'limited';
      const ok = await verifyPassword(password);
      if (!ok) limiter.recordFailure(ip);
      return ok;
    });
    if (!checked) {
      return NextResponse.json(
        { error: 'The hub is busy. Try again in a moment.', code: 'rate_limited', retryAfterSeconds: 1 },
        { status: 429, headers: { 'Retry-After': '1' } },
      );
    }
    const valid = await checked;
    if (valid === 'limited') return limitedResponse(ip);
    if (!valid) {
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
    return publicErrorResponse(error, 'Login failed');
  }
}
