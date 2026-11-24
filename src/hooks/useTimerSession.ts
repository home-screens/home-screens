'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { displayFetch } from '@/lib/display-fetch';
import { subscribeRevisions } from '@/lib/display-heartbeat';
import { materializeSession } from '@/lib/timer-logic';
import type { MaterializedTimerSession, TimerSession } from '@/types/timers';

/** How often a display that is showing a session recomputes the countdown. */
export const TIMER_TICK_MS = 250;

export interface TimerSessionState {
  /** The session exactly as the hub stored it, for target matching. */
  session: TimerSession | null;
  /** Elapsed steps advanced, holds surfaced, expiry applied. Ticks locally. */
  live: MaterializedTimerSession | null;
  now: number;
  /** Re-read the session now. Resolves true once the answer is applied. */
  refresh: () => Promise<boolean>;
}

/**
 * The running timer session, as a wall sees it.
 *
 * Fetches when the heartbeat names a session revision this display has not
 * applied (a start, pause, nudge or cancel was saved somewhere) and derives
 * the countdown locally from the session's epoch timestamps, so beat latency
 * affects only how fast a change appears, never countdown accuracy.
 *
 * `shouldTick` decides whether this caller is actually showing the session:
 * a display the session does not target, or a module whose screen is not up,
 * skips the 4-per-second interval entirely. It is called with the
 * materialized session, and its answer is reduced to a session id, so an
 * inline arrow is fine — the interval restarts only when that id changes.
 *
 * Shared by the full-screen takeover and the Quick Timer module, which must
 * never disagree about what is running.
 */
export function useTimerSession(
  shouldTick: (live: MaterializedTimerSession) => boolean,
): TimerSessionState {
  const [session, setSession] = useState<TimerSession | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const res = await displayFetch('/api/timers/session');
      if (!res.ok) return false;
      const json = (await res.json()) as { session: TimerSession | null };
      setSession(json.session);
      setNow(Date.now());
      return true;
    } catch {
      // Keep the last known session — local materialization still advances
      // and expires it, so a hub blip can't strand a stale takeover.
      return false;
    }
  }, []);

  // The session revision last applied. Advanced only after a successful
  // fetch, so a failed one is retried on the next beat.
  const appliedRevisionRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);
  useEffect(() => subscribeRevisions(({ timer }) => {
    if (timer === undefined || timer === appliedRevisionRef.current || fetchingRef.current) return;
    fetchingRef.current = true;
    void refresh().then((applied) => {
      fetchingRef.current = false;
      if (applied) appliedRevisionRef.current = timer;
    });
  }), [refresh]);

  const live: MaterializedTimerSession | null = useMemo(
    () => materializeSession(session, now),
    [session, now],
  );

  // Keyed on the session id, not `live`: materialization returns a fresh
  // object every tick, which would tear down and rebuild this interval 4x/s.
  // The tick stops once the session expires here — the hub keeps the finished
  // session on file, so no new revision (and no fetch) ever arrives to clear
  // it.
  const tickingSessionId = live && shouldTick(live) ? live.id : null;
  useEffect(() => {
    if (!tickingSessionId) return;
    const id = setInterval(() => setNow(Date.now()), TIMER_TICK_MS);
    return () => clearInterval(id);
  }, [tickingSessionId]);

  return { session, live, now, refresh };
}
