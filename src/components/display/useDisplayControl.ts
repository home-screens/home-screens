'use client';

import { useCallback, useEffect } from 'react';
import type { SleepSettings } from '@/types/config';
import { useSleepManager } from '@/hooks/useSleepManager';
import { useDisplayCommands, useStatusReporter } from '@/hooks/useDisplayCommands';
import { useAlertStore, type DisplayAlert } from '@/stores/alert-store';

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
  /**
   * False for an editor preview window: no command polling and no status
   * reports, so the preview never drains or impersonates the real display.
   */
  hubTransport?: boolean;
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
  hubTransport = true,
}: UseDisplayControlParams) {
  const {
    displayState, dimOpacity, wake, wakeIfHidden, forceSleep, setRemoteBrightness,
    wakeForAlert, releaseAlertWake, getDisplayState, brightness, brightnessOverride,
  } = useSleepManager(sleep, timezone);

  // Remote navigation implies wake when the content is hidden:
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

  // Alerts route through here, not straight into the store, because sleep is
  // the case they exist for: HA users wire smoke/CO/weather warnings for the
  // night, when the panel is black. An urgent alert (or one sent with
  // `wake: true`) wakes the display and holds it; a routine one that arrives
  // while asleep is dropped, so "Dinner at 6" never greets someone at 6 AM.
  const showAlert = useCallback((alert: Omit<DisplayAlert, 'id'>) => {
    const wakes = alert.type === 'urgent' || alert.wake === true;
    if (!wakes && getDisplayState() === 'asleep') return;
    const store = useAlertStore.getState();
    // Alerts switched off in settings: nothing is shown, so nothing may wake
    // the display either (a wake with no alert would never be released).
    if (!store.enabled) return;
    store.showAlert(alert);
    if (wakes) wakeForAlert();
  }, [getDisplayState, wakeForAlert]);

  // The alert wake ends with the last urgent alert — dismissed, expired, or
  // cleared by clear-alerts — however it went. Subscribing to the store is
  // the one place that sees all three.
  useEffect(() => {
    const hasUrgent = (alerts: DisplayAlert[]) => alerts.some((a) => a.type === 'urgent' || a.wake === true);
    return useAlertStore.subscribe((state, prev) => {
      if (state.alerts === prev.alerts) return;
      if (hasUrgent(prev.alerts) && !hasUrgent(state.alerts)) releaseAlertWake();
    });
  }, [releaseAlertWake]);

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
      showAlert,
    },
    displayId,
    hubTransport,
  );

  useStatusReporter(
    screenIndex,
    screenId,
    screenName,
    screenCount,
    activeProfile,
    displayState,
    brightness,
    displayId,
    hubTransport,
  );

  // `wake`/`forceSleep` are exposed for display rules with the `wake`/`sleep`
  // actions — the same handlers the remote command path uses, so a rule sleeps
  // or wakes the display identically to the remote button (both hold off a
  // scheduled sleep window: rules via RULE_WAKE_HOLD_MS, plain wakes via the
  // configured wakeHoldMinutes).
  return { displayState, dimOpacity, brightnessOverride, wake, forceSleep };
}
