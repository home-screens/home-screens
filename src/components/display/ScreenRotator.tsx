'use client';

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import type { Screen, GlobalSettings, Profile, DisplayRule } from '@/types/config';
import ScreenRenderer from './ScreenRenderer';
import BackgroundProviderLayer from './BackgroundProviderLayer';
import PluginServiceLayer from './PluginServiceLayer';
import SleepOverlay from './SleepOverlay';
import AlertOverlay from './AlertOverlay';
import NetworkIndicator from './NetworkIndicator';
import { useDisplayControl } from './useDisplayControl';
import { useDisplayRules } from './useDisplayRules';
import { useBackgroundRotation } from './useBackgroundRotation';
import { useLiveConfig, type DisplayDescriptor } from './useLiveConfig';
import { useSharedDisplayData } from './useSharedDisplayData';
import { usePrefetchNextScreen } from './usePrefetchNextScreen';
import { useScreenRotationTimer } from './useScreenRotationTimer';
import { useInteractionHeld } from '@/lib/interaction-hold';
import { resolveScreenDuration } from '@/lib/resolve-screen-duration';
import { useTZClock } from '@/hooks/useTZClock';
import { resolveProfileScreens, isModuleVisible } from '@/lib/schedule';
import { getTransitionConfig, getViewTransitionKeyframes } from '@/lib/transitions';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';
import { getLocation } from '@/lib/location';
import { useIdleCursor } from '@/hooks/useIdleCursor';
import { RULE_WAKE_HOLD_MS } from '@/hooks/useSleepManager';
import { usePluginStore } from '@/stores/plugin-store';
import { pluginEventBus } from '@/lib/plugin-events';
import { setHostSettings } from '@/lib/plugin-host-settings';
import { setDisplayToken } from '@/lib/display-fetch';
import { installConsoleBuffer } from '@/lib/console-buffer';
import type { TransitionEffect } from '@/types/config';

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

// ---- View Transitions API integration ----

const supportsViewTransitions = typeof document !== 'undefined' && 'startViewTransition' in document;

/**
 * Wraps a DOM update in the View Transitions API for smooth compositor-driven
 * animation. Falls back to a direct update when the API isn't available.
 *
 * View Transitions capture GPU-backed screenshots of the old and new states,
 * then animate between them as flat textures on the compositor thread. This is
 * dramatically cheaper than animating live DOM layers.
 */
