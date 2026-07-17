'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SleepSettings } from '@/types/config';
import { createTZDate } from '@/lib/timezone';

export type DisplayState = 'active' | 'dimmed' | 'asleep';

/**
 * How long a rule-initiated wake holds the display awake against a scheduled
 * sleep window before the schedule takes back over. Touch/remote wakes get no
 * such hold — they are re-slept by the next 10s tick, unchanged.
 */
export const RULE_WAKE_HOLD_MS = 5 * 60_000;

/**
 * Checks whether the current time falls within a schedule window.
 * Handles overnight windows (e.g., 23:00–06:00) correctly.
 *
 * Accepts an optional `now` parameter for testing; defaults to `new Date()`.
 */
export function isInScheduleWindow(
  schedule: { startTime: string; endTime: string },
  now: Date = new Date(),
): boolean {
  const [startH, startM] = schedule.startTime.split(':').map(Number);
  const [endH, endM] = schedule.endTime.split(':').map(Number);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Same-day window (e.g., 09:00–17:00)
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  } else {
    // Overnight window (e.g., 23:00–06:00)
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }
}

interface UseSleepManagerResult {
  displayState: DisplayState;
  dimOpacity: number;
  /**
   * Wake the display. `holdMs` keeps it awake through a scheduled sleep window
   * for that long before the schedule re-asserts — used only by the rule
   * `wake` action; a plain `wake()` (touch/remote) sets no hold.
   */
  wake: (options?: { holdMs?: number }) => void;
  forceSleep: () => void;
  setRemoteBrightness: (value: number) => void;
}

export function useSleepManager(
  sleep?: SleepSettings,
  /**
   * Display timezone (GlobalSettings.timezone). Schedule windows are
   * evaluated against this zone via `createTZDate`, matching how screen,
   * module, and profile schedules are evaluated in ScreenRotator — raw
   * `new Date()` would use the Pi's OS timezone, which can differ.
   */
  timezone?: string,
): UseSleepManagerResult {
  const [displayState, setDisplayState] = useState<DisplayState>('active');
  const [brightnessOverride, setBrightnessOverride] = useState<number | null>(null);
  const lastActivityRef = useRef(Date.now());
  const wasDimScheduleRef = useRef(false);
  const wasSleepScheduleRef = useRef(false);
  // Absolute timestamp until which a rule-initiated wake holds the display
  // awake against the sleep schedule. 0 means no hold (the default path).
  const ruleWakeHoldUntilRef = useRef(0);
  const enabled = sleep?.enabled ?? false;

  const wake = useCallback((options?: { holdMs?: number }) => {
    lastActivityRef.current = Date.now();
    if (options?.holdMs) {
      ruleWakeHoldUntilRef.current = Date.now() + options.holdMs;
    }
    setBrightnessOverride(null);
    setDisplayState('active');
  }, []);

  const forceSleep = useCallback(() => {
    lastActivityRef.current = 0;
    setBrightnessOverride(null);
    setDisplayState('asleep');
  }, []);

  const setRemoteBrightness = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(100, value));
    if (clamped === 0) {
      lastActivityRef.current = 0;
      setBrightnessOverride(null);
      setDisplayState('asleep');
    } else if (clamped >= 100) {
      lastActivityRef.current = Date.now();
      setBrightnessOverride(null);
      setDisplayState('active');
    } else {
      setBrightnessOverride(clamped);
      setDisplayState('dimmed');
    }
  }, []);

  // Track user activity (mouse, touch, keyboard) for idle detection
  useEffect(() => {
    if (!enabled) return;

    function onActivity() {
      lastActivityRef.current = Date.now();
      setBrightnessOverride(null);
      setDisplayState((prev) => (prev !== 'active' ? 'active' : prev));
    }

    const events = ['mousemove', 'mousedown', 'touchstart', 'keydown'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [enabled]);

  // Timer that checks idle time, dim schedule, and sleep schedule
  useEffect(() => {
    if (!enabled || !sleep) return;

    const dimMs = sleep.dimAfterMinutes * 60 * 1000;
    const sleepMs = sleep.sleepAfterMinutes * 60 * 1000;

    const interval = setInterval(() => {
      const tzNow = createTZDate(timezone);
      const inSleepWindow = !!sleep.schedule && isInScheduleWindow(sleep.schedule, tzNow);
      const inDimWindow = !!sleep.dimSchedule && isInScheduleWindow(sleep.dimSchedule, tzNow);

      // Detect leaving a sleep schedule window — wake the display
      if (wasSleepScheduleRef.current && !inSleepWindow) {
        lastActivityRef.current = Date.now();
        setBrightnessOverride(null);
        setDisplayState('active');
        wasSleepScheduleRef.current = false;
        wasDimScheduleRef.current = inDimWindow;
        return;
      }
      wasSleepScheduleRef.current = inSleepWindow;

      // Detect leaving a dim schedule window — wake the display
      if (wasDimScheduleRef.current && !inDimWindow) {
        lastActivityRef.current = Date.now();
        setBrightnessOverride(null);
        setDisplayState('active');
        wasDimScheduleRef.current = false;
        return;
      }
      wasDimScheduleRef.current = inDimWindow;

      // Fixed sleep schedule takes highest priority — force asleep during window
      // Clear brightness override so remote brightness can't prevent full blackout
      if (inSleepWindow) {
        // A rule-initiated wake holds the display awake through the window for
        // RULE_WAKE_HOLD_MS; the schedule re-asserts once the hold expires.
        if (Date.now() < ruleWakeHoldUntilRef.current) return;
        setBrightnessOverride(null);
        setDisplayState('asleep');
        return;
      }

      // Fixed dim schedule — force dimmed during window
      // Idle-based sleep is suppressed during dim schedule; the schedule controls behavior.
      // If you want the screen fully off at night, use a sleep schedule.
      if (inDimWindow) {
        setBrightnessOverride(null);
        setDisplayState('dimmed');
        return;
      }

      // Idle-based transitions (only when no dim schedule is configured)
      // If the user set a dim schedule, dimming is controlled by the schedule alone.
      if (!sleep.dimSchedule) {
        const idle = Date.now() - lastActivityRef.current;

        if (sleepMs > 0 && idle >= dimMs + sleepMs) {
          setBrightnessOverride(null);
          setDisplayState('asleep');
        } else if (idle >= dimMs) {
          setBrightnessOverride(null);
          setDisplayState('dimmed');
        }
      }
      // Don't reset to 'active' here — that's handled by the activity listener
    }, 10_000); // check every 10 seconds

    return () => clearInterval(interval);
  }, [enabled, sleep, timezone]);

  // Calculate dim opacity — remote brightness override takes precedence
  const dimOpacity = (() => {
    if (brightnessOverride !== null) {
      return 1 - brightnessOverride / 100;
    }
    if (!enabled) return 0;
    switch (displayState) {
      case 'active':
        return 0;
      case 'dimmed':
        // dimBrightness is 0-100 (percentage of brightness to keep)
        // So overlay opacity = 1 - brightness/100
        return 1 - (sleep?.dimBrightness ?? 20) / 100;
      case 'asleep':
        return 1;
    }
  })();

  return { displayState, dimOpacity, wake, forceSleep, setRemoteBrightness };
}
