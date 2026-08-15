'use client';

import { useCallback } from 'react';
import type { SleepSettings } from '@/types/config';
import { useSleepManager } from '@/hooks/useSleepManager';
import { useDisplayCommands, useStatusReporter } from '@/hooks/useDisplayCommands';

interface UseDisplayControlParams {
  sleep: SleepSettings | undefined;
  /** Display timezone for evaluating sleep/dim schedule windows. */
  timezone: string | undefined;
  screenIndex: number;
  screenId: string;
  screenName: string;
  screenCount: number;
  activeProfile: string | undefined | null;
  nextScreen: () => void;
  prevScreen: () => void;
  /** Jump to a screen by id or name. The rotator's resolver already clears
   *  pause and releases takeovers; the wrapper below only adds the
   *  wake-if-hidden intent shared by all remote navigation. */
  gotoScreen: (target: string) => void;
  resetRotation: () => void;
  clearPause?: () => void;
  /** Multi-display routing key (undefined = legacy single-display mode). */
  displayId?: string;
}

export function useDisplayControl({
  sleep,
  timezone,
  screenIndex,
  screenId,
  screenName,
  screenCount,
  activeProfile,
  nextScreen,
  prevScreen,
  gotoScreen,
  resetRotation,
  clearPause,
  displayId,
}: UseDisplayControlParams) {
  const { displayState, dimOpacity, wake, wakeIfHidden, forceSleep, setRemoteBrightness } =
    useSleepManager(sleep, timezone);

  // Remote navigation implies wake when the content is hidden (issue #26):
  // changing screens on a sleeping display otherwise "works" invisibly under
  // the opaque overlay, and a schedule-dimmed display is nearly as dark. Same
  // precedent as rule takeovers and remote timer starts — an explicit remote
  // action on a hidden display is a wake intent. The plain wake() arms the
  // configured schedule-window hold, so the navigated-to screen stays visible
  // for wakeHoldMinutes instead of one 10s tick. wakeIfHidden lives in
  // useSleepManager (backed by synchronous refs) because the command drain
  // runs a whole batch — e.g. `sleep` then `goto-screen` — before React
  // re-renders, and it leaves a remote-set partial brightness untouched.
  const remoteNext = useCallback(() => {
    wakeIfHidden();
    nextScreen();
    resetRotation();
    clearPause?.();
  }, [wakeIfHidden, nextScreen, resetRotation, clearPause]);

  const remotePrev = useCallback(() => {
    wakeIfHidden();
    prevScreen();
    resetRotation();
    clearPause?.();
  }, [wakeIfHidden, prevScreen, resetRotation, clearPause]);

  const remoteGoto = useCallback((target: string) => {
    wakeIfHidden();
    gotoScreen(target);
  }, [wakeIfHidden, gotoScreen]);

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  // "Keep the display on for N minutes": a wake whose hold suppresses the
  // sleep schedule, dim schedule, and idle transitions (useSleepManager).
  const sleepOverride = useCallback((minutes: number) => {
    wake({ holdMs: minutes * 60_000 });
  }, [wake]);

  useDisplayCommands(
    {
      wake,
      sleep: forceSleep,
      nextScreen: remoteNext,
      prevScreen: remotePrev,
      gotoScreen: remoteGoto,
      sleepOverride,
      setBrightness: setRemoteBrightness,
      reload,
    },
    displayId,
  );

  useStatusReporter(
    screenIndex,
    screenId,
    screenName,
    screenCount,
    activeProfile,
    displayState,
    displayId,
  );

  // `wake`/`forceSleep` are exposed for display rules with the `wake`/`sleep`
  // actions — the same handlers the remote command path uses, so a rule sleeps
  // or wakes the display identically to the remote button (both hold off a
  // scheduled sleep window: rules via RULE_WAKE_HOLD_MS, plain wakes via the
  // configured wakeHoldMinutes).
  return { displayState, dimOpacity, wake, forceSleep };
}
