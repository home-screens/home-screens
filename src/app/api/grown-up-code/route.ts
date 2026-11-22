import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseJsonBody, publicErrorResponse, SMALL_BODY_BYTES, withAuth } from '@/lib/api-utils';
import { audit } from '@/lib/audit';
import { hasSignedInSession } from '@/lib/auth';
import { cleanGrownUpActions, cleanUnlockMinutes, isGrownUpCode } from '@/lib/grown-up-code';
import { readGrownUpStatus, removeGrownUpCode, setGrownUpCode, updateGrownUpPrefs } from '@/lib/grown-up-code-data';

export const dynamic = 'force-dynamic';

/**
 * GET — whether a grown-up code is set, which jobs ask for it, how long a
 * right code unlocks, and whether the page asking is a signed-in grown-up
 * (who is never asked). Public on the LAN: the wall and the kids' chores page
 * label their buttons from it, and it never carries the code.
 */
export const GET = async (request: NextRequest) => {
  try {
    // Whether this page would be asked: a signed-in grown-up never is.
    const signedIn = await hasSignedInSession(request);
    return NextResponse.json({ ...(await readGrownUpStatus()), signedIn }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return publicErrorResponse(error, 'Failed to read the grown-up code');
  }
};

/**
 * PUT — a signed-in grown-up sets or changes the code (`code`), or changes
 * what it guards (`actions`) and how long it unlocks (`unlockMinutes`).
 */
export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ code?: unknown; actions?: unknown; unlockMinutes?: unknown }>(request, { maxBytes: SMALL_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  if (body.code !== undefined && !isGrownUpCode(body.code)) {
    return NextResponse.json({ error: 'The code must be four numbers.', code: 'bad_code' }, { status: 400 });
  }
  const actions = body.actions === undefined ? undefined : cleanGrownUpActions(body.actions);
  if (actions === null) return NextResponse.json({ error: 'actions must be a list.' }, { status: 400 });
  const unlockMinutes = body.unlockMinutes === undefined ? undefined : cleanUnlockMinutes(body.unlockMinutes);
  if (unlockMinutes === null) return NextResponse.json({ error: 'unlockMinutes must be 1, 5 or 15.' }, { status: 400 });

  if (isGrownUpCode(body.code)) {
    await setGrownUpCode(body.code);
    audit({ action: 'grown_up_code_set' });
  }
  if (actions !== undefined || unlockMinutes !== undefined) {
    const status = await updateGrownUpPrefs({ actions, unlockMinutes });
    if (!status) return NextResponse.json({ error: 'Set a code first.', code: 'no_code' }, { status: 409 });
  }
  return NextResponse.json(await readGrownUpStatus());
}, 'Failed to save the grown-up code');

/** DELETE — a signed-in grown-up removes the code; nothing asks for it any more. */
export const DELETE = withAuth(async () => {
  await removeGrownUpCode();
  audit({ action: 'grown_up_code_removed' });
  return NextResponse.json(await readGrownUpStatus());
}, 'Failed to remove the grown-up code');
