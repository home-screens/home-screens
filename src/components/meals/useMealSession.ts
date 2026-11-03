'use client';

import { useCallback, useRef, useState } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { usePolledFetch } from '@/hooks/usePolledFetch';
import { MealSession, type MealEdit, type MealieRange, type MealSnapshot } from '@/lib/meal-client';
import type { MealSlotType } from '@/types/config';

/** How often an open meal planner (the phone's Meals tab, the editor's window) asks the hub for the meals again. */
export const MEAL_POLL_MS = 15_000;

/** What a surface does with the session's answers; it keeps its own state and its own words. */
export interface MealSessionSurface {
  /**
   * Show a copy of the meals, called once nothing sent from here is still out
   * (an older answer would undo what is on its way). `load` is the hub's whole
   * answer, settings and clock format included; `save` is what a save, a
   * Suggest or a page of Mealie's plan was answered with, or, after a refused
   * save, the copy the session holds (null when nothing ever loaded), so a
   * change that was not saved does not stay on screen.
   */
  show: (snapshot: MealSnapshot | null, from: 'load' | 'save') => void;
  /** A save or a Suggest was refused. Never for an expired session: sign-in is already on its way. */
  refused: (err: unknown, what: 'save' | 'suggest') => void;
}

/**
 * The meal session the phone's Meals tab and the editor's meal planner window
 * share (`MealSession`, `lib/meal-client.ts`): loaded on mount, asked again
 * while `poll` is on (every so often, when the page comes back into view and
 * when the device is back online), and its saves, Suggest and Mealie weeks
 * answered the same way on both.
 *
 * `loadState` is `failed` only while nothing has ever loaded: a refresh that
 * fails keeps what is on screen. `mealieWeeks` says whether a week asked for
 * with `showMealieRange` is on its way or failed, so the week can say so
 * instead of looking empty.
 */
export function useMealSession(surface: MealSessionSurface, { poll }: { poll: boolean }) {
  // Read when an answer lands, so the surface's latest words and state are used.
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const [session] = useState(() => new MealSession(editorFetch, (snapshot) => surfaceRef.current.show(snapshot, 'load')));
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [mealieWeeks, setMealieWeeks] = useState<'idle' | 'loading' | 'failed'>('idle');

  const load = useCallback(async () => {
    try {
      const snapshot = await session.load();
      setLoadState('ready');
      // A load answered while a save or a tick is out is older than its answer.
      if (session.idle) surfaceRef.current.show(snapshot, 'load');
    } catch (err) {
      if (!isSessionExpired(err) && !session.current) setLoadState('failed');
    }
  }, [session]);

  // Loaded on mount and again when polling turns on or off: the editor's
  // window opening or closing brings in edits made elsewhere meanwhile.
  // While polling, asked again every so often in view and when the device
  // is back online: a copy left open for hours would be hours old, a grocery
  // item ticked on another phone would never show, and a load that failed
  // during a Wi-Fi blip would leave the meals missing for good.
  usePolledFetch(
    () => { void load(); },
    [load, poll],
    { intervalMs: poll ? MEAL_POLL_MS : undefined, pauseWhenHidden: poll },
  );

  /**
   * Save one edit (see `MealEdit`); the surface has already shown it. Once
   * the last queued save is answered, the hub's copy replaces what is shown.
   * Resolves false when it was not saved.
   */
  const save = useCallback(async (edit: MealEdit): Promise<boolean> => {
    try {
      const saved = await session.save(edit);
      if (session.idle) surfaceRef.current.show(saved, 'save');
      return true;
    } catch (err) {
      if (isSessionExpired(err)) return false;
      if (session.idle) surfaceRef.current.show(session.current, 'save');
      surfaceRef.current.refused(err, 'save');
      return false;
    }
  }, [session]);

  /**
   * Mealie's own picks for the empty meals among `cells` (Suggest, while the
   * plan lives in Mealie): how many it filled and had nothing for, or null
   * when the hub or Mealie refused.
   */
  const suggest = useCallback(async (cells: { date: string; slot: MealSlotType }[]) => {
    try {
      const { snapshot, created, skipped, entries } = await session.suggestFromMealie(cells);
      if (session.idle) surfaceRef.current.show(snapshot, 'save');
      return { created, skipped, entries };
    } catch (err) {
      if (!isSessionExpired(err)) surfaceRef.current.refused(err, 'suggest');
      return null;
    }
  }, [session]);

  /**
   * Bring Mealie's plan for `range` into the copy, when the week shown is
   * outside the weeks every answer carries. The session keeps those days
   * through later saves and reloads.
   */
  const showMealieRange = useCallback(async (range: MealieRange) => {
    setMealieWeeks('loading');
    try {
      const snapshot = await session.showMealieRange(range);
      if (session.idle) surfaceRef.current.show(snapshot, 'save');
      setMealieWeeks('idle');
    } catch (err) {
      // An expired session is on its way to sign-in, not a week that failed.
      setMealieWeeks(isSessionExpired(err) ? 'idle' : 'failed');
    }
  }, [session]);

  return { session, loadState, load, save, suggest, showMealieRange, mealieWeeks };
}
