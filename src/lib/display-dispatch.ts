import type { DisplayCommandType } from '@/lib/display-commands';

/**
 * Fire a command at the hub's display-command queue. Fire-and-forget:
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
  const url = buildDisplayCommandUrl(type, target, payload);
  await fetch(url, { method: 'GET' }).catch(() => {});
}

export function buildDisplayCommandUrl(
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
