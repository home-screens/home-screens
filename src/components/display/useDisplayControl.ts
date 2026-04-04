'use client';

import { useCallback } from 'react';
import type { SleepSettings } from '@/types/config';
import { useSleepManager } from '@/hooks/useSleepManager';
import { useDisplayCommands, useStatusReporter } from '@/hooks/useDisplayCommands';

interface UseDisplayControlParams {
  sleep: SleepSettings | undefined;
  screenIndex: number;
  screenId: string;
  screenName: string;
  screenCount: number;
  activeProfile: string | undefined | null;
  nextScreen: () => void;
  prevScreen: () => void;
  resetRotation: () => void;
  clearPause?: () => void;
}

export function useDisplayControl({
  sleep,
  screenIndex,
  screenId,
  screenName,
  screenCount,
  activeProfile,
  nextScreen,
  prevScreen,
  resetRotation,
  clearPause,
}: UseDisplayControlParams) {
  const { displayState, dimOpacity, wake, forceSleep, setRemoteBrightness } = useSleepManager(sleep);

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

  useDisplayCommands({
    wake,
    sleep: forceSleep,
    nextScreen: remoteNext,
    prevScreen: remotePrev,
    setBrightness: setRemoteBrightness,
    reload,
  });

  useStatusReporter(
    screenIndex,
    screenId,
    screenName,
    screenCount,
    activeProfile,
    displayState,
  );

  return { displayState, dimOpacity };
}
