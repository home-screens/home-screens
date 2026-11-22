'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { holdRotationFor } from '@/lib/interaction-hold';
import { WALL_SCROLL_IDLE_MS } from '@/lib/wall-scroll';
import { BROWSE_ROTATION_HOLD_MS } from '@/components/display/useTapRotationHold';
import { useRotation } from '@/components/display/rotation-context';
import type { WallPersonPick } from '@/lib/calendar-wall-switch';

export interface WallCalendarSwitch<V extends string> {
  /** The view on screen: the calendar's own, or one borrowed from the buttons. */
  view: V;
  /** The borrowed view, or null while the calendar shows its own. */
  borrowed: V | null;
  /** The person or group on screen, or null for everyone. */
  pick: WallPersonPick | null;
  /** A view or a person is borrowed: the screen holds and the minute runs. */
  away: boolean;
  showView: (view: V) => void;
  showPick: (pick: WallPersonPick | null) => void;
  /** Back to the calendar's own view and everyone. */
  home: () => void;
}

/**
 * What a calendar on a touch wall has borrowed: another of the views the
 * editor offered, and one person or group. Either one holds the screen and
 * starts a minute (`WALL_SCROLL_IDLE_MS`, the minute look-ahead and scrolled
 * lists wait) after which both go back together; any touch on the screen
 * starts the minute again. A screen change, a different own view, or the
 * offer changing goes back too. Off (`enabled` false) it always answers the
 * calendar's own view and everyone.
 */
export function useWallCalendarSwitch<V extends string>({ enabled, homeView, views, pick: pickIn }: {
  enabled: boolean;
  homeView: V;
  /** The views on offer (`wallViewChoices`); a borrowed view must be one of them. */
  views: readonly V[];
  /**
   * Drops a pick the roster no longer offers (`livePick` over the current
   * choices); identity when it is still there.
   */
  pick: (pick: WallPersonPick | null) => WallPersonPick | null;
}): WallCalendarSwitch<V> {
  const [borrowed, setBorrowed] = useState<V | null>(null);
  const [picked, setPicked] = useState<WallPersonPick | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const home = useCallback(() => {
    clearTimer();
    setBorrowed(null);
    setPicked(null);
  }, [clearTimer]);
  const keepAway = useCallback(() => {
    holdRotationFor(BROWSE_ROTATION_HOLD_MS);
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setBorrowed(null);
      setPicked(null);
    }, WALL_SCROLL_IDLE_MS);
  }, [clearTimer]);

  const viewsKey = views.join('|');
  const view = enabled && borrowed !== null && views.includes(borrowed) ? borrowed : homeView;
  const pick = enabled ? pickIn(picked) : null;
  const away = view !== homeView || pick !== null;
  const awayRef = useRef(away);
  awayRef.current = away;

  const showView = useCallback((next: V) => {
    setBorrowed(next === homeView ? null : next);
    keepAway();
  }, [homeView, keepAway]);
  const showPick = useCallback((next: WallPersonPick | null) => {
    setPicked(next);
    keepAway();
  }, [keepAway]);

  // Switched off, another own view picked in the editor, or another offer: back home.
  useEffect(() => { home(); }, [enabled, homeView, viewsKey, home]);
  // A calendar shown on every screen stays mounted through a screen change.
  const screenId = useRotation()?.activeScreenId ?? null;
  useEffect(() => { home(); }, [screenId, home]);
  useEffect(() => clearTimer, [clearTimer]);
  // Nothing borrowed any more (the × on the person, or the own view tapped): no minute to run.
  useEffect(() => { if (!away) clearTimer(); }, [away, clearTimer]);

  // While away, a touch anywhere means someone is at the wall: the minute starts again.
  useEffect(() => {
    if (!away) return;
    const touched = () => { if (awayRef.current) keepAway(); };
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('pointerdown', touched, opts);
    return () => window.removeEventListener('pointerdown', touched, opts);
  }, [away, keepAway]);

  return { view, borrowed: view === homeView ? null : view, pick, away, showView, showPick, home };
}
