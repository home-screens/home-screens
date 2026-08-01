import type { DisplayCommandType } from '@/lib/display-commands';
import { displayFetch } from '@/lib/display-fetch';

/**
 * Fire a command at the hub's display-command queue. Fire-and-forget.
 *
 * Uses `displayFetch` so the display's Bearer token auto-attaches when this
 * runs inside the display page; elsewhere (editor, /remote) it falls through
 * to plain `fetch` and relies on the session cookie.
 *
 * - `target === undefined | '' | 'self'` → no `?display=` param → dispatches
 *   to the legacy `__default__` queue. `'self'` is treated as unresolved on
 *   purpose; callers are expected to resolve it upstream via resolveInitialTarget.
 * - `target === 'all'` → `?display=all` → hub fans out to every known display.
 * - `target === '<slug>'` → `?display=<slug>` → single queue.
 *
 * Fetch rejections are swallowed (the hub queue is fire-and-forget; no
 * delivery ACK is available, so there's nothing actionable to surface).
 */
export async function dispatchDisplayCommand(
  target: string | undefined,
  type: DisplayCommandType,
  payload?: Record<string, unknown>,
): Promise<void> {
  // Commands carrying a payload (brightness, alert) require POST with a JSON
  // body — the API route reads `value`/`displayId` from the body, not the
  // query string. Simple commands (sleep, wake, next-screen, prev-screen,
  // reload, clear-alerts) are enqueued via GET with `?display=` so they stay
  // bookmarkable from phones / Home Assistant / curl.
  if (payload && Object.keys(payload).length > 0) {
    const body: Record<string, unknown> = { ...payload };
    if (target && target !== 'self') body.displayId = target;
    await displayFetch(`/api/display/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
    return;
  }
  const url = buildDisplayCommandUrl(type, target);
  await displayFetch(url, { method: 'GET' }).catch(() => {});
}

function buildDisplayCommandUrl(
  type: DisplayCommandType,
  target?: string,
  payload?: Record<string, unknown>,
): string {
  const params = new URLSearchParams();
  if (target && target !== 'self') {
    params.set('display', target);
  }
  if (payload) {
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) continue;
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `/api/display/${type}?${qs}` : `/api/display/${type}`;
}
