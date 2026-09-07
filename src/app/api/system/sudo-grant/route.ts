import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, createRateLimiter, getClientIP, parseJsonBody } from '@/lib/api-utils';
import { grantSudo } from '@/lib/sudo-grant';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// The device password is being tried against sudo here, so this gets the
// same brake as the login form: a handful of tries, then a quarter hour.
const WINDOW_MS = 15 * 60 * 1000;
const limiter = createRateLimiter(5, WINDOW_MS);

/**
 * POST /api/system/sudo-grant
 * Body: { password }
 *
 * Writes the passwordless sudo grant for the service account using the
 * device password once. The password is handed to the shell on stdin and is
 * never logged or stored.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const ip = getClientIP(request);
  if (limiter.isLimited(ip)) {
    const minutes = Math.max(1, Math.ceil(limiter.retryAfterMs(ip) / 60_000));
    return NextResponse.json(
      { ok: false, error: `Too many tries. Wait ${minutes} minutes and try again.`, retryAfterMinutes: minutes },
      { status: 429 },
    );
  }

  const body = await parseJsonBody<{ password?: unknown }>(request);
  if (body instanceof NextResponse) return body;

  const { password } = body;
  if (typeof password !== 'string' || password.length === 0 || password.includes('\n')) {
    return NextResponse.json({ ok: false, error: 'Enter the password for this device.' }, { status: 400 });
  }

  const result = await grantSudo(password);
  if (!result.ok) {
    limiter.recordFailure(ip);
    audit({ action: 'sudo_grant_failure', ip });
    // 403, not 401: editorFetch turns every 401 into a login redirect, and a
    // wrong device password is not an expired editor session.
    return NextResponse.json(
      { ok: false, error: result.error, wrongPassword: result.wrongPassword === true },
      { status: result.wrongPassword ? 403 : 500 },
    );
  }

  limiter.clear(ip);
  audit({ action: 'sudo_grant_success', ip });
  return NextResponse.json({ ok: true });
}, 'Could not allow system changes');
