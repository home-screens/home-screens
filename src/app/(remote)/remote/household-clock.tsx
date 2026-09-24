'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTZClock } from '@/hooks/useTZClock';
import { isoDateInTZ } from '@/lib/timezone';
import type { TimeFormat } from '@/types/config';

/**
 * The household's clock on the phone and kid surfaces. A phone's own zone is
 * whatever it happens to be set to (a hand-me-down left on UTC, a parent on a
 * trip), so "today", "this week" and the current hour all come from the zone
 * the hub runs the household in instead. The layout seeds it from the server
 * on every page load, so a changed setting reaches the phone on the next one.
 */
interface HouseholdClock {
  /** Settings time zone, or the hub's own zone when none is set. Never empty. */
  timezone: string;
  /** The household's day when the page was drawn, `YYYY-MM-DD`. */
  today: string;
  /** 12 or 24 hour, resolved against the formatting language when unset. */
  timeFormat: TimeFormat;
}

const HouseholdClockContext = createContext<HouseholdClock | null>(null);

export function HouseholdClockProvider({ timezone, today, timeFormat, children }: HouseholdClock & { children: ReactNode }) {
  const value = useMemo(() => ({ timezone, today, timeFormat }), [timezone, today, timeFormat]);
  return <HouseholdClockContext.Provider value={value}>{children}</HouseholdClockContext.Provider>;
}

function useHouseholdClock(): HouseholdClock {
  const clock = useContext(HouseholdClockContext);
  // Falling back to the phone's zone is the bug this context exists to fix,
  // so a surface rendered without it fails loudly instead.
  if (!clock) throw new Error('useHouseholdClock must be used inside HouseholdClockProvider');
  return clock;
}

export function useHouseholdTimezone(): string {
  return useHouseholdClock().timezone;
}

/** The household's 12/24-hour clock, for times said in home time. */
export function useHouseholdClockFormat(): TimeFormat {
  return useHouseholdClock().timeFormat;
}

/**
 * Now on the household's wall clock, ticking every `intervalMs`. A "shifted"
 * Date: read its local getters (getHours, getDay, getDate) and never compare
 * it with a real instant or format it with a `timeZone` option.
 */
export function useHouseholdNow(intervalMs = 60_000): Date {
  return useTZClock(useHouseholdTimezone(), intervalMs);
}

/**
 * The household's calendar day, `YYYY-MM-DD`. Starts on the day the server
 * drew the page, so the first paint matches it, then follows the clock past
 * midnight.
 */
export function useHouseholdToday(intervalMs = 30_000): string {
  const { timezone, today: seeded } = useHouseholdClock();
  const [today, setToday] = useState(seeded);
  useEffect(() => {
    const check = () => setToday(isoDateInTZ(new Date(), timezone));
    check();
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [timezone, intervalMs]);
  return today;
}
