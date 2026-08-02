'use client';

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import type { Screen, GlobalSettings, Profile, DisplayRule } from '@/types/config';
import ScreenRenderer from './ScreenRenderer';
import BackgroundProviderLayer from './BackgroundProviderLayer';
import PluginServiceLayer from './PluginServiceLayer';
import SleepOverlay from './SleepOverlay';
import AlertOverlay from './AlertOverlay';
import NetworkIndicator from './NetworkIndicator';
import PaginationDots from './PaginationDots';
import { useDisplayControl } from './useDisplayControl';
import { useDisplayRules } from './useDisplayRules';
import { useBackgroundRotation } from './useBackgroundRotation';
import { useLiveConfig, type DisplayDescriptor } from './useLiveConfig';
import { useSharedDisplayData } from './useSharedDisplayData';
import { usePrefetchNextScreen } from './usePrefetchNextScreen';
import { useScreenRotationTimer } from './useScreenRotationTimer';
import { usePauseRotation } from './usePauseRotation';
import { useScreenTransition } from './useScreenTransition';
import { useInteractionHeld } from '@/lib/interaction-hold';
import { resolveScreenDuration } from '@/lib/resolve-screen-duration';
import { useTZClock } from '@/hooks/useTZClock';
import { resolveProfileScreens, isModuleVisible } from '@/lib/schedule';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';
import { getLocation } from '@/lib/location';
import { useIdleCursor } from '@/hooks/useIdleCursor';
import { RULE_WAKE_HOLD_MS } from '@/hooks/useSleepManager';
import { usePluginStore } from '@/stores/plugin-store';
import { pluginEventBus } from '@/lib/plugin-events';
import { setHostSettings } from '@/lib/plugin-host-settings';
import { setDisplayToken } from '@/lib/display-fetch';
import { installConsoleBuffer } from '@/lib/console-buffer';

interface ScreenRotatorProps {
  screens: Screen[];
  settings: GlobalSettings;
  profiles?: Profile[];
  /** Condition → action rules owned by this display (config.rules in legacy mode). */
  rules?: DisplayRule[];
  displayToken?: string | null;
  /**
   * Multi-display routing key. When set, the live config hook re-filters
   * each `/api/config` poll for this display, and command/status traffic
   * targets this display's queue. Undefined = legacy single-display mode.
   */
  displayId?: string;
  /**
   * Registered displays derived from `config.displays`. Passed through to
   * the display-control module so its target picker shows real display names.
   * Empty array = legacy single-display mode (no display registry).
   */
  initialDisplays?: DisplayDescriptor[];
}

// ---- Main component ----

