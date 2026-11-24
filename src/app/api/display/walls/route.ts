import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAuthEnabled } from '@/lib/auth';
import { parseJsonBody, withAuth } from '@/lib/api-utils';
import { audit } from '@/lib/audit';
import { getClientIP } from '@/lib/api-utils';
import { CHANGEOVER_WINDOW_MS, isWindowOpen } from '@/lib/display-admission';
import { OPEN_DOOR_FORGET_MS, WallRemovalNotSavedError, letWallIn, readWalls, removeWall, type WallEntry } from '@/lib/display-walls';

export const dynamic = 'force-dynamic';

/** A wall as the editor lists it. The secret's hash never leaves the hub. */
function describe(wall: WallEntry, all: WallEntry[]) {
  return {
    id: wall.id,
    status: wall.status,
    displayId: wall.displayId,
    address: wall.address,
    userAgent: wall.userAgent,
    viewport: wall.viewport ?? null,
    lastSeenAt: wall.lastSeenAt,
    createdAt: wall.createdAt,
    /** Let in by itself in the days after the update, which is worth a grown-up's glance. */
    letInByItself: wall.admittedBy === 'window',
    hubScreen: wall.admittedBy === 'hub-screen',
    /**
     * A waiting browser at the same address, describing itself the same way,
     * as a wall that is already let in: most likely that wall after its
     * browser lost its place. A hint for the row, not a reason to let it in.
     */
    looksFamiliar:
      wall.status === 'waiting' && all.some((w) => w.status === 'in' && w.address === wall.address && w.userAgent === wall.userAgent),
  };
}

/**
 * The walls this hub has let in and the ones waiting, for the editor.
 * `passwordSet: false` means every browser is let in and the lists mean
 * nothing, so none are sent, only how many are showing.
 */
export const GET = withAuth(async () => {
  const passwordSet = await isAuthEnabled();
  const snapshot = await readWalls(passwordSet);
  const now = Date.now();
  if (!passwordSet) {
    // How many walls are showing right now: what the set-a-password window
    // tells a grown-up will stay let in.
    const showingCount = snapshot.walls.filter((w) => w.status === 'in' && now - w.lastSeenAt <= OPEN_DOOR_FORGET_MS).length;
    return NextResponse.json({ passwordSet, windowOpen: false, windowEndsAt: null, showingCount, walls: [] });
  }
  const windowOpen = isWindowOpen(snapshot.windowStartedAt, now);
  return NextResponse.json({
    passwordSet,
    windowOpen,
    windowEndsAt: windowOpen && snapshot.windowStartedAt !== null ? snapshot.windowStartedAt + CHANGEOVER_WINDOW_MS : null,
    showingCount: snapshot.walls.filter((w) => w.status === 'in').length,
    walls: snapshot.walls.map((w) => describe(w, snapshot.walls)),
  });
}, 'Failed to read the walls');

/** Let a waiting wall in: `{ action: 'let-in', id }`. */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ action?: unknown; id?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  if (body.action !== 'let-in' || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  if (!(await letWallIn(body.id, 'let-in'))) {
    return NextResponse.json({ error: 'That wall is no longer waiting' }, { status: 404 });
  }
  audit({ action: 'wall_let_in', ip: getClientIP(request) });
  return NextResponse.json({ ok: true });
}, 'Failed to let the wall in');

/** Remove a wall: `?id=`. Its cookie stops working on its next request. */
export const DELETE = withAuth(async (request: NextRequest) => {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  try {
    if (!(await removeWall(id))) return NextResponse.json({ error: 'No such wall' }, { status: 404 });
  } catch (error) {
    // Out for now, but not saved: a restart would bring it back, so this is
    // not a success and is not recorded as one.
    if (error instanceof WallRemovalNotSavedError) return NextResponse.json({ error: error.message, code: 'not_saved' }, { status: 500 });
    throw error;
  }
  audit({ action: 'wall_removed', ip: getClientIP(request) });
  return NextResponse.json({ ok: true });
}, 'Failed to remove the wall');
