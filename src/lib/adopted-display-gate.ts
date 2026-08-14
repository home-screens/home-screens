import { NextResponse } from 'next/server';
import { MAIN_DISPLAY_ID } from '@/lib/display-filter';
import { getAdoptedDisplayIds } from '@/lib/adopted-display-cache';

/**
 * Adoption-as-authorization gate for the endpoints a display-only Pi's shell
 * layer talks to (`/api/display/hw-stats`, `/api/display/kiosk-bundle`,
 * `/api/display/kiosk-bootstrap`).
 *
 * These callers are bash scripts running on a different Pi, so they cannot
 * reasonably carry a display bearer token the way the browser heartbeat does.
 * Instead the displayId must appear in `config.displays` — or be the literal
 * `main` in legacy single-display mode. The LAN is the trust boundary, the
 * same implicit posture the display-page SSR already relies on.
 *
 * Returns a 403 `NextResponse` to return directly, or `null` when the caller
 * may proceed. Callers should validate the id's shape with `isValidDisplayId`
 * before calling this — that check is about input hygiene, this one is about
 * authorization.
 */
export async function requireAdoptedDisplay(displayId: string): Promise<NextResponse | null> {
  const adopted = await getAdoptedDisplayIds();
  const permitted = adopted ? adopted.includes(displayId) : displayId === MAIN_DISPLAY_ID;
  if (permitted) return null;
  return NextResponse.json(
    { error: `Display '${displayId}' is not adopted. Adopt it from the hub first.` },
    { status: 403 },
  );
}
