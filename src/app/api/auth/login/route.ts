import { NextRequest, NextResponse } from 'next/server';
import {
  verifyPassword,
  readAuthState,
  createSessionCookie,
  buildSessionCookie,
  getSessionMaxAge,
} from '@/lib/auth';
import { errorResponse, createRateLimiter, getClientIP } from '@/lib/api-utils';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const limiter = createRateLimiter(5, 15 * 60 * 1000); // 5 attempts / 15 min

/* ─── POST /api/auth/login ───────────────────── */

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    if (limiter.isLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json();
    const { password, rememberMe } = body;

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      limiter.recordFailure(ip);
      audit({ action: 'login_failure', ip });
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    limiter.clear(ip);
    audit({ action: 'login_success', ip });

    const state = await readAuthState();
    if (!state.cookieSecret) {
      return NextResponse.json({ error: 'Auth state invalid' }, { status: 500 });
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
