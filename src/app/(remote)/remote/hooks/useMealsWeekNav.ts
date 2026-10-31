'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { MealSettings } from '@/types/config';
import { toISODate, fromISODate, alignToWeekStart, weekStartAfterDayChange, minutesOfDay } from '@/lib/meal-constants';
import { createTZDate } from '@/lib/timezone';
import { getWeekDates } from '../components/meals-shared';
import { useHouseholdNow, useHouseholdTimezone } from '../household-clock';

/**
 * Which week the Meals tab is showing, plus everything derived from the wall
 * clock (today, the minute of the day). Owns the minute tick so the rest of
 * the tab can read plain values instead of calling `new Date()` at render time.
 *
 * Every "now" here is the household's wall clock, not the phone's: on Sunday
 * night a parent in another zone must land on the week the wall shows, since
 * "Copy last week", "Shuffle" and "Clear week" act on the week in view.
 *
 * `keptWeek` is the first day of the week the address kept across a reload
 * (`readMealsPlace`), null for this week: where the tab opens. `loaded` says
 * the household's settings are in; before that their week start is only the
 * default.
 */
export function useMealsWeekNav(settings: MealSettings, keptWeek: string | null = null, loaded = true) {
  const timezone = useHouseholdTimezone();

  // Wall-clock tick — drives the "active slot" highlight and time-aware
  // fade-out of past slots. Without this tick, memoized values like
  // `todayISO` and `nowMinutes` freeze at first render, so a phone left
  // open at 12:30 PM would still show "Lunch • Now" at 6:00 PM.
  // Ticks once a minute, which is fine-grained enough for serving times.
  const clockNow = useHouseholdNow(60_000);

  // The week shown, held as any day in it until a change aligns it
  // (`getWeekDates` aligns it as it draws): the week kept across a reload,
  // else today.
  const [viewingWeekStart, setViewingWeekStart] = useState<Date>(() => (keptWeek ? fromISODate(keptWeek) : createTZDate(timezone)));

  // Re-align the week origin to today whenever the household's weekStartDay
  // changes. Anchored to today (not to the existing `viewingWeekStart`) so the
  // user always lands on the current week regardless of whether they were
  // viewing a future or past week when the setting changed. See the
  // alignToWeekStart unit tests for the offset math, including the regression
  // case for the compounding-offset bug.
  //
  // Not while the settings load: until then the week start is only the
  // default, and aligning to it put a Monday household on the week before
  // for a moment once its settings came in (and lost a kept week). The
  // anchor already sits in the week to show.
  const settingsIn = useRef(false);
  useEffect(() => {
    if (!settingsIn.current) return;
    setViewingWeekStart(alignToWeekStart(createTZDate(timezone), settings.weekStartDay));
  }, [settings.weekStartDay, timezone]);
  // After the effect above, so the commit that brings the settings in is
  // not taken for a change.
  useEffect(() => {
    if (loaded) settingsIn.current = true;
  }, [loaded]);

  const weekDates = useMemo(
    () => getWeekDates(viewingWeekStart, settings.weekStartDay),
    [viewingWeekStart, settings.weekStartDay],
  );
  // Derive todayISO from the tick so a phone left open past midnight rolls
  // the "Today" highlight to the new day automatically.
  const todayISO = useMemo(() => toISODate(clockNow), [clockNow]);
  // A parent parked on this week walks into the new one at the week boundary,
  // so Clear, Suggest and Copy last week never act on a week that just ended.
  const shownToday = useRef(todayISO);
  useEffect(() => {
    const before = shownToday.current;
    if (before === todayISO) return;
    shownToday.current = todayISO;
    setViewingWeekStart((prev) => {
      const start = weekStartAfterDayChange(toISODate(prev), before, todayISO, settings.weekStartDay);
      return start === toISODate(prev) ? prev : fromISODate(start);
    });
  }, [todayISO, settings.weekStartDay]);
  // The minute at home, for which of today's meals is on now; it moves with
  // the tick, so the highlight hands over as the evening goes on.
  const nowMinutes = useMemo(() => minutesOfDay(clockNow), [clockNow]);
  const isCurrentWeek = weekDates.some((d) => d.date === todayISO);

  const navigateWeek = useCallback((direction: -1 | 1) => {
    setViewingWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + direction * 7);
      return next;
    });
  }, []);

  const jumpToToday = useCallback(() => {
    setViewingWeekStart(alignToWeekStart(createTZDate(timezone), settings.weekStartDay));
  }, [settings.weekStartDay, timezone]);

  return {
    /** Exposed for the plan actions that need the previous week's window */
    viewingWeekStart,
    weekDates,
    todayISO,
    nowMinutes,
    isCurrentWeek,
    navigateWeek,
    jumpToToday,
  };
}
