import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readUpdateNotificationState, writeUpdateNotificationState } from '@/lib/update-notification-state';
import { withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async () => {
  const state = await readUpdateNotificationState();
  return NextResponse.json(state);
}, 'Failed to read update notification state');

export const POST = withDisplayAuth(async (request: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
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

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}, 'Failed to update update notification state');
