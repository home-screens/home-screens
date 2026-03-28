import { NextRequest, NextResponse } from 'next/server';
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
import { errorResponse, createRateLimiter, getClientIP } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const MIN_PASSWORD_LENGTH = 8;
const limiter = createRateLimiter(5, 15 * 60 * 1000); // 5 attempts / 15 min

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    if (limiter.isLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Try again later.' },
        { status: 429 },
      );
    }

    const authEnabled = await isAuthEnabled();

    // If auth is already enabled, require a valid session
    if (authEnabled) {
      await requireSession(request);
    }

    const body = await request.json();
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
        return NextResponse.json({ error: 'Invalid current password' }, { status: 401 });
      }
      limiter.clear(ip);
      await clearPassword();
      clearAuthCache();
      const cookie = buildClearCookie(request);
      return NextResponse.json({ success: true, authEnabled: false }, {
        headers: { 'Set-Cookie': cookie },
      });
    }

    // Set or change password
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json({ error: 'New password is required' }, { status: 400 });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
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
        return NextResponse.json({ error: 'Invalid current password' }, { status: 401 });
      }
      limiter.clear(ip);
    }

    const token = await setPassword(newPassword);
    clearAuthCache();
    const cookie = buildSessionCookie(token, request);

    return NextResponse.json({ success: true, authEnabled: true }, {
      headers: { 'Set-Cookie': cookie },
    });
  } catch (error) {
    // requireSession throws a Response on 401
    if (error instanceof Response) return error;
    return errorResponse(error, 'Password operation failed');
  }
}
