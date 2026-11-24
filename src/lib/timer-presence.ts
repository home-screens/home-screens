import { readRemembered, remember } from './device-memory';

/**
 * Which timer session this display tab is showing, if any, a nudge to read
 * the session again now, and the finished timer this wall was told to put
 * away.
 *
 * A session is on the screen in one of two ways: `TimerOverlay` covers the
 * display with it, or a Quick Timer box set to keep its timer draws it in
 * place. Both write here and the status heartbeat reads it, so the remote can
 * say "Showing on Kitchen" from a display's own report rather than from the
 * session's target list. Module-level because the overlay, the boxes and the
 * reporter are separate pieces mounted by the same display page, exactly
 * like the shared-state bus.
 */

let overlaySessionId: string | null = null;
/** One entry per Quick Timer box drawing a session in place, by the box. */
const boxSessions = new Map<object, string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

/** The session a Quick Timer box on this screen is drawing in place, if one is. */
export function getBoxTimerSession(): string | null {
  for (const id of boxSessions.values()) return id;
  return null;
}

export function getShowingTimerSession(): string | null {
  return overlaySessionId ?? getBoxTimerSession();
}

/** `TimerOverlay` only: the session covering this display, or null. */
export function setShowingTimerSession(id: string | null): void {
  if (id === overlaySessionId) return;
  overlaySessionId = id;
  notify();
}

/** A Quick Timer box: the session it is drawing in place, or null when it stops. */
export function setBoxTimerSession(box: object, id: string | null): void {
  if ((boxSessions.get(box) ?? null) === id) return;
  if (id === null) boxSessions.delete(box);
  else boxSessions.set(box, id);
  notify();
}

export function subscribeTimerPresence(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The finished timer this wall's "Time's up!" was tapped away for. */
const TIMES_UP_DISMISSED_KEY = 'hs-wall-times-up-dismissed';
let dismissedSessionId: string | null | undefined;

/**
 * The finished session somebody closed "Time's up!" for on this wall. Kept on
 * the wall, so a reload (an update, a power blip) does not bring it back, and
 * shared by the takeover and the boxes, so one put away in a box does not
 * come back full screen when the screen moves on.
 */
export function getDismissedTimesUp(): string | null {
  // Read once: storage that cannot be written (private mode, switched off)
  // must still let a tap close "Time's up!" for as long as the page is open.
  if (dismissedSessionId === undefined) dismissedSessionId = readRemembered(TIMES_UP_DISMISSED_KEY);
  return dismissedSessionId;
}

export function dismissTimesUp(sessionId: string): void {
  dismissedSessionId = sessionId;
  remember(TIMES_UP_DISMISSED_KEY, sessionId);
  notify();
}

const refreshListeners = new Set<() => void>();

/**
 * Something on this display just changed the timer session (the Timers sheet
 * started one): read it now instead of on the next heartbeat, so the takeover
 * follows the tap at once rather than up to three seconds later.
 */
export function requestTimerRefresh(): void {
  for (const fn of refreshListeners) fn();
}

/** `TimerOverlay` listens here for `requestTimerRefresh`. */
export function subscribeTimerRefresh(fn: () => void): () => void {
  refreshListeners.add(fn);
  return () => {
    refreshListeners.delete(fn);
  };
}

/** Test-only reset. */
export function __resetTimerPresenceForTests(): void {
  overlaySessionId = null;
  dismissedSessionId = undefined;
  boxSessions.clear();
  listeners.clear();
  refreshListeners.clear();
}
