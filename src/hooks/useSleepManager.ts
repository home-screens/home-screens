'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SleepSettings } from '@/types/config';
import { createTZDate } from '@/lib/timezone';

export type DisplayState = 'active' | 'dimmed' | 'asleep';

/**
 * How long a rule-initiated wake holds the display awake against the automatic
 * sleep machinery before it takes back over. Touch/remote wakes get no such
 * hold — they are re-slept by the next 10s tick, unchanged. The remote
 * `sleep-override` command uses the same hold with a caller-chosen duration
 * ("keep the display on tonight").
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
   * Wake the display. `holdMs` keeps it awake — suppressing the sleep
   * schedule, dim schedule, and idle transitions — for that long before the
   * automatic machinery re-asserts. Used by the rule `wake` action and the
   * remote `sleep-override` command; a plain `wake()` (touch/remote) sets no
   * hold. An explicit sleep (remote command, brightness 0) cancels the hold.
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
  // Absolute timestamp until which a held wake (rule action or the remote
  // sleep-override command) suppresses every automatic transition — sleep
  // schedule, dim schedule, idle. 0 means no hold (the default path).
  const wakeHoldUntilRef = useRef(0);
  const enabled = sleep?.enabled ?? false;

  const wake = useCallback((options?: { holdMs?: number }) => {
    lastActivityRef.current = Date.now();
    if (options?.holdMs) {
      wakeHoldUntilRef.current = Date.now() + options.holdMs;
    }
    setBrightnessOverride(null);
    setDisplayState('active');
  }, []);

  const forceSleep = useCallback(() => {
    lastActivityRef.current = 0;
    // An explicit sleep is a human decision that outranks any standing
    // "keep it on" hold — without this, a touch after "displays to sleep"
    // would resurrect the hold and pin the display awake.
    wakeHoldUntilRef.current = 0;
    setBrightnessOverride(null);
    setDisplayState('asleep');
  }, []);

  const setRemoteBrightness = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(100, value));
    if (clamped === 0) {
      lastActivityRef.current = 0;
      // Brightness 0 is an explicit sleep — cancel a standing wake hold,
      // same as forceSleep above.
      wakeHoldUntilRef.current = 0;
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

  // Track user activity (mouse, touch, keyboard) for idle detection.
  //
  // Bound unconditionally, not just when `enabled`. `sleep.enabled` governs the
  // *automatic* idle/schedule machinery, but a display can also be put to sleep
  // explicitly — by a rule's `sleep` action, the remote sleep command, or a
  // display-control module — and those work regardless of the setting. Gating
  // the listeners on `enabled` left a sleep-disabled display with no way to be
  // woken by touch, which is the only input a kiosk has.
  //
  // Cheap when nothing ever sleeps: `onActivity` is a no-op state write while
  // the display is already 'active', so React bails out without re-rendering.
  useEffect(() => {
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
  }, []);

  // Turning sleep OFF must brighten a display that is already asleep.
  //
  // `settings.sleep` is live-pushed by useLiveConfig, so this is a prop change
  // with no remount: the timer effect below just stops running and would leave
  // `displayState` stuck at 'asleep'/'dimmed' forever. The old `!enabled`
  // short-circuit in dimOpacity used to mask that, but it also broke every
  // explicit sleep, so the recovery belongs here — on the transition — rather
  // than as a blanket guard on the opacity. An explicit forceSleep() while
  // already disabled does not re-run this, so that path stays fixed.
  useEffect(() => {
    if (enabled) return;
    setBrightnessOverride(null);
    setDisplayState('active');
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

      // A held wake (rule action / sleep-override) suppresses every automatic
      // transition until it expires — schedule sleep, schedule dim, AND idle;
      // "keep the display on" must not creep back to dimmed while held. The
      // window refs still track membership so the leave-window wake detection
      // stays accurate when the hold outlives a window edge. State is left
      // untouched on purpose: an explicit sleep during a hold has already
      // cancelled it (forceSleep / brightness 0), so nothing fights here.
      if (Date.now() < wakeHoldUntilRef.current) {
        wasSleepScheduleRef.current = inSleepWindow;
        wasDimScheduleRef.current = inDimWindow;
        return;
      }

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
    // No `!enabled` short-circuit here on purpose. `displayState` is the single
    // source of truth for "am I asleep"; `enabled` only decides whether the
    // automatic transitions run. With sleep disabled the state stays 'active'
    // on the default path and this switch already returns 0, so the guard only
    // ever broke the explicit forceSleep()/remote-sleep path, leaving the
    // display frozen on one screen at full brightness with no way back.
    // ('dimmed' with a null brightnessOverride is unreachable while sleep is
    // disabled: the only route there is setRemoteBrightness(1..99), which sets
    // brightnessOverride and returns above — and a state left over from when
    // sleep WAS enabled is cleared by the disable-transition effect.)
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