function startScreenTransition(
  updateFn: () => void,
  effect: TransitionEffect,
  durationMs: number,
  easing: string,
) {
  if (!supportsViewTransitions || durationMs === 0 || effect === 'none') {
    updateFn();
    return;
  }

  const vt = document.startViewTransition(() => {
    flushSync(updateFn);
  });

  const kf = getViewTransitionKeyframes(effect);

  vt.ready.then(() => {
    const opts: KeyframeAnimationOptions = { duration: durationMs, easing, fill: 'both' };

    document.documentElement.animate(kf.exit, {
      ...opts,
      pseudoElement: '::view-transition-old(root)',
    });
    document.documentElement.animate(kf.enter, {
      ...opts,
      pseudoElement: '::view-transition-new(root)',
    });
  }).catch(() => {
    // A concurrent startViewTransition() call aborted this transition.
    // The DOM update already committed via flushSync; only the animation is lost.
  });
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
  useEffect(() => { loadPlugins(); }, [loadPlugins]);

  // Install the console ring buffer so the `dump-console-log` command
  // can return recent browser logs as part of a diagnostics bundle.
  useEffect(() => {
    const uninstall = installConsoleBuffer();
    return () => uninstall();
  }, []);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Bumped on manual navigation to reset the auto-rotation timer
  const [rotationEpoch, setRotationEpoch] = useState(0);
  // Pause rotation state (toggled by double-tapping the active pagination dot)
  const [paused, setPaused] = useState(false);
  const lastDotTapRef = useRef(0);
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
  // where it left off when the takeover ends. The `wake` action routes to the
  // sleep manager through a ref because useDisplayControl (which owns the
  // sleep manager) is called further down with callbacks defined below.
  const wakeRef = useRef<(options?: { holdMs?: number }) => void>(() => {});
  const sleepRef = useRef<() => void>(() => {});
  // A rule-fired wake holds the display awake through a scheduled sleep window
  // for RULE_WAKE_HOLD_MS, so an alert isn't blacked out ~10s later; touch and
  // remote wakes (which call `wake` with no hold) stay re-slept by the schedule.
  const onRuleWake = useCallback(() => { wakeRef.current({ holdMs: RULE_WAKE_HOLD_MS }); }, []);
  // A rule-fired sleep is exactly the remote sleep command — any touch or the
  // sleep schedule wakes it as usual. The engine already released the takeover.
  const onRuleSleep = useCallback(() => { sleepRef.current(); }, []);
  const { takeoverScreen, releaseActiveTakeover } = useDisplayRules(rules, allScreens, settings.timezone, onRuleWake, onRuleSleep);
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

  // Transition config — stored in refs so callbacks don't recreate on config changes
  const tc = getTransitionConfig(settings.transitionEffect, settings.transitionDuration);
  const effectRef = useRef<TransitionEffect>(settings.transitionEffect ?? 'fade');
  const durationMsRef = useRef(tc.duration * 1000);
  const easingRef = useRef(tc.easing);
  useEffect(() => {
    effectRef.current = settings.transitionEffect ?? 'fade';
    durationMsRef.current = tc.duration * 1000;
    easingRef.current = tc.easing;
  }, [settings.transitionEffect, tc.duration, tc.easing]);

  // Navigation wrapped in View Transitions.
  // Timer reset is handled by the `[safeIndex]` effect below — no explicit
  // epoch bump needed here (would otherwise fire twice per nav).
  // Every navigation releases an active rule takeover (human wins): the
  // rotation timer is suspended during a takeover, so any call here is a
  // human or remote action. The release is a no-op when no takeover is up.
  const goToScreen = useCallback((index: number) => {
    releaseActiveTakeover();
    startScreenTransition(
      () => { setCurrentIndex(index); },
      effectRef.current, durationMsRef.current, easingRef.current,
    );
  }, [releaseActiveTakeover]);

  const nextScreen = useCallback(() => {
    releaseActiveTakeover();
    if (screens.length <= 1) return;
    startScreenTransition(
      () => { setCurrentIndex((prev) => (prev + 1) % screens.length); },
      effectRef.current, durationMsRef.current, easingRef.current,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effectRef/durationMsRef/easingRef are stable refs, not deps
  }, [screens.length, screenKey, releaseActiveTakeover]);

  const prevScreen = useCallback(() => {
    releaseActiveTakeover();
    if (screens.length <= 1) return;
    startScreenTransition(
      () => { setCurrentIndex((prev) => (prev - 1 + screens.length) % screens.length); },
      effectRef.current, durationMsRef.current, easingRef.current,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effectRef/durationMsRef/easingRef are stable refs, not deps
  }, [screens.length, screenKey, releaseActiveTakeover]);

  const resetRotation = useCallback(() => {
    setRotationEpoch((e) => e + 1);
  }, []);

  const clearPause = useCallback(() => setPaused(false), []);

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

  // Late-bind the sleep manager's wake/forceSleep for `wake`/`sleep`-action
  // rules. The rules hook runs above useDisplayControl (it feeds renderedScreen
  // into it), so it reaches them through refs instead of direct dependencies.
  useEffect(() => { wakeRef.current = wake; }, [wake]);
  useEffect(() => { sleepRef.current = forceSleep; }, [forceSleep]);

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

  // Reset currentIndex and pause state when the active screen set changes
  // (handles both length changes and same-length profile switches with
  // different screens). No animation — this is a hard reset (e.g. profile switch).
  useEffect(() => {
    setCurrentIndex(0);
    setPaused(false);
  }, [screenKey]);

  // Clear pause when display wakes from sleep
  const prevDisplayStateRef = useRef(displayState);
  useEffect(() => {
    const prev = prevDisplayStateRef.current;
    prevDisplayStateRef.current = displayState;
    if (prev === 'asleep' && displayState !== 'asleep') setPaused(false);
  }, [displayState]);

  // Rotation timer: schedules a single setTimeout per screen using the
  // screen's resolved duration. Sticky screens (0) skip scheduling entirely.
  // rotationEpoch resets the timer after manual navigation or on current-screen changes.
  // interactionHeld pauses rotation while an overlay (e.g. an open recipe) is
  // being read; the overlay's own auto-dismiss timers bound the hold.
  const interactionHeld = useInteractionHeld();
  useScreenRotationTimer({
    durationMs: currentDuration,
    onAdvance: nextScreen,
    // A rule takeover suspends rotation: currentIndex is untouched, so the
    // rotation resumes exactly where it was when the takeover releases.
    active: screens.length > 1 && displayState !== 'asleep' && !paused && !interactionHeld && !takeoverScreen,
    resetKey: rotationEpoch,
  });

  // Restart the rotation timer whenever the current screen changes so the
  // new screen gets its full dwell time (not the residual from the previous).
  useEffect(() => {
    setRotationEpoch((e) => e + 1);
  }, [safeIndex]);

  // Clear pause if the feature is disabled via live config reload
  useEffect(() => {
    if (settings.pauseEnabled === false) setPaused(false);
  }, [settings.pauseEnabled]);

  // Auto-resume rotation after the configured timeout
  useEffect(() => {
    if (!paused) return;
    const timeout = settings.pauseTimeoutSeconds ?? 300;
    if (timeout === 0) return; // 0 means stay paused indefinitely
    const timer = setTimeout(() => setPaused(false), timeout * 1000);
    return () => clearTimeout(timer);
  }, [paused, settings.pauseTimeoutSeconds]);

  // Handle double-tap on the active pagination dot to toggle pause
  const handleDotClick = useCallback((index: number) => {
    if (index === safeIndex && (settings.pauseEnabled ?? true)) {
      const now = Date.now();
      if (now - lastDotTapRef.current < 300) {
        setPaused((p) => !p);
        lastDotTapRef.current = 0; // reset to avoid triple-tap triggering again
        return;
      }
      lastDotTapRef.current = now;
      return; // single tap on active dot is a no-op
    }
    lastDotTapRef.current = 0;
    goToScreen(index);
    setPaused(false); // navigating away resumes rotation
  }, [safeIndex, settings.pauseEnabled, goToScreen]);

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

      {screens.length > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            zIndex: 100,
            viewTransitionName: 'pagination',
          }}
        >
          {paused && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.1em',
                color: 'rgba(255,255,255,0.85)',
                backgroundColor: 'rgba(0,0,0,0.45)',
                padding: '3px 8px',
                borderRadius: 6,
                animation: 'pause-fade-in 0.3s ease-out',
              }}
            >
              PAUSED
            </span>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
          {screens.map((s, i) => {
            const isActive = i === safeIndex;
            const showPause = isActive && paused;
            return (
              <button
                key={s.id}
                onClick={() => handleDotClick(i)}
                aria-label={
                  showPause
                    ? 'Resume rotation'
                    : isActive
                      ? 'Pause rotation (double-tap)'
                      : `Go to screen ${i + 1}${s.name ? `: ${s.name}` : ''}`
                }
                aria-current={isActive ? 'true' : undefined}
                style={{
                  width: 44,
                  height: 44,
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {showPause ? (
                  <span
                    style={{
                      display: 'flex',
                      gap: 2,
                      filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))',
                    }}
                  >
                    <span style={{ width: 3, height: 10, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.85)' }} />
                    <span style={{ width: 3, height: 10, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.85)' }} />
                  </span>
                ) : (
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: isActive ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)',
                      boxShadow: '0 0 0 1px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)',
                      transition: 'background-color 0.3s',
                      display: 'block',
                    }}
                  />
                )}
              </button>
            );
          })}
          </div>
        </div>
      )}

      {/* Keyframes for pause label fade-in */}
      {paused && (
        <style>{`
          @keyframes pause-fade-in {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      )}

      <NetworkIndicator displayState={displayState} scale={scale} />
      <AlertOverlay alertSettings={settings.alerts} displayState={displayState} scale={scale} />

      {/* A takeover implies wake: suppress the sleep overlay rather than
          calling wake() — the sleep manager re-asserts a scheduled sleep
          window every 10s, so suppression is the only way an asleep display
          shows the alert screen AND resumes sleeping when it releases. */}
      <SleepOverlay
        displayState={takeoverScreen ? 'active' : displayState}
        dimOpacity={takeoverScreen ? 0 : dimOpacity}
        screensaver={settings.screensaver}
        timezone={settings.timezone}
      />
    </div>
  );
}
