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
  resetRotation,
  clearPause,
  displayId,
}: UseDisplayControlParams) {
  const { displayState, dimOpacity, wake, forceSleep, setRemoteBrightness } = useSleepManager(sleep, timezone);

  const remoteNext = useCallback(() => {
    nextScreen();
    resetRotation();
    clearPause?.();
  }, [nextScreen, resetRotation, clearPause]);

  const remotePrev = useCallback(() => {
    prevScreen();
    resetRotation();
    clearPause?.();
  }, [prevScreen, resetRotation, clearPause]);

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  useDisplayCommands(
    {
      wake,
      sleep: forceSleep,
      nextScreen: remoteNext,
      prevScreen: remotePrev,
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
  // or wakes the display identically to the remote button (a scheduled sleep
  // window re-asserts itself within 10s either way).
  return { displayState, dimOpacity, wake, forceSleep };
}
