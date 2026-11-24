import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  isAuthEnabled,
  verifyPassword,
  setPassword,
  clearPassword,
  requireSession,
  buildSessionCookie,
  buildClearCookie,
  clearAuthCache,
} from '@/lib/auth';
import { errorResponse, createRateLimiter, getClientIP, parseJsonBody } from '@/lib/api-utils';
import { audit } from '@/lib/audit';
import { keepShowingWallsOnFirstPassword } from '@/lib/display-walls';

export const dynamic = 'force-dynamic';

const MIN_PASSWORD_LENGTH = 8;
const limiter = createRateLimiter(5, 15 * 60 * 1000); // 5 attempts / 15 min

/**
 * 400, not 401: the person is signed in and typed the old password wrong. The
 * editor reads a 401 as a session that ran out and sends them to the login
 * page, which closed the dialog with no word about what was wrong.
 */
function wrongCurrentPassword(): NextResponse {
  return NextResponse.json({ error: 'Invalid current password', code: 'wrong_password' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    if (limiter.isLimited(ip)) {
      const minutes = Math.max(1, Math.ceil(limiter.retryAfterMs(ip) / 60_000));
      return NextResponse.json(
        { error: 'Too many failed attempts. Try again later.', retryAfterMinutes: minutes },
        { status: 429 },
      );
    }

    const authEnabled = await isAuthEnabled();

    // If auth is already enabled, require a valid session
    if (authEnabled) {
      await requireSession(request);
    }

    const body = await parseJsonBody<{
      currentPassword?: unknown;
      newPassword?: unknown;
      action?: unknown;
    }>(request);
    if (body instanceof NextResponse) return body;
    const { currentPassword, newPassword, action } = body;

    // Disable auth
    if (action === 'disable') {
      if (!authEnabled) {
        return NextResponse.json({ error: 'Auth is not enabled' }, { status: 400 });
      }
      if (!currentPassword || typeof currentPassword !== 'string') {
        return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
      }
      const valid = await verifyPassword(currentPassword);
      if (!valid) {
        limiter.recordFailure(ip);
        return wrongCurrentPassword();
      }
      limiter.clear(ip);
      await clearPassword();
      clearAuthCache();
      audit({ action: 'password_disable', ip });
      const cookie = buildClearCookie(request);
      return NextResponse.json({ ok: true, authEnabled: false }, {
        headers: { 'Set-Cookie': cookie },
      });
    }

    // Set or change password
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json({ error: 'New password is required' }, { status: 400 });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, code: 'password_too_short', minLength: MIN_PASSWORD_LENGTH },
        { status: 400 },
      );
    }

    // If auth is enabled, verify current password before changing
    if (authEnabled) {
      if (!currentPassword || typeof currentPassword !== 'string') {
        return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
      }
      const valid = await verifyPassword(currentPassword);
      if (!valid) {
        limiter.recordFailure(ip);
        return wrongCurrentPassword();
      }
      limiter.clear(ip);
    }

    // A first password closes the open door. The walls showing right now
    // stay let in; ones that stopped showing are dropped. Done before the
    // password lands so no wall is ever refused in between.
    if (!authEnabled) await keepShowingWallsOnFirstPassword();

    const token = await setPassword(newPassword);
    clearAuthCache();
    audit({ action: 'password_change', ip });
    const cookie = buildSessionCookie(token, request);

    return NextResponse.json({ ok: true, authEnabled: true }, {
      headers: { 'Set-Cookie': cookie },
    });
  } catch (error) {
    // requireSession throws a Response on 401
    if (error instanceof Response) return error;
    return errorResponse(error, 'Password operation failed');
  }
}
