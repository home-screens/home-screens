/**
 * The device-code grant's token answers (RFC 8628 section 3.5), sorted by
 * what the poll loop does next. Every sign-in that shows a code to type on
 * another device (Google Calendar, OneDrive, OAuth2 plugins) reads its token
 * endpoint through this one rule, so a blip is a blip on all of them: the
 * provider being busy or down, or not answering at all, keeps the flow
 * pending for as long as the code lives, and only the provider's own words
 * end it. Dependency-free, so the editor's poll loop can share the slow-down
 * step.
 */

export type DeviceTokenAnswer =
  /** A 2xx with no error code; the provider decides what a token looks like. */
  | { kind: 'granted'; tokens: Record<string, unknown> }
  | { kind: 'pending' }
  /** Pending, and the provider wants polls spaced further apart. */
  | { kind: 'slowDown' }
  | { kind: 'expired' }
  /**
   * The sign-in ended at the provider. `declined` when the person said no
   * there; otherwise `detail` carries the provider's reason (a client that
   * does not exist, a scope it refuses), which no retry will change.
   */
  | { kind: 'denied'; declined: boolean; detail?: string }
  /** Busy, down, or no answer at all; poll again as if pending. */
  | { kind: 'transient' };

/** How much longer to wait between polls after a `slow_down` (RFC 8628 section 3.5). */
export const SLOW_DOWN_STEP_MS = 5000;

/**
 * One poll answer, by status and parsed body. A `status` of 0 means no
 * answer came back at all (the request failed or timed out).
 */
export function classifyDeviceTokenAnswer(status: number, body: unknown): DeviceTokenAnswer {
  const data: Record<string, unknown> = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const error = typeof data.error === 'string' ? data.error : '';
  const description = typeof data.error_description === 'string' && data.error_description
    ? data.error_description
    : undefined;

  // The provider's own words first: some answer them with a 400, some with
  // a 428 or a 200, and one provider's 429 is another's slow_down.
  switch (error) {
    case 'authorization_pending':
      return { kind: 'pending' };
    case 'slow_down':
      return { kind: 'slowDown' };
    case 'expired_token':
      return { kind: 'expired' };
    case 'access_denied':
    case 'authorization_declined':
      return { kind: 'denied', declined: true, detail: description };
  }
  if (status >= 200 && status < 300 && !error) return { kind: 'granted', tokens: data };
  if (status === 0 || status === 429 || status >= 500) return { kind: 'transient' };
  return { kind: 'denied', declined: false, detail: description ?? (error || undefined) };
}
