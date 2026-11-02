import { timeoutSignal } from './display-fetch';
import { HUB_REQUEST_TIMEOUT_MS, HubUnreachableError } from './hub-request';

const SESSION_EXPIRED_MESSAGE = 'Session expired';

export interface EditorFetchInit extends RequestInit {
  /**
   * Milliseconds before the request counts as the hub not answering. Defaults
   * to `HUB_REQUEST_TIMEOUT_MS`; a request the hub takes longer over by design
   * (joining a WiFi network, installing a plugin) passes its own, and `null`
   * leaves one unbounded that must stay open.
   */
  timeoutMs?: number | null;
}

/**
 * Centralized fetch wrapper for any authenticated client call.
 * Intercepts 401 responses and redirects to the login page.
 * Must be used instead of raw fetch() in editor and /remote components so an
 * expired session surfaces as a login redirect instead of silent UI breakage.
 *
 * Every request has a deadline, so a phone on a weak signal does not hold a
 * write open for minutes with its change looking saved. A dropped connection
 * or a missed deadline rejects with `HubUnreachableError`; the caller's own
 * cancel rejects as it always did. The deadline also covers the answer's
 * body, and `readJson` turns a body it cut off into `HubUnreachableError`.
 */
export async function editorFetch(url: string, options?: EditorFetchInit): Promise<Response> {
  const { timeoutMs = HUB_REQUEST_TIMEOUT_MS, ...init } = options ?? {};
  let res: Response;
  try {
    res = await fetch(url, timeoutMs === null
      ? init
      : { ...init, signal: timeoutSignal(timeoutMs, init.signal, () => new HubUnreachableError()) });
  } catch (err) {
    if (init.signal?.aborted) throw err;
    throw new HubUnreachableError();
  }
  if (res.status === 401) throw sessionExpired();
  return res;
}

/**
 * Send the page to the login screen, and hand back the error `editorFetch`
 * throws for it, for the requests that cannot go through `editorFetch` (an
 * upload that reports its progress runs on XMLHttpRequest).
 */
export function sessionExpired(): Error {
  const from = window.location.pathname + window.location.search;
  window.location.href = `/login?from=${encodeURIComponent(from)}`;
  return new Error(SESSION_EXPIRED_MESSAGE);
}

/** True when an error was thrown by editorFetch in response to a 401.
 *  Use in catch blocks to skip user-facing error UI while the redirect lands. */
export function isSessionExpired(e: unknown): boolean {
  return e instanceof Error && e.message === SESSION_EXPIRED_MESSAGE;
}

/**
 * Convert a non-2xx response into a rejection.
 *
 * `editorFetch` resolves normally for every status except 401, so any caller
 * that relies on promise rejection to detect failure — notably
 * `useDebouncedSave`, which only routes a *rejected* promise to `onError` —
 * silently treats a 500 as success. Chain this to opt into rejection:
 *
 *     editorFetch(url, { method: 'PUT', ... }).then(throwIfNotOk)
 */
export function throwIfNotOk(res: Response): Response {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}
