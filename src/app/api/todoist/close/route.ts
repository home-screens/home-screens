import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchWithTimeout, requireSecret, withDisplayAuth } from '@/lib/api-utils';
import { cache as todoistCache } from '@/app/api/todoist/route';

export const dynamic = 'force-dynamic';

const TODOIST_API = 'https://api.todoist.com/api/v1';
const TASK_ID_RE = /^[A-Za-z0-9]+$/;

// Display-auth: accepts a logged-in session OR the display's Bearer token, so
// the kiosk can close tasks without a login but LAN strangers can't mutate the
// user's external Todoist account. Stronger than /api/chores because this
// endpoint causes irreversible-from-here side effects on a third-party service.
export const POST = withDisplayAuth(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const taskId = typeof body.taskId === 'string' ? body.taskId : '';

  if (!taskId || !TASK_ID_RE.test(taskId)) {
    return NextResponse.json({ error: 'Invalid taskId' }, { status: 400 });
  }

  const token = await requireSecret('todoist_token', 'Todoist');
  if (token instanceof NextResponse) return token;

  const res = await fetchWithTimeout(`${TODOIST_API}/tasks/${taskId}/close`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return NextResponse.json(
      { error: 'Failed to close Todoist task', detail },
      { status: res.status === 401 || res.status === 403 ? res.status : 502 },
    );
  }

  todoistCache.clear();

  return NextResponse.json({ ok: true });
}, 'Failed to close Todoist task');
