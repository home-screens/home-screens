/**
 * Stable per-tab client identifier for display clients.
 *
 * Each browser tab running at `/display/<id>` (or `DisplayNotFound`) gets
 * its own `clientId`, which is included in every status POST so the hub
 * can distinguish "two things reporting under the same display ID" from
 * "one thing reporting". The ID lives in `sessionStorage`, so it survives
 * reloads of the same tab but every new tab (or hard reopen) gets a fresh
 * value — which is the desired shape: one tab == one reporter.
 *
 * Without this, `/api/displays` would see the hub's statusMap overwritten
 * by whichever client POSTed most recently, and the editor's
 * "reported by display" hint would flap between values with no indication
 * that multiple clients were in play.
 */

const KEY = 'home-screens:display-client-id';

/**
 * Return the tab's client ID, generating (and persisting) one on first
 * call. Falls back to an in-memory placeholder on SSR / pre-window
 * contexts so callers never have to null-check.
 */
export function getDisplayClientId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = window.sessionStorage.getItem(KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : // Fallback for ancient browsers without crypto.randomUUID
          `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // sessionStorage can throw in private-mode Safari or similar — fall
    // back to a per-module-load random ID so we at least don't crash.
    return `vol-${Math.random().toString(36).slice(2, 12)}`;
  }
}
