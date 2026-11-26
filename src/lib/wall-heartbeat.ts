/**
 * What the wall's heartbeat does about the wall cookie: gives one to a page
 * that is already running without it, and renews one that is getting old.
 *
 * Two kinds of page run without a cookie. On a hub with no password, every
 * wall: it is given one quietly so that setting a password later does not
 * strand the walls that are showing. On a hub with a password, a page
 * rendered before the update, which still holds the display key in memory:
 * this is how every existing wall moves over with no click. The answer that
 * sets the cookie also names the new build, so the wall's reload onto it
 * already carries the cookie.
 *
 * Everything else is let in through `POST /api/display/claim`, before its
 * page ever mounts.
 */
import type { NextRequest } from 'next/server';
import { isAuthEnabled, wallFromCookies } from './auth';
import { getClientIP } from './api-utils';
import { admitWithoutAsking } from './display-admission';
import { WALL_COOKIE_REFRESH_MS, buildWallCookie, createWall, letWallIn, noteCookieRefreshed, touchWall, wallCookieValue } from './display-walls';
import { admissionFacts } from './wall-admission-facts';
import { isHubOwnScreen, isWallPageRequest } from './wall-request';

/** The `Set-Cookie` value to send with this heartbeat's answer, or null for none. */
export async function wallCookieForHeartbeat(request: NextRequest, displayId: string | undefined): Promise<string | null> {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const address = getClientIP(request);
  const wall = await wallFromCookies(cookieHeader);

  if (wall?.status === 'in') {
    await touchWall(wall, { displayId: displayId ?? null, address, userAgent: request.headers.get('user-agent') ?? '', hubScreen: isHubOwnScreen(request) });
    if (Date.now() - wall.cookieIssuedAt < WALL_COOKIE_REFRESH_MS) return null;
    const value = wallCookieValue(cookieHeader);
    if (!value) return null;
    await noteCookieRefreshed(wall);
    return buildWallCookie(value, request);
  }

  // curl, Home Assistant or a bookmark polling with the key is not a wall.
  if (!isWallPageRequest(request)) return null;

  const facts = await admissionFacts(request, displayId);
  // Only the two cases where a page is already up without a cookie. The
  // hub's own screen, an allowed network and the window go through claim.
  const via = admitWithoutAsking({ ...facts, hubOwnScreen: false, allowedNetwork: false, displayAdopted: false });
  if (via !== 'no-password' && via !== 'old-key') return null;

  if (wall) {
    // It was waiting and has turned out to hold the key: same cookie, now let in.
    await letWallIn(wall.id, via, { passwordSet: facts.passwordSet, displayId: displayId ?? null });
    return null;
  }
  const made = await createWall({
    status: 'in',
    admittedBy: via,
    displayId: displayId ?? null,
    address,
    userAgent: request.headers.get('user-agent') ?? '',
    hubScreen: facts.hubOwnScreen,
    passwordSet: await isAuthEnabled(),
  });
  return made ? buildWallCookie(made.cookieValue, request) : null;
}