export default function ScreenRotator({ screens: initialScreens, settings: initialSettings, profiles: initialProfiles, rules: initialRules, displayToken, displayId, initialDisplays }: ScreenRotatorProps) {
  // Set display token before any fetches fire — useLayoutEffect runs before useEffect
  useLayoutEffect(() => { setDisplayToken(displayToken ?? null); }, [displayToken]);

  const { screens: allScreens, settings, profiles, rules, displays } = useLiveConfig(initialScreens, initialSettings, initialProfiles, displayId, initialDisplays, initialRules);
  const loadPlugins = usePluginStore((s) => s.loadPlugins);
  // Subscribe to plugin count to trigger re-render when plugins finish loading
  usePluginStore((s) => s.plugins.size);
  const cursorRef = useIdleCursor(settings.cursorHideSeconds ?? 3);

  // Load plugins on mount
  useEffect(() => { loadPlugins('display'); }, [loadPlugins]);

  // Install the console ring buffer so the `dump-console-log` command
  // can return recent browser logs as part of a diagnostics bundle.
  useEffect(() => {
    const uninstall = installConsoleBuffer();
    return () => uninstall();
  }, []);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Bumped on manual navigation to reset the auto-rotation timer
  const [rotationEpoch, setRotationEpoch] = useState(0);
  // Shared data needs all screens (for weather provider detection), not just active profile screens
  const sharedData = useSharedDisplayData(allScreens, settings);

  // Viewport measurement lives here (not in ScreenRenderer) so it persists across screen transitions
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    function update() {
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const displayW = settings.displayWidth || DEFAULT_DISPLAY_WIDTH;
  const displayH = settings.displayHeight || DEFAULT_DISPLAY_HEIGHT;
  const scale = viewportSize.w > 0
    ? Math.min(viewportSize.w / displayW, viewportSize.h / displayH)
    : 0; // Start at 0 (invisible) until measured, preventing unscaled flash

  // Exclude disabled screens before profile resolution
  const enabledScreens = useMemo(
    () => allScreens.filter((s) => s.enabled !== false),
    [allScreens],
  );

  // Re-evaluate profile schedule every minute (timezone-aware)
  const now = useTZClock(settings.timezone, 60_000);

  // Filter out screens whose schedule excludes "now".
  // Falls back to enabledScreens when the filter leaves nothing — better to
  // show something than a blank kiosk. Mirrors resolveProfileScreens'
  // "no match → all screens" safety.
  const scheduledScreens = useMemo(() => {
    const filtered = enabledScreens.filter((s) => isModuleVisible(s.schedule, now));
    return filtered.length > 0 ? filtered : enabledScreens;
  }, [enabledScreens, now]);

  const screens = useMemo(
    () => resolveProfileScreens(scheduledScreens, profiles, settings.activeProfile, now),
    [scheduledScreens, profiles, settings.activeProfile, now],
  );

  // Stable key derived from resolved screen IDs — changes only when actual set changes
  const screenKey = screens.map((s) => s.id).join(',');

  // Compute safeIndex early so display control hook can use it
  const safeIndex = (currentIndex >= 0 && currentIndex < screens.length) ? currentIndex : 0;
  const currentScreen = screens[safeIndex];
  const currentDuration = currentScreen
    ? resolveScreenDuration(currentScreen, settings)
    : settings.rotationIntervalMs;

  // Display rules: a firing `showScreen` rule pins its target as a takeover
  // render source, without touching currentIndex — rotation resumes exactly
  // where it left off when the takeover ends.
  //
  // This MUST stay above useDisplayControl: it produces `renderedScreen`,
  // which useDisplayControl consumes. `wake`/`sleep`-action firings therefore
  // come back as counters and are performed by an effect below, where the
  // sleep manager is in scope.
  const {
    takeoverScreen,
    takeoverOverridesSleep,
    releaseActiveTakeover,
    wakeRequest,
    sleepRequest,
  } = useDisplayRules(rules, allScreens, settings.timezone);
  const renderedScreen = takeoverScreen ?? currentScreen;

  // Poll background rotation for the profile-visible screens plus, while a
  // takeover pins a screen excluded from normal rotation (the feature's
  // primary alert-screen shape), that screen — its rotating background must
  // keep cycling for the takeover's duration. Not allScreens: that would
  // poll every off-rotation screen's background around the clock.
  const backgroundScreens = useMemo(() => {
    if (!takeoverScreen || screens.some((s) => s.id === takeoverScreen.id)) return screens;
    return [...screens, takeoverScreen];
  }, [screens, takeoverScreen]);
  const rotatingBackgrounds = useBackgroundRotation(backgroundScreens);

  // Stable `transition(fn)` that reads the live transition settings internally.
  const transition = useScreenTransition(settings);

  // Navigation wrapped in View Transitions.
  // Timer reset is handled by the `[safeIndex]` effect below — no explicit
  // epoch bump needed here (would otherwise fire twice per nav).
  // Every navigation releases an active rule takeover (human wins): the
  // rotation timer is suspended during a takeover, so any call here is a
  // human or remote action. The release is a no-op when no takeover is up.
  const goToScreen = useCallback((index: number) => {
    releaseActiveTakeover();
    transition(() => { setCurrentIndex(index); });
  }, [releaseActiveTakeover, transition]);

  const nextScreen = useCallback(() => {
    releaseActiveTakeover();
    if (screens.length <= 1) return;
    transition(() => { setCurrentIndex((prev) => (prev + 1) % screens.length); });
  }, [screens.length, releaseActiveTakeover, transition]);

  const prevScreen = useCallback(() => {
    releaseActiveTakeover();
    if (screens.length <= 1) return;
    transition(() => { setCurrentIndex((prev) => (prev - 1 + screens.length) % screens.length); });
  }, [screens.length, releaseActiveTakeover, transition]);

  const resetRotation = useCallback(() => {
    setRotationEpoch((e) => e + 1);
  }, []);

  // All pause state and the double-tap gesture. Must run above
  // useDisplayControl, which consumes `clearPause` for its remote next/prev.
  const { paused, handleDotClick, clearPause } = usePauseRotation({
    pauseEnabled: settings.pauseEnabled,
    pauseTimeoutSeconds: settings.pauseTimeoutSeconds,
    activeIndex: safeIndex,
    screenKey,
    goToScreen,
  });

  // Status reports name the takeover screen when one is pinned, so the
  // editor's "currently showing" readout stays truthful during a rule firing.
  const { displayState, dimOpacity, wake, forceSleep } = useDisplayControl({
    sleep: settings.sleep,
    timezone: settings.timezone,
    screenIndex: safeIndex,
    screenId: renderedScreen?.id ?? '',
    screenName: renderedScreen?.name ?? '',
    screenCount: screens.length,
    activeProfile: settings.activeProfile,
    nextScreen,
    prevScreen,
    resetRotation,
    clearPause,
    displayId,
  });

  // Perform `wake`/`sleep`-action rule firings. `useDisplayRules` reports them
  // as counters (see its docblock); both guards compare against the previous
  // value so mount, and any re-run caused by `wake`/`forceSleep` changing
  // identity, are no-ops.
  //
  // A rule-fired wake holds the display awake through a scheduled sleep window
  // for RULE_WAKE_HOLD_MS, so an alert isn't blacked out ~10s later. Touch and
  // remote wakes call `wake` with no hold and stay re-slept by the schedule.
  const prevWakeRequestRef = useRef(wakeRequest);
  useEffect(() => {
    if (wakeRequest === prevWakeRequestRef.current) return;
    prevWakeRequestRef.current = wakeRequest;
    wake({ holdMs: RULE_WAKE_HOLD_MS });
  }, [wakeRequest, wake]);

  // A rule-fired sleep is exactly the remote sleep command — any touch or the
  // sleep schedule wakes it as usual. The engine already released the takeover.
  const prevSleepRequestRef = useRef(sleepRequest);
  useEffect(() => {
    if (sleepRequest === prevSleepRequestRef.current) return;
    prevSleepRequestRef.current = sleepRequest;
    forceSleep();
  }, [sleepRequest, forceSleep]);

  // Subscribe to plugin navigate events
  useEffect(() => {
    return pluginEventBus.on((event) => {
      if (event.type !== 'navigate') return;
      if (event.direction === 'next') { nextScreen(); resetRotation(); clearPause(); }
      else if (event.direction === 'prev') { prevScreen(); resetRotation(); clearPause(); }
      else if (event.direction === 'screen' && event.screenIndex != null
        && event.screenIndex >= 0 && event.screenIndex < screens.length) { goToScreen(event.screenIndex); clearPause(); }
    });
  }, [nextScreen, prevScreen, goToScreen, resetRotation, clearPause, screens.length]);

  // Push host settings so plugins can read them via getHostSettings().
  // useLayoutEffect ensures settings are available before plugins render.
  useLayoutEffect(() => {
    const location = getLocation(settings);
    setHostSettings({
      timezone: settings.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      units: settings.weather?.units ?? 'imperial',
      latitude: location?.lat ?? null,
      longitude: location?.lon ?? null,
      displayWidth: settings.displayWidth || DEFAULT_DISPLAY_WIDTH,
      displayHeight: settings.displayHeight || DEFAULT_DISPLAY_HEIGHT,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? '',
    });
  }, [settings]);

  // Prefetch next screen's API data before rotation fires
  usePrefetchNextScreen(
    screens, screenKey, currentIndex, currentDuration, displayState, settings.timezone,
    takeoverScreen !== null,
  );

  // Reset currentIndex when the active screen set changes (handles both length
  // changes and same-length profile switches with different screens). No
  // animation — this is a hard reset. usePauseRotation clears pause on the
  // same key.
  useEffect(() => {
    setCurrentIndex(0);
  }, [screenKey]);

  // The one pause-clear that cannot live in usePauseRotation: it needs
  // displayState, which comes from useDisplayControl, which consumes the
  // clearPause that hook returns. Waking must never restore a pause set before
  // the display slept.
  const prevDisplayStateRef = useRef(displayState);
  useEffect(() => {
    const prev = prevDisplayStateRef.current;
    prevDisplayStateRef.current = displayState;
    if (prev === 'asleep' && displayState !== 'asleep') clearPause();
  }, [displayState, clearPause]);

  // Rotation timer: schedules a single setTimeout per screen using the
  // screen's resolved duration. Sticky screens (0) skip scheduling entirely.
  // rotationEpoch resets the timer after manual navigation or on current-screen changes.
  // interactionHeld pauses rotation while an overlay (e.g. an open recipe) is
  // being read; the overlay's own auto-dismiss timers bound the hold.
  const interactionHeld = useInteractionHeld();
  useScreenRotationTimer({
    durationMs: currentDuration,
    onAdvance: nextScreen,
    // FIVE ways a kiosk sits frozen on one screen, all of which look identical
    // from across the room. Start here when debugging "it stopped rotating":
    //   1. screens.length <= 1  — only one screen resolves for the active
    //      profile/schedule, so there is nothing to rotate to
    //   2. displayState === 'asleep'  — sleep schedule or a remote/rule sleep
    //   3. paused  — someone double-tapped the active pagination dot
    //      (auto-resumes after settings.pauseTimeoutSeconds, 0 = never)
    //   4. interactionHeld  — an overlay such as an open recipe is being read;
    //      the overlay's own auto-dismiss timers bound this
    //   5. takeoverScreen  — a display rule is pinning a screen. currentIndex
    //      is untouched, so rotation resumes exactly where it was on release
    active: screens.length > 1 && displayState !== 'asleep' && !paused && !interactionHeld && !takeoverScreen,
    resetKey: rotationEpoch,
  });

  // Restart the rotation timer whenever the current screen changes so the
  // new screen gets its full dwell time (not the residual from the previous).
  useEffect(() => {
    setRotationEpoch((e) => e + 1);
  }, [safeIndex]);

  if (screens.length === 0) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        No screens configured
      </div>
    );
  }

  return (
    <div ref={cursorRef} style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      backgroundColor: '#000',
      // Center the scaled renderer using padding — flex centering doesn't work
      // because the ScreenRenderer's layout box (1920x1080) is larger than the
      // viewport, and overflow: hidden clips the layout box before transform.
      // With transformOrigin: top left on the renderer, we position it manually.
      paddingTop: viewportSize.h > 0 ? Math.max(0, (viewportSize.h - displayH * scale) / 2) : 0,
      paddingLeft: viewportSize.w > 0 ? Math.max(0, (viewportSize.w - displayW * scale) / 2) : 0,
      boxSizing: 'border-box',
    }}>
      {/* renderedScreen is the takeover screen while a rule is firing,
          resolved from the display's full screen list (an alert screen may
          be deliberately excluded from normal rotation). */}
      <ScreenRenderer screen={renderedScreen} settings={settings} rotatingBackground={rotatingBackgrounds[renderedScreen.id]} sharedData={sharedData} displayW={displayW} displayH={displayH} scale={scale} availableDisplays={displays} displayId={displayId} />

      {/* Sibling of ScreenRenderer inside the stable outer div, so state
          producers persist across screen rotation. Uses allScreens (not the
          profile-filtered list) — a producer must keep publishing even when
          its home screen is currently excluded. */}
      <BackgroundProviderLayer screens={allScreens} settings={settings} sharedData={sharedData} />

      {/* Demand-driven plugin state providers — one headless mount per
          loaded plugin exporting `stateProvider`, fed every key this
          display's conditions, Text tokens, and rules reference. Also uses
          allScreens: demand must survive profile filtering. */}
      <PluginServiceLayer screens={allScreens} rules={rules} />

      <PaginationDots
        screens={screens}
        activeIndex={safeIndex}
        paused={paused}
        onDotClick={handleDotClick}
      />

      <NetworkIndicator displayState={displayState} scale={scale} />
      <AlertOverlay alertSettings={settings.alerts} displayState={displayState} scale={scale} />

      {/* A takeover implies wake: suppress the sleep overlay rather than
          calling wake() — the sleep manager re-asserts a scheduled sleep
          window every 10s, so suppression is the only way an asleep display
          shows the alert screen AND resumes sleeping when it releases.

          Time-boxed by takeoverOverridesSleep. A `while` takeover has no end
          while its condition holds, so an unbounded suppression let a latching
          sensor keep a bedroom display at full brightness all night. Past the
          window the overlay returns over the still-pinned takeover screen. */}
      <SleepOverlay
        displayState={takeoverOverridesSleep ? 'active' : displayState}
        dimOpacity={takeoverOverridesSleep ? 0 : dimOpacity}
        screensaver={settings.screensaver}
        timezone={settings.timezone}
      />
    </div>
  );
}
