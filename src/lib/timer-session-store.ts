import { displayFetch } from './display-fetch';
import { subscribeRevisions } from './display-heartbeat';
import { subscribeTimerRefresh } from './timer-presence';
import type { TimerSession } from '@/types/timers';

/**
 * The family's timer session as this display tab last read it.
 *
 * One copy for the whole page. The full-screen takeover and every Quick Timer
 * box read it, so a tap in one is seen by the other in the same frame, and a
 * box coming back with its screen already knows what is running instead of
 * offering its lengths until the next heartbeat.
 *
 * It reads the hub once when the page first asks, when the heartbeat names a
 * session revision it has not applied (a start, pause, nudge or cancel was saved somewhere), when
 * something on this display asks (`requestTimerRefresh`), and after a press
 * made here. With nobody reading it, it holds nothing.
 */

export interface TimerSessionSnapshot {
  /** The session exactly as the hub stored it. */
  session: TimerSession | null;
  /** This display's clock when that answer was applied. */
  at: number;
}

const EMPTY: TimerSessionSnapshot = { session: null, at: 0 };

let snapshot: TimerSessionSnapshot = EMPTY;
const listeners = new Set<() => void>();

// The revision last applied. Advanced only after a successful read, so a
// failed one is tried again on the next beat.
let appliedRevision: string | null = null;
let fetchingForBeat = false;
// Reads can overlap (a beat and a press); only the newest one asked for may
// land, or a slow answer would put an older session back on the screen.
let readsAsked = 0;
let stopFeeds: (() => void) | null = null;

export function getTimerSessionSnapshot(): TimerSessionSnapshot {
  return snapshot;
}

export function getEmptyTimerSessionSnapshot(): TimerSessionSnapshot {
  return EMPTY;
}

/** Read the session now. Resolves true once the answer is applied. */
export async function refreshTimerSession(): Promise<boolean> {
  const asked = ++readsAsked;
  try {
    const res = await displayFetch('/api/timers/session');
    if (!res.ok) return false;
    const json = (await res.json()) as { session: TimerSession | null };
    if (asked !== readsAsked) return false;
    snapshot = { session: json.session, at: Date.now() };
    for (const fn of listeners) fn();
    return true;
  } catch {
    // Keep the last known session: the countdown is worked out here from its
    // timestamps, so a hub blip cannot strand a stale timer on the screen.
    return false;
  }
}

function startFeeds(): void {
  const stopBeats = subscribeRevisions(({ timer }) => {
    if (timer === undefined || timer === appliedRevision || fetchingForBeat) return;
    fetchingForBeat = true;
    void refreshTimerSession().then((applied) => {
      fetchingForBeat = false;
      if (applied) appliedRevision = timer;
    });
  });
  const stopAsks = subscribeTimerRefresh(() => { void refreshTimerSession(); });
  stopFeeds = () => {
    stopBeats();
    stopAsks();
  };
  // A page that has just loaded reads once without waiting for its first
  // heartbeat, which can be seconds away: until then a box would offer its
  // lengths over a timer that is already running.
  void refreshTimerSession();
}

export function subscribeTimerSession(fn: () => void): () => void {
  listeners.add(fn);
  if (!stopFeeds) startFeeds();
  return () => {
    listeners.delete(fn);
    if (listeners.size > 0) return;
    stopFeeds?.();
    stopFeeds = null;
    snapshot = EMPTY;
    appliedRevision = null;
    fetchingForBeat = false;
    readsAsked += 1;
  };
}
