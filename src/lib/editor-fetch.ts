const SESSION_EXPIRED_MESSAGE = 'Session expired';

/**
 * Centralized fetch wrapper for any authenticated client call.
 * Intercepts 401 responses and redirects to the login page.
 * Must be used instead of raw fetch() in editor and /remote components so an
 * expired session surfaces as a login redirect instead of silent UI breakage.
 */
export async function editorFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status === 401) {
    const from = window.location.pathname + window.location.search;
    window.location.href = `/login?from=${encodeURIComponent(from)}`;
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  return res;
}

/** True when an error was thrown by editorFetch in response to a 401.
 *  Use in catch blocks to skip user-facing error UI while the redirect lands. */
export function isSessionExpired(e: unknown): boolean {
  return e instanceof Error && e.message === SESSION_EXPIRED_MESSAGE;
}
