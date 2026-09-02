/**
 * Which timer session this display tab is showing full-screen, if any.
 *
 * Written by `TimerOverlay` (the only thing that decides whether a session
 * is on this screen) and read by the status heartbeat, so the remote can say
 * "Showing on Kitchen" from a display's own report rather than from the
 * session's target list. Module-level because the overlay and the reporter
 * are separate hooks mounted by the same display page, exactly like the
 * shared-state bus.
 */

let showingSessionId: string | null = null;
const listeners = new Set<() => void>();

export function getShowingTimerSession(): string | null {
  return showingSessionId;
}

export function setShowingTimerSession(id: string | null): void {
  if (id === showingSessionId) return;
  showingSessionId = id;
  for (const fn of listeners) fn();
}

export function subscribeTimerPresence(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Test-only reset. */
export function __resetTimerPresenceForTests(): void {
  showingSessionId = null;
  listeners.clear();
}
