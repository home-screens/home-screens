'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SleepSettings } from '@/types/config';
import { createTZDate } from '@/lib/timezone';
import { DEFAULT_WAKE_HOLD_MINUTES, isMinuteInScheduleWindow } from '@/lib/sleep-timeline';

export type DisplayState = 'active' | 'dimmed' | 'asleep';

/**
 * How long a rule-initiated wake holds the display awake against the automatic
 * sleep machinery before it takes back over. The remote `sleep-override`
 * command uses the same hold with a caller-chosen duration ("keep the display
 * on tonight"). Touch/remote wakes get their own hold — `wakeHoldMinutes`
 * (default DEFAULT_WAKE_HOLD_MINUTES in sleep-timeline) — applied only when
 * the wake lands inside a schedule window.
 */
export const RULE_WAKE_HOLD_MS = 5 * 60_000;

/**
 * How often the activity listener is allowed to re-arm the schedule-window
 * wake hold. Arming costs an Intl round-trip (createTZDate), and mousemove
 * fires at pointer rate — the throttle keeps continuous interaction to one
 * window check every few seconds while still giving "the display sleeps
 * wakeHoldMinutes after the LAST interaction" semantics (the drift is at most
 * one throttle interval on a minutes-long hold).
 */
const ACTIVITY_ARM_THROTTLE_MS = 5_000;

/**
 * Grace window after a dimmed/asleep → active transition during which module
 * clicks are swallowed: the tap that wakes a kiosk must not also activate
 * whatever tappable content was under the finger. Long enough to cover the
 * touchstart(wake) → click gap on a slow Pi, short enough that a deliberate
 * second tap always lands.
 */
export const WAKE_TAP_GUARD_MS = 700;

/**
 * Checks whether the current time falls within a schedule window.
 * Handles overnight windows (e.g., 23:00–06:00) correctly.
 *
 * Thin wall-clock wrapper over `isMinuteInScheduleWindow` — the same predicate
 * the settings timeline preview renders from, so the preview and the runtime
 * agree on window edges by construction.
 *
 * Accepts an optional `now` parameter for testing; defaults to `new Date()`.
 */
export function isInScheduleWindow(
  schedule: { startTime: string; endTime: string },
  now: Date = new Date(),
): boolean {
  return isMinuteInScheduleWindow(schedule, now.getHours() * 60 + now.getMinutes());
}

interface UseSleepManagerResult {
  displayState: DisplayState;
  dimOpacity: number;
  /**
   * Wake the display. `holdMs` keeps it awake — suppressing the sleep
   * schedule, dim schedule, and idle transitions — for that long before the
   * automatic machinery re-asserts. Used by the rule `wake` action and the
   * remote `sleep-override` command. A plain `wake()` (touch, remote wake)
   * arms the configured `wakeHoldMinutes` hold when it lands inside a
   * schedule window, and no hold otherwise. Holds only ever extend the
   * deadline (a shorter wake never truncates a standing longer hold); an
   * explicit sleep (remote command, brightness 0) cancels the hold.
   */
  wake: (options?: { holdMs?: number }) => void;
  /**
   * Wake only when the content is effectively hidden: fully asleep, or
   * dimmed by a schedule/idle (no brightness override). A remote-set partial
   * brightness is a deliberate choice and is left untouched. Reads
   * synchronously-maintained refs rather than React state on purpose: the
   * remote command drain executes a whole batch (e.g. `sleep` followed by
   * `goto-screen`) before React re-renders, so state-derived values would be
   * stale for every command after the first.
   */
  wakeIfHidden: () => void;
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
  // Synchronous mirrors of the two state values above, written at every
  // transition site (not during render). Needed by `wakeIfHidden` and the
  // activity listener: the command drain and DOM events run outside React's
  // commit cycle, where a render-assigned ref lags the actual state.
  const displayStateRef = useRef<DisplayState>('active');
  const brightnessOverrideRef = useRef<number | null>(null);
  const applyDisplayState = useCallback((next: DisplayState) => {
    displayStateRef.current = next;
    setDisplayState(next);
  }, []);
  const applyBrightnessOverride = useCallback((next: number | null) => {
    brightnessOverrideRef.current = next;
    setBrightnessOverride(next);
  }, []);
  const lastActivityRef = useRef(Date.now());
  const wasDimScheduleRef = useRef(false);
  const wasSleepScheduleRef = useRef(false);
  // Absolute timestamp until which a held wake (rule action, sleep-override,
  // or the schedule-window wake hold) suppresses every automatic transition —
  // sleep schedule, dim schedule, idle. 0 means no hold (the default path).
  const wakeHoldUntilRef = useRef(0);
  const lastArmAttemptRef = useRef(0);
  const enabled = sleep?.enabled ?? false;
  // Absent means true: every config saved before this field existed had idle
  // dimming on, so absence must keep behaving that way.
  const idleDimEnabled = sleep?.idleDimEnabled ?? true;

