import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readUpdateNotificationState, writeUpdateNotificationState } from '@/lib/update-notification-state';
import { clearFailedUpdate } from '@/lib/upgrade-failed-state';
import { withAuth, withDisplayAuth, parseJsonBody, SMALL_BODY_BYTES } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async () => {
  const state = await readUpdateNotificationState();
  return NextResponse.json(state);
}, 'Failed to read update notification state');

// Only the editor and the phone dismiss these notices, so a wall's display
// token must not be able to hide an update or a failed-update line.
export const POST = withAuth(async (request: NextRequest) => {
  const parsed = await parseJsonBody<Record<string, unknown> | null>(request, { maxBytes: SMALL_BODY_BYTES });
  if (parsed instanceof NextResponse) return parsed;
  const body = parsed ?? {};
  const { action, version } = body;

  if (action === 'dismiss') {
    if (typeof version !== 'string' || version.trim().length === 0 || version.length > 64) {
      return NextResponse.json({ error: 'Invalid version' }, { status: 400 });
    }
    const state = await readUpdateNotificationState();
    state.lastDismissedVersion = version;
    await writeUpdateNotificationState(state);
    return NextResponse.json(state);
  }

  // The System page's "an update was undone" line, dismissed.
  if (action === 'clearFailedUpdate') {
    await clearFailedUpdate();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}, 'Failed to update update notification state');
