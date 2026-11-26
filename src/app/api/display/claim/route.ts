import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasSignedInSession, isAuthEnabled, wallFromCookies } from '@/lib/auth';
import { createRateLimiter, publicErrorResponse, getClientIP, parseJsonBody } from '@/lib/api-utils';
import { admitWithoutAsking } from '@/lib/display-admission';
import { drainCommands, recordViewportReport } from '@/lib/display-commands';
import { isValidDisplayId } from '@/lib/display-filter';
import { WALL_COOKIE, askAgainAs, buildWallCookie, cookieNamesRemovedWall, createWall, letWallIn, touchWall } from '@/lib/display-walls';
import { admissionFacts } from '@/lib/wall-admission-facts';
import { isWallPageRequest } from '@/lib/wall-request';

export const dynamic = 'force-dynamic';

// A waiting wall asks every 5 s. This leaves room for a few behind one
// address and stops a loop from hammering the walls file.
const limiter = createRateLimiter(90, 60_000);

interface ClaimBody {
  displayId?: unknown;
  width?: unknown;
  height?: unknown;
  /** The page was told it is let in, reloaded, and is asking again. */
  again?: unknown;
}

type ClaimStatus = 'in' | 'waiting' | 'no-cookie';

function answer(status: ClaimStatus, cookie?: string | null): NextResponse {
  return NextResponse.json({ status }, cookie ? { headers: { 'Set-Cookie': cookie } } : undefined);
}

/**
 * A wall page with no cookie asks to be let in.
 *
 * Public, because the caller has nothing to prove itself with yet: that is
 * the point. What it can get here is decided by `admitWithoutAsking`. The
 * hub's own screen, a device on an allowed network, and (in the days after
 * the update) an existing display's wall are let in at once. Anything else
 * is given a cookie that is marked as waiting, which opens nothing until a
 * grown-up clicks Let in. Later calls find the caller by that cookie alone,
 * so letting one wall in can never let in another that asked for the same
 * display.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await parseJsonBody<ClaimBody>(request);
    if (body instanceof NextResponse) return body;

    const displayId = typeof body.displayId === 'string' && body.displayId ? body.displayId : undefined;
    if (displayId !== undefined && !isValidDisplayId(displayId)) {
      return NextResponse.json({ error: 'Invalid display' }, { status: 400 });
    }

    // No password: every browser may show the wall, and the heartbeat hands
    // out the cookie.
    if (!(await isAuthEnabled())) return answer('in');

    const cookieHeader = request.headers.get('cookie') ?? '';
    const wall = await wallFromCookies(cookieHeader);
    if (wall?.status === 'in') return answer('in');
    if (await hasSignedInSession(request)) return answer('in');

    if (!isWallPageRequest(request)) {
      return NextResponse.json({ error: 'Only a wall page can ask to be let in' }, { status: 400 });
    }

    const address = getClientIP(request);
    if (limiter.isLimited(address)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
    limiter.recordFailure(address);

    // The page was given a cookie a moment ago and has come back with none
    // at all. Making another would only repeat that, so say so and let the
    // page explain instead of looping. A cookie that is there but no longer
    // known is a different thing (a wall that was just removed) and waits
    // like any other.
    if (body.again === true && !cookieHeader.includes(`${WALL_COOKIE}=`)) return answer('no-cookie');

    const width = typeof body.width === 'number' ? body.width : NaN;
    const height = typeof body.height === 'number' ? body.height : NaN;
    const viewport =
      Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && width < 20_000 && height < 20_000
        ? { width: Math.round(width), height: Math.round(height) }
        : undefined;
    const userAgent = request.headers.get('user-agent') ?? '';

    const asked = displayId ?? null;
    const facts = await admissionFacts(request, displayId);
    // A browser a grown-up removed still holds its old cookie. The window
    // does not take it back: it waits to be let in by hand.
    const removed = !wall && (await cookieNamesRemovedWall(cookieHeader, true));
    // The key is the heartbeat's business; a claim never carries one.
    const via = admitWithoutAsking({ ...facts, holdsKey: false, windowOpen: facts.windowOpen && !removed });

    if (via) {
      // A window place is checked and taken inside the store, in one step,
      // for the display asked for. When they have all gone, this wall waits.
      if (wall) {
        if (await letWallIn(wall.id, via, { displayId: asked })) return answer('in');
      } else {
        const made = await createWall({ status: 'in', admittedBy: via, displayId: asked, address, userAgent, viewport, hubScreen: facts.hubOwnScreen, passwordSet: true });
        if (made) return answer('in', buildWallCookie(made.cookieValue, request));
      }
    }

    // A waiting wall keeps the display it first asked for. Asking for a
    // different one starts over: the name and whether it was new to the hub
    // are set together, from what is true now. Without this a browser could
    // ask under a made-up name, then ask as a real display, and be let in as
    // though a grown-up had just added it.
    if (wall && wall.displayId !== asked) await askAgainAs(wall, asked, !facts.displayAdopted);

    // A wall that asked under a name the hub did not know is let in once a
    // grown-up adds that display: the same one click as before.
    if (wall?.askedAsNew && facts.displayAdopted && wall.displayId === asked) {
      await letWallIn(wall.id, 'added');
      return answer('in');
    }

    // Waiting. A display the hub does not know yet is also put on the
    // editor's "waiting to be added" list, with the size of its screen.
    let waitingId: string;
    let cookie: string | null = null;
    if (wall) {
      await touchWall(wall, { address, userAgent, viewport, hubScreen: facts.hubOwnScreen });
      waitingId = wall.id;
    } else {
      const made = await createWall({
        status: 'waiting',
        displayId: displayId ?? null,
        askedAsNew: !facts.displayAdopted,
        address,
        userAgent,
        viewport,
        hubScreen: facts.hubOwnScreen,
        passwordSet: true,
      });
      if (!made) return answer('waiting');
      waitingId = made.entry.id;
      cookie = buildWallCookie(made.cookieValue, request);
    }
    if (displayId && !facts.displayAdopted) {
      drainCommands(displayId);
      if (viewport) recordViewportReport(displayId, waitingId, viewport.width, viewport.height, address);
    }
    return answer('waiting', cookie);
  } catch (error) {
    if (error instanceof Response) return error;
    return publicErrorResponse(error, 'Could not ask to be let in');
  }
}