  // Latest settings for the stable callbacks below — `wake` and the activity
  // listener are bound once (or handed to consumers that key effects on their
  // identity), so they read the current schedule through a ref instead of
  // re-creating on every settings push.
  const scheduleRef = useRef({ sleep, timezone });
  scheduleRef.current = { sleep, timezone };

  /**
   * Raise the hold deadline, never lower it. The ref is one slot shared by
   * three producers with very different lifetimes (sleep-override up to a
   * day, rule wakes at 5 minutes, the schedule wake hold at wakeHoldMinutes)
   * — an unconditional assignment would let a stray touch truncate a "keep
   * the display on tonight" override to minutes. Shortening is only ever an
   * explicit-sleep decision, and forceSleep/brightness-0 zero the ref.
   */
  const raiseWakeHold = (untilMs: number) => {
    wakeHoldUntilRef.current = Math.max(wakeHoldUntilRef.current, untilMs);
  };

  /**
   * Arm (or refresh) the explicit-wake hold if the wake lands inside an
   * active sleep/dim schedule window. Outside a window there is nothing to
   * hold off — idle transitions restart from `lastActivityRef` anyway, and a
   * standing hold would wrongly suppress idle dimming for its duration.
   *
   * Costs an Intl round-trip (createTZDate); callers on hot paths (the
   * activity listener) throttle it via ACTIVITY_ARM_THROTTLE_MS.
   */
  const armScheduleWakeHold = useCallback(() => {
    const { sleep: s, timezone: tz } = scheduleRef.current;
    if (!s?.enabled) return;
    const holdMinutes = s.wakeHoldMinutes ?? DEFAULT_WAKE_HOLD_MINUTES;
    if (holdMinutes <= 0) return;
    const tzNow = createTZDate(tz);
    const inWindow =
      (!!s.schedule && isInScheduleWindow(s.schedule, tzNow)) ||
      (!!s.dimSchedule && isInScheduleWindow(s.dimSchedule, tzNow));
    if (inWindow) {
      raiseWakeHold(Date.now() + holdMinutes * 60_000);
    }
  }, []);

  const wake = useCallback((options?: { holdMs?: number }) => {
    lastActivityRef.current = Date.now();
    if (options?.holdMs) {
      raiseWakeHold(Date.now() + options.holdMs);
    } else {
      // An explicit wake with no caller-chosen hold (remote wake button,
      // remote navigation) gets the configured schedule-window hold, so it
      // is not re-slept by the very next 10s tick.
      armScheduleWakeHold();
    }
    applyBrightnessOverride(null);
    applyDisplayState('active');
  }, [armScheduleWakeHold, applyBrightnessOverride, applyDisplayState]);

  const wakeIfHidden = useCallback(() => {
    const state = displayStateRef.current;
    if (state === 'asleep' || (state === 'dimmed' && brightnessOverrideRef.current === null)) {
      wake();
    }
  }, [wake]);

