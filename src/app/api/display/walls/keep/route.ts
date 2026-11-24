import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasSignedInSession, wallFromCookies } from '@/lib/auth';
import { getClientIP, parseJsonBody, withAuth } from '@/lib/api-utils';
import { audit } from '@/lib/audit';
import { isValidDisplayId } from '@/lib/display-filter';
import { buildWallCookie, createWall, letWallIn } from '@/lib/display-walls';

export const dynamic = 'force-dynamic';

/**
 * A signed-in grown-up, looking at the wall in a browser, keeps that
 * browser as a wall: it is given a wall cookie, so it goes on showing after
 * they sign out. Without this a signed-in browser shows the wall on its
 * sign-in alone and is never listed, which is what keeps a quick look, or
 * the editor's preview, from turning into a display.
 *
 * Needs a real sign-in, so it answers 401 on a hub with no password, where
 * there is nothing to keep: every browser is already let in.
 */
export const POST = withAuth(async (request: NextRequest) => {
  {
    // `withAuth` passes everyone on a hub with no password; this needs a real sign-in.
    if (!(await hasSignedInSession(request))) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const body = await parseJsonBody<{ displayId?: unknown; width?: unknown; height?: unknown }>(request);
    if (body instanceof NextResponse) return body;
    const displayId = typeof body.displayId === 'string' && body.displayId ? body.displayId : undefined;
    if (displayId !== undefined && !isValidDisplayId(displayId)) {
      return NextResponse.json({ error: 'Invalid display' }, { status: 400 });
    }

    const wall = await wallFromCookies(request.headers.get('cookie') ?? '');
    if (wall?.status === 'in') return NextResponse.json({ ok: true });
    if (wall) {
      await letWallIn(wall.id, 'kept');
      return NextResponse.json({ ok: true });
    }
    const width = typeof body.width === 'number' && body.width > 0 ? Math.round(body.width) : 0;
    const height = typeof body.height === 'number' && body.height > 0 ? Math.round(body.height) : 0;
    const made = await createWall({
      status: 'in',
      admittedBy: 'kept',
      displayId: displayId ?? null,
      address: getClientIP(request),
      userAgent: request.headers.get('user-agent') ?? '',
      ...(width && height ? { viewport: { width, height } } : {}),
      passwordSet: true,
    });
    audit({ action: 'wall_kept', ip: getClientIP(request) });
    return NextResponse.json({ ok: true }, made ? { headers: { 'Set-Cookie': buildWallCookie(made.cookieValue, request) } } : undefined);
  }
}, 'Could not keep this as a wall');
