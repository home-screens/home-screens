import type { DisplayCommandType } from '@/lib/display-commands';
import { displayFetch } from '@/lib/display-fetch';

/**
 * The one place a display command says which wall it is for. Every surface
 * that sends one (the wall's own Display Control, the phone, the editor)
 * builds its request here, so the two spellings below never drift apart.
 *
 * A target is a display id, `'all'` for every display, or nothing for a
 * home with one display (the legacy `__default__` queue). `'self'` counts as
 * nothing on purpose: callers resolve it first (see `resolveInitialTarget`).
 */
type CommandTarget = string | null | undefined;

const named = (target: CommandTarget): target is string => !!target && target !== 'self';

/** `url` with `?display=<target>` (or `&display=`) added when there is a target. */
export function withDisplayTarget(url: string, target: CommandTarget): string {
  if (!named(target)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}display=${encodeURIComponent(target)}`;
}

/** `body` with `displayId` added when there is a target: what a POST to a display route carries. */
export function withDisplayId<T extends Record<string, unknown>>(body: T, target: CommandTarget): T & { displayId?: string } {
  return named(target) ? { ...body, displayId: target } : body;
}

/**
 * The request that queues one command.
 *
 * A command with a payload (brightness, alert, goto-screen) is a POST with a
 * JSON body, because the route reads `value` / `screen` / `displayId` from
 * the body. One without (sleep, wake, next-screen, prev-screen, reload,
 * clear-alerts) carries its target as `?display=`, and is a GET unless
 * `method` says otherwise, so it stays bookmarkable from phones, Home
 * Assistant and curl.
 */
export function displayCommandRequest(
  type: DisplayCommandType,
  target: CommandTarget,
  payload?: Record<string, unknown>,
  method: 'GET' | 'POST' = 'GET',
): { url: string; init: RequestInit } {
  if (payload && Object.keys(payload).length > 0) {
    return {
      url: `/api/display/${type}`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withDisplayId(payload, target)),
      },
    };
  }
  return { url: withDisplayTarget(`/api/display/${type}`, target), init: { method } };
}

/**
 * Fire a command at the hub's display-command queue. Fire-and-forget.
 *
 * Uses `displayFetch` so the display's Bearer token auto-attaches when this
 * runs inside the display page; elsewhere it falls through to plain `fetch`
 * and relies on the session cookie. The phone and the editor send the same
 * request through `editorFetch`, because they need to hear a failure.
 *
 * Fetch rejections are swallowed (the hub queue is fire-and-forget; no
 * delivery ACK is available, so there's nothing actionable to surface).
 */
export async function dispatchDisplayCommand(
  target: string | undefined,
  type: DisplayCommandType,
  payload?: Record<string, unknown>,
): Promise<void> {
  const { url, init } = displayCommandRequest(type, target, payload);
  await displayFetch(url, init).catch(() => {});
}
