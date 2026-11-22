import { NextResponse } from 'next/server';
import { hasSignedInSession } from './auth';
import { asksForCode, GROWN_UP_HEADER, type GrownUpAction } from './grown-up-code';
import { isGrownUpUnlock, readGrownUpStatus } from './grown-up-code-data';

/**
 * The hub's half of the grown-up code: null when `action` may go ahead, or
 * the 403 to answer with. It goes ahead when no code is set, when this job is
 * not ticked, when a grown-up is signed in (a session, which only exists with
 * a password set), or when the request carries a live unlock in
 * `x-hs-grown-up`. Checked here, not on the page, because the kid routes take
 * writes from anything on the network: a check on the wall alone would be
 * skipped by walking to the family tablet.
 */
export async function requireGrownUp(request: Request, action: GrownUpAction): Promise<Response | null> {
  const status = await readGrownUpStatus();
  if (!asksForCode(status, action)) return null;
  if (await hasSignedInSession(request)) return null;
  const token = request.headers.get(GROWN_UP_HEADER);
  if (token && await isGrownUpUnlock(token)) return null;
  return NextResponse.json(
    { error: 'This needs the grown-up code.', needsGrownUpCode: true, action },
    { status: 403 },
  );
}