  const forceSleep = useCallback(() => {
    lastActivityRef.current = 0;
    // An explicit sleep is a human decision that outranks any standing
    // "keep it on" hold — without this, a touch after "displays to sleep"
    // would resurrect the hold and pin the display awake.
    wakeHoldUntilRef.current = 0;
    applyBrightnessOverride(null);
    applyDisplayState('asleep');
  }, [applyBrightnessOverride, applyDisplayState]);

  const setRemoteBrightness = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(100, value));
    if (clamped === 0) {
      lastActivityRef.current = 0;
      // Brightness 0 is an explicit sleep — cancel a standing wake hold,
      // same as forceSleep above.
      wakeHoldUntilRef.current = 0;
      applyBrightnessOverride(null);
      applyDisplayState('asleep');
    } else if (clamped >= 100) {
      lastActivityRef.current = Date.now();
      // Same explicit-wake hold as `wake()`: "brightness 100" from the
      // remote during a schedule window means "I want it bright now", not
      // "flash bright for one tick".
      armScheduleWakeHold();
      applyBrightnessOverride(null);
      applyDisplayState('active');
    } else {
      // Keep idle timing honest for a command that leaves the display
      // dimmed: the user acted now, even though the state is not 'active'.
      lastActivityRef.current = Date.now();
      // A partial brightness during a sleep window would otherwise be wiped
      // within 10s (the window's asleep branch clears the override) — an
      // explicit remote choice deserves the same hold as a wake.
      armScheduleWakeHold();
      applyBrightnessOverride(clamped);
      applyDisplayState('dimmed');
    }
  }, [armScheduleWakeHold, applyBrightnessOverride, applyDisplayState]);

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
  // the display is already 'active', so React bails out without re-rendering,
  // and the throttled arm no-ops outside schedule windows.
  useEffect(() => {
    function onActivity() {
      const now = Date.now();
      lastActivityRef.current = now;
      // Maintain the schedule-window wake hold on a rolling basis: any
      // activity during a sleep/dim window keeps the display awake for
      // wakeHoldMinutes after the LAST interaction — whether the touch is
      // the one waking it or the user is mid-session. Throttled because
      // arming does an Intl window check and mousemove fires at pointer
      // rate; outside a window the arm is a no-op, so idle-dim timing
      // (dimAfterMinutes from lastActivityRef) is untouched.
      if (now - lastArmAttemptRef.current >= ACTIVITY_ARM_THROTTLE_MS) {
        lastArmAttemptRef.current = now;
        armScheduleWakeHold();
      }
      displayStateRef.current = 'active';
      brightnessOverrideRef.current = null;
      setBrightnessOverride(null);
      setDisplayState((prev) => (prev !== 'active' ? 'active' : prev));
    }

    const events = ['mousemove', 'mousedown', 'touchstart', 'keydown'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [armScheduleWakeHold]);

  // Turning sleep OFF — or idle dimming OFF — must brighten a display that is
  // already asleep/dimmed.
  //
  // `settings.sleep` is live-pushed by useLiveConfig, so this is a prop change
  // with no remount: the timer effect below just stops running (or skips its
  // idle branch) and would leave `displayState` stuck at 'asleep'/'dimmed'
  // forever — on a wall-mounted kiosk nothing else ever touches it. The old
  // `!enabled` short-circuit in dimOpacity used to mask the `enabled` half,
  // but it also broke every explicit sleep, so the recovery belongs here — on
  // the transition — rather than as a blanket guard on the opacity. An
  // explicit forceSleep() while already disabled does not re-run this, so that
  // path stays fixed. Keying on the primitives (not the sleep object) means
  // unrelated settings edits can't retrigger it.
  //
  // Known wrinkle: flipping idle dimming off during an active schedule window
  // briefly brightens until the next 10s tick re-asserts the window — the same
  // behavior as a touch-wake during a window, which is intended.
  useEffect(() => {
    if (enabled && idleDimEnabled) return;
    applyBrightnessOverride(null);
    applyDisplayState('active');
  }, [enabled, idleDimEnabled, applyBrightnessOverride, applyDisplayState]);

  // Timer that checks idle time, dim schedule, and sleep schedule
  useEffect(() => {
    if (!enabled || !sleep) return;

    const dimMs = sleep.dimAfterMinutes * 60 * 1000;
    const sleepMs = sleep.sleepAfterMinutes * 60 * 1000;

    const interval = setInterval(() => {
      const tzNow = createTZDate(timezone);
      const inSleepWindow = !!sleep.schedule && isInScheduleWindow(sleep.schedule, tzNow);
      const inDimWindow = !!sleep.dimSchedule && isInScheduleWindow(sleep.dimSchedule, tzNow);

      // Leave-window wake detection runs BEFORE the held-wake check: a window
      // ending outranks a standing hold. A hold means "don't sleep yet", not
      // "stay dark past the scheduled wake" — and a hold armed while the
      // display is dimmed (remote partial brightness) must not swallow the
      // scheduled morning wake, since nothing else would ever brighten it.
      if (wasSleepScheduleRef.current && !inSleepWindow) {
        lastActivityRef.current = Date.now();
        applyBrightnessOverride(null);
        applyDisplayState('active');
        wasSleepScheduleRef.current = false;
        wasDimScheduleRef.current = inDimWindow;
        return;
      }
      wasSleepScheduleRef.current = inSleepWindow;

      // Detect leaving a dim schedule window — wake the display
      if (wasDimScheduleRef.current && !inDimWindow) {
        lastActivityRef.current = Date.now();
        applyBrightnessOverride(null);
        applyDisplayState('active');
        wasDimScheduleRef.current = false;
        return;
      }
      wasDimScheduleRef.current = inDimWindow;

      // A held wake (rule action, sleep-override, or the schedule wake hold)
      // suppresses every automatic transition until it expires — schedule
      // sleep, schedule dim, AND idle; "keep the display on" must not creep
      // back to dimmed while held. State is left untouched on purpose: an
      // explicit sleep during a hold has already cancelled it (forceSleep /
      // brightness 0), so nothing fights here.
      if (Date.now() < wakeHoldUntilRef.current) return;

      // Fixed sleep schedule takes highest priority — force asleep during window
      // Clear brightness override so remote brightness can't prevent full blackout
      if (inSleepWindow) {
        applyBrightnessOverride(null);
        applyDisplayState('asleep');
        return;
      }

      // Fixed dim schedule — force dimmed during window
      // Idle-based sleep is suppressed during dim schedule; the schedule controls behavior.
      // If you want the screen fully off at night, use a sleep schedule.
      if (inDimWindow) {
        applyBrightnessOverride(null);
        applyDisplayState('dimmed');
        return;
      }

      // Idle-based transitions run whenever the idle toggle is on — the
      // toggle alone governs them. (A dim schedule used to suppress idle
      // behavior implicitly; that rule was an ersatz for this toggle and was
      // removed when the toggle shipped — the v7 migration seeds
      // idleDimEnabled: false into configs that relied on it.) While a
      // schedule window is active the early returns above win, so schedules
      // still take priority over idle transitions.
      if (idleDimEnabled) {
        const idle = Date.now() - lastActivityRef.current;

        if (sleepMs > 0 && idle >= dimMs + sleepMs) {
          applyBrightnessOverride(null);
          applyDisplayState('asleep');
        } else if (idle >= dimMs) {
          applyBrightnessOverride(null);
          applyDisplayState('dimmed');
        }
      }
      // Don't reset to 'active' here — that's handled by the activity listener
    }, 10_000); // check every 10 seconds

    return () => clearInterval(interval);
  }, [enabled, idleDimEnabled, sleep, timezone, applyBrightnessOverride, applyDisplayState]);

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

  return { displayState, dimOpacity, wake, wakeIfHidden, forceSleep, setRemoteBrightness };
}
