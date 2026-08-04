'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MealSettings } from '@/types/config';
import { toISODate, alignToWeekStart } from '@/lib/meal-constants';
import { getWeekDates, currentActiveSlot } from '../components/meals-shared';

/**
 * Which week the Meals tab is showing, plus everything derived from the wall
 * clock (today, current hour, active slot). Owns the minute tick so the rest of
 * the tab can read plain values instead of calling `new Date()` at render time.
 */
export function useMealsWeekNav(settings: MealSettings) {
  // Week navigation state — initialized as a placeholder; the effect below
  // re-aligns it to the household's weekStartDay once settings load.
  const [viewingWeekStart, setViewingWeekStart] = useState<Date>(() => new Date());

  // Wall-clock tick — drives the "active slot" highlight and time-aware
  // fade-out of past slots. Without this tick, memoized values like
  // `activeSlotType` and `currentHour` freeze at first render, so a phone
  // left open at 4:55 PM would still show "Lunch • Now" at 6:00 PM.
  // Ticks once a minute, which is fine-grained enough for slot boundaries.
  const [clockNow, setClockNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClockNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Re-align the week origin to today whenever the household's weekStartDay
  // changes. Anchored to today (not to the existing `viewingWeekStart`) so the
  // user always lands on the current week regardless of whether they were
  // viewing a future or past week when the setting changed. See the
  // alignToWeekStart unit tests for the offset math, including the regression
  // case for the compounding-offset bug.
  //
  // This also fires on mount (after fetchData resolves with a non-default
  // weekStartDay), so we don't need a separate initial-alignment effect.
  useEffect(() => {
    setViewingWeekStart(alignToWeekStart(new Date(), settings.weekStartDay));
  }, [settings.weekStartDay]);

  const weekDates = useMemo(
    () => getWeekDates(viewingWeekStart, settings.weekStartDay),
    [viewingWeekStart, settings.weekStartDay],
  );
  // Derive todayISO from the tick so a phone left open past midnight rolls
  // the "Today" highlight to the new day automatically.
  const todayISO = useMemo(() => toISODate(clockNow), [clockNow]);
  const currentHour = useMemo(() => clockNow.getHours(), [clockNow]);
  // Re-run when the clock ticks so "active slot" advances across slot
  // boundaries. Otherwise this memo would freeze at first render.
  const activeSlotType = useMemo(
    () => currentActiveSlot(settings.enabledSlots, clockNow),
    [settings.enabledSlots, clockNow],
  );
  const isCurrentWeek = weekDates.some((d) => d.date === todayISO);

  const navigateWeek = useCallback((direction: -1 | 1) => {
    setViewingWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + direction * 7);
      return next;
    });
  }, []);

  const jumpToToday = useCallback(() => {
    setViewingWeekStart(alignToWeekStart(new Date(), settings.weekStartDay));
  }, [settings.weekStartDay]);

  return {
    /** Exposed for the plan actions that need the previous week's window */
    viewingWeekStart,
    weekDates,
    todayISO,
    currentHour,
    activeSlotType,
    isCurrentWeek,
    navigateWeek,
    jumpToToday,
  };
}
