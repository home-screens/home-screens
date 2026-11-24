'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { materializeSession } from '@/lib/timer-logic';
import {
  getEmptyTimerSessionSnapshot,
  getTimerSessionSnapshot,
  refreshTimerSession,
  subscribeTimerSession,
} from '@/lib/timer-session-store';
import type { MaterializedTimerSession, TimerSession } from '@/types/timers';

/** How often a display that is showing a running session recomputes the countdown. */
export const TIMER_TICK_MS = 250;

export interface TimerSessionState {
  /** The session exactly as the hub stored it, for target matching. */
  session: TimerSession | null;
  /** Elapsed steps advanced, holds surfaced, expiry applied. Ticks locally. */
  live: MaterializedTimerSession | null;
  now: number;
  /** The hub has answered at least once, so "no session" means there is none. */
  loaded: boolean;
  /** Re-read the session now. Resolves true once the answer is applied. */
  refresh: () => Promise<boolean>;
}

const noSubscription = () => () => {};

/**
 * The running timer session, as a wall sees it.
 *
 * The session itself is the page's one copy (`timer-session-store`); this
 * hook adds the clock. The countdown is derived here from the session's epoch
 * timestamps, so beat latency affects only how fast a change appears, never
 * countdown accuracy.
 *
 * `tickMs` says how often this caller needs the clock while the session is
 * what it is: a number of milliseconds, or null when it is not drawing it (a
 * display the session does not target, a finished timer nobody is shown).
 * It is called with the materialized session and its answer is reduced to a
 * session id and an interval, so an inline arrow is fine.
 *
 * `enabled: false` reads nothing: the editor draws modules as a preview, and
 * a preview must not follow the kitchen wall's timer.
 */
export function useTimerSession(
  tickMs: (live: MaterializedTimerSession) => number | null,
  enabled = true,
): TimerSessionState {
  const snapshot = useSyncExternalStore(
    enabled ? subscribeTimerSession : noSubscription,
    enabled ? getTimerSessionSnapshot : getEmptyTimerSessionSnapshot,
    getEmptyTimerSessionSnapshot,
  );
  const [ticked, setTicked] = useState(() => Date.now());
  // A session that arrives while nothing was ticking is read against the
  // moment it arrived, not against a clock last moved when the page loaded.
  const now = Math.max(ticked, snapshot.at);
  const session = snapshot.session;

  const live: MaterializedTimerSession | null = useMemo(
    () => materializeSession(session, now),
    [session, now],
  );

  // Keyed on the session id, not `live`: materialization returns a fresh
  // object every tick, which would tear down and rebuild this interval 4x/s.
  // The tick stops once the session expires here. The hub keeps the finished
  // session on file, so no new revision (and no read) ever arrives to clear
  // it.
  const interval = live ? tickMs(live) : null;
  const tickingSessionId = live && interval !== null ? live.id : null;
  useEffect(() => {
    if (!tickingSessionId || interval === null) return;
    const id = setInterval(() => setTicked(Date.now()), interval);
    return () => clearInterval(id);
  }, [tickingSessionId, interval]);

  return { session, live, now, loaded: !enabled || snapshot.at > 0, refresh: refreshTimerSession };
}
