'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslate } from '@/i18n';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { readJson, refusalText } from '@/lib/hub-request';
import { usePolledFetch } from '@/hooks/usePolledFetch';
import { materializeSession } from '@/lib/timer-logic';
import type { MaterializedTimerSession, Routine, TimerSession, TimerTargets, TimerView } from '@/types/timers';
import { resolveTimerTargets, useDisplayTarget } from '../display-target';

const SESSION_POLL_MS = 2_000;
const ROUTINES_POLL_MS = 15_000;
/** How many times a save is made again on top of a list another phone just saved. */
const SAVE_ATTEMPTS = 3;

export type TimerControlAction = 'pause' | 'resume' | 'skip' | 'add-minute' | 'step-done' | 'cancel';

/**
 * Data + actions behind the /remote Timers tab. Polls the active session
 * while the tab is in view and materializes it locally every second, so the
 * control card counts down smoothly between polls. Routines are replaced
 * wholesale on save; each save quotes the revision of the list it was built
 * from, so a routine another phone made meanwhile is never dropped.
 */
export function useTimersData() {
  const t = useTranslate('remote');
  const { displays, timerTargetIds: targetIds, setTimerTargetIds: setTargetIds } = useDisplayTarget();
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

  usePolledFetch(() => { void refreshSession(); }, [refreshSession], { intervalMs: SESSION_POLL_MS, pauseWhenHidden: true });

  // A failed load must NOT present as "no routines": saves PUT the whole
  // list, so treating a blip as empty would let the next save wipe every
  // saved routine. Failure blocks saving until a retry succeeds.
  const [routinesError, setRoutinesError] = useState(false);
  // The revision of the list on screen, quoted by the next save.
  const revisionRef = useRef<string | null>(null);
  // A save is out: a poll that read the file before it must not land after it.
  const savingRef = useRef(0);
  const routinesRef = useRef<Routine[]>([]);
  const adopt = useCallback((list: Routine[], revision: string) => {
    if (revisionRef.current !== revision) setRoutines(list);
    routinesRef.current = list;
    revisionRef.current = revision;
    setRoutinesLoaded(true);
  }, []);
  const readRoutines = useCallback(async (quiet: boolean) => {
    if (!quiet) setRoutinesError(false);
    const saves = savingRef.current;
    try {
      const res = await editorFetch('/api/timers/routines');
      if (!res.ok) {
        if (!quiet) setRoutinesError(true);
        return;
      }
      const json = (await res.json()) as { routines: Routine[]; revision: string };
      if (saves !== savingRef.current) return;
      adopt(json.routines, json.revision);
      setRoutinesError(false);
    } catch (e) {
      if (!quiet && !isSessionExpired(e)) setRoutinesError(true);
    }
  }, [adopt]);
  const loadRoutines = useCallback(() => readRoutines(false), [readRoutines]);

  // Polled, so a routine made on another phone shows up here while the tab
  // is in view. Only the first read says so when it fails; a poll that fails
  // keeps the list on screen.
  usePolledFetch(
    (_isMounted, reason) => { void readRoutines(reason !== 'setup'); },
    [readRoutines],
    { intervalMs: ROUTINES_POLL_MS, pauseWhenHidden: true },
  );

  const live: MaterializedTimerSession | null = useMemo(
    () => materializeSession(serverSession, now),
    [serverSession, now],
  );

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [live]);

  // Timer targets are chosen explicitly in the tab (empty selection = all
  // displays, the default) — deliberately independent of the global display
  // picker so a remote parked on "Kitchen" still broadcasts timers. The
  // selection lives in DisplayTargetContext so it survives tab switches.
  const targets: TimerTargets = useMemo(
    () => resolveTimerTargets(targetIds, displays),
    [targetIds, displays],
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
        const json = (await readJson(res)) as { session?: TimerSession | null } | null;
        if (!res.ok) {
          setError(refusalText(json, t, 'timers.failed'));
          return;
        }
        holdUntilRef.current = Date.now() + SESSION_POLL_MS;
        setServerSession(json?.session ?? null);
        setNow(Date.now());
      } catch (e) {
        if (!isSessionExpired(e)) setError(refusalText(e, t, 'timers.failed', 'hubRequest.saveFailed'));
      }
    },
    [t],
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

  /**
   * Save one change to the list: `change` is given the current list and
   * returns the next one. When another phone saved first, the change is made
   * again on top of its list, so a routine made there is kept and the one
   * made here still lands.
   */
  const saveRoutines = useCallback(async (change: (list: Routine[]) => Routine[]): Promise<boolean> => {
    // Refuse to write while the on-disk list has never been read — the
    // caller would be deriving the next list from an empty placeholder.
    if (!routinesLoaded) return false;
    setError(null);
    savingRef.current += 1;
    try {
      let list = routinesRef.current;
      for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
        const res = await editorFetch('/api/timers/routines', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routines: change(list), revision: revisionRef.current }),
        });
        const json = (await readJson(res)) as { reason?: unknown; routines?: Routine[]; revision?: unknown } | null;
        if (res.status === 409 && json?.reason === 'revision' && Array.isArray(json.routines) && typeof json.revision === 'string') {
          adopt(json.routines, json.revision);
          list = json.routines;
          continue;
        }
        if (!res.ok || !json || !Array.isArray(json.routines) || typeof json.revision !== 'string') {
          setError(refusalText(json, t, 'timers.failed'));
          return false;
        }
        adopt(json.routines, json.revision);
        return true;
      }
      setError(t('refusals.timers.revision'));
      return false;
    } catch (e) {
      if (!isSessionExpired(e)) setError(refusalText(e, t, 'timers.failed', 'hubRequest.saveFailed'));
      return false;
    } finally {
      savingRef.current += 1;
    }
  }, [routinesLoaded, adopt, t]);

  return {
    routines,
    routinesLoaded,
    routinesError,
    retryRoutines: loadRoutines,
    live,
    now,
    error,
    setError,
    targetIds,
    setTargetIds,
    startRoutine,
    startQuick,
    control,
    saveRoutines,
  };
}
