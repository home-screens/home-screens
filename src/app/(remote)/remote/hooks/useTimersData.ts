'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { materializeSession } from '@/lib/timer-logic';
import type { MaterializedTimerSession, Routine, TimerSession, TimerTargets, TimerView } from '@/types/timers';
import { useDisplayTarget } from '../display-target';

const SESSION_POLL_MS = 2_000;

export type TimerControlAction = 'pause' | 'resume' | 'skip' | 'add-minute' | 'step-done' | 'cancel';

/**
 * Data + actions behind the /remote Timers tab. Polls the active session
 * while the tab is mounted and materializes it locally every second, so the
 * control card counts down smoothly between polls. Routines load once and
 * are replaced wholesale on save (small list, single form surface).
 */
export function useTimersData() {
  const { target } = useDisplayTarget();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routinesLoaded, setRoutinesLoaded] = useState(false);
  const [serverSession, setServerSession] = useState<TimerSession | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  // Suppress polls briefly after a control post so a read that raced the
  // atomic write can't flash stale state back (same guard as useMealsData).
  const holdUntilRef = useRef(0);

  const refreshSession = useCallback(async () => {
    try {
      const res = await editorFetch('/api/timers/session');
      if (!res.ok) return;
      const json = (await res.json()) as { session: TimerSession | null };
      if (Date.now() < holdUntilRef.current) return;
      setServerSession(json.session);
      setNow(Date.now());
    } catch (e) {
      if (isSessionExpired(e)) return;
    }
  }, []);

  useEffect(() => {
    void refreshSession();
    const id = setInterval(() => void refreshSession(), SESSION_POLL_MS);
    return () => clearInterval(id);
  }, [refreshSession]);

  // A failed load must NOT present as "no routines": saves PUT the whole
  // list, so treating a blip as empty would let the next save wipe every
  // saved routine. Failure blocks saving until a retry succeeds.
  const [routinesError, setRoutinesError] = useState(false);
  const loadRoutines = useCallback(async () => {
    setRoutinesError(false);
    try {
      const res = await editorFetch('/api/timers/routines');
      if (!res.ok) {
        setRoutinesError(true);
        return;
      }
      const json = (await res.json()) as { routines: Routine[] };
      setRoutines(json.routines);
      setRoutinesLoaded(true);
    } catch (e) {
      if (!isSessionExpired(e)) setRoutinesError(true);
    }
  }, []);

  useEffect(() => {
    void loadRoutines();
  }, [loadRoutines]);

  const live: MaterializedTimerSession | null = useMemo(
    () => materializeSession(serverSession, now),
    [serverSession, now],
  );

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [live]);

  /** 'all' broadcast for the All/legacy targets; a single id otherwise. */
  const targets: TimerTargets = useMemo(
    () => (target && target !== 'all' ? [target] : 'all'),
    [target],
  );

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      setError(null);
      try {
        const res = await editorFetch('/api/timers/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(typeof json.error === 'string' ? json.error : 'Something went wrong');
          return;
        }
        holdUntilRef.current = Date.now() + SESSION_POLL_MS;
        setServerSession(json.session);
        setNow(Date.now());
      } catch (e) {
        if (!isSessionExpired(e)) setError('Something went wrong');
      }
    },
    [],
  );

  const startRoutine = useCallback(
    (routineId: string, view?: TimerView) =>
      post({ action: 'start', kind: 'routine', routineId, targets, view }),
    [post, targets],
  );

  const startQuick = useCallback(
    (durationSec: number, view: TimerView, sound: boolean) =>
      post({ action: 'start', kind: 'quick', durationSec, targets, view, sound }),
    [post, targets],
  );

  const control = useCallback(
    (action: TimerControlAction) => post({ action }),
    [post],
  );

  const saveRoutines = useCallback(async (next: Routine[]): Promise<boolean> => {
    // Refuse to write while the on-disk list has never been read — the
    // caller would be deriving `next` from an empty placeholder.
    if (!routinesLoaded) return false;
    setError(null);
    try {
      const res = await editorFetch('/api/timers/routines', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routines: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === 'string' ? json.error : 'Something went wrong');
        return false;
      }
      setRoutines(json.routines);
      return true;
    } catch (e) {
      if (!isSessionExpired(e)) setError('Something went wrong');
      return false;
    }
  }, [routinesLoaded]);

  return {
    routines,
    routinesLoaded,
    routinesError,
    retryRoutines: loadRoutines,
    live,
    now,
    error,
    setError,
    startRoutine,
    startQuick,
    control,
    saveRoutines,
  };
}
