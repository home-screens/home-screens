import { NextResponse, type NextRequest } from 'next/server';
import { isValidDisplayId, MAIN_DISPLAY_ID } from '@/lib/display-filter';
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
  return permitted ? null : notAdopted(displayId);
}

/** What `?display=` on a request from a Pi's shell layer turned out to be. */
export type AdoptedDisplayQuery =
  | { ok: true; displayId: string }
  /** No `?display`, or one that is not shaped like a display id. */
  | { ok: false; reason: 'invalid' }
  /** A well-formed id the hub has not adopted. */
  | { ok: false; reason: 'not-adopted'; displayId: string };

/**
 * Read `?display=<id>` and run both checks on it: the id's shape, then
 * `requireAdoptedDisplay`. Answers with a reason, not a response, because
 * the callers do not all speak JSON: the bootstrap's answer is piped into
 * bash and has to refuse in shell. `adoptedDisplayRefusal` is the JSON one.
 */
export async function adoptedDisplayFromQuery(request: NextRequest): Promise<AdoptedDisplayQuery> {
  const displayId = request.nextUrl.searchParams.get('display');
  if (!displayId || !isValidDisplayId(displayId)) return { ok: false, reason: 'invalid' };
  const adopted = await getAdoptedDisplayIds();
  const permitted = adopted ? adopted.includes(displayId) : displayId === MAIN_DISPLAY_ID;
  return permitted ? { ok: true, displayId } : { ok: false, reason: 'not-adopted', displayId };
}

function notAdopted(displayId: string): NextResponse {
  return NextResponse.json(
    { error: `Display '${displayId}' is not adopted. Adopt it from the hub first.` },
    { status: 403 },
  );
}

/** The JSON answer for a query `adoptedDisplayFromQuery` turned down. */
export function adoptedDisplayRefusal(refused: Exclude<AdoptedDisplayQuery, { ok: true }>): NextResponse {
  if (refused.reason === 'invalid') return NextResponse.json({ error: 'Invalid or missing display' }, { status: 400 });
  return notAdopted(refused.displayId);
}
