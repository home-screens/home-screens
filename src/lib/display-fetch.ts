/**
 * Authenticated fetch wrapper for the display client.
 *
 * The display page reads the display token server-side from auth.json and
 * passes it as a prop to ScreenRotator, which calls setDisplayToken() once
 * on mount. All subsequent display-side fetches use displayFetch() to
 * automatically include the Authorization: Bearer header.
 *
 * When auth is disabled (token is null), fetches are made without the header.
 */

let token: string | null = null;

/** Called once by ScreenRotator on mount with the server-provided token. */
export function setDisplayToken(t: string | null) {
  token = t;
}

/** Fetch wrapper that injects the display Bearer token. */
export function displayFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (!token) return fetch(input, init);

  const headers = new Headers(init?.headers);
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
