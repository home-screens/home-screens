'use client';

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import type { Screen, GlobalSettings, Profile } from '@/types/config';
import ScreenRenderer from './ScreenRenderer';
import SleepOverlay from './SleepOverlay';
import AlertOverlay from './AlertOverlay';
import { useDisplayControl } from './useDisplayControl';
import { useBackgroundRotation } from './useBackgroundRotation';
import { useLiveConfig } from './useLiveConfig';
import { useSharedDisplayData } from './useSharedDisplayData';
import { usePrefetchNextScreen } from './usePrefetchNextScreen';
import { useTZClock } from '@/hooks/useTZClock';
import { resolveProfileScreens } from '@/lib/schedule';
import { getTransitionConfig, getViewTransitionKeyframes } from '@/lib/transitions';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';
import { useIdleCursor } from '@/hooks/useIdleCursor';
import { usePluginStore } from '@/stores/plugin-store';
import { pluginEventBus } from '@/lib/plugin-events';
import { setHostSettings } from '@/lib/plugin-host-settings';
import { setDisplayToken } from '@/lib/display-fetch';
import type { TransitionEffect } from '@/types/config';

interface ScreenRotatorProps {
  screens: Screen[];
  settings: GlobalSettings;
  profiles?: Profile[];
  displayToken?: string | null;
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

export default function ScreenRotator({ screens: initialScreens, settings: initialSettings, profiles: initialProfiles, displayToken }: ScreenRotatorProps) {
  // Set display token before any fetches fire — useLayoutEffect runs before useEffect
  useLayoutEffect(() => { setDisplayToken(displayToken ?? null); }, [displayToken]);

  const { screens: allScreens, settings, profiles } = useLiveConfig(initialScreens, initialSettings, initialProfiles);
  const loadPlugins = usePluginStore((s) => s.loadPlugins);
  // Subscribe to plugin count to trigger re-render when plugins finish loading
  usePluginStore((s) => s.plugins.size);
  const cursorRef = useIdleCursor(settings.cursorHideSeconds ?? 3);

  // Load plugins on mount
  useEffect(() => { loadPlugins(); }, [loadPlugins]);
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
  const screens = useMemo(
    () => resolveProfileScreens(enabledScreens, profiles, settings.activeProfile, now),
    [enabledScreens, profiles, settings.activeProfile, now],
  );

  // Only poll background rotation for screens visible under the active profile
  const rotatingBackgrounds = useBackgroundRotation(screens);

  // Stable key derived from resolved screen IDs — changes only when actual set changes
  const screenKey = screens.map((s) => s.id).join(',');

  // Compute safeIndex early so display control hook can use it
  const safeIndex = (currentIndex >= 0 && currentIndex < screens.length) ? currentIndex : 0;
  const currentScreen = screens[safeIndex];

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

  // Navigation wrapped in View Transitions
  const goToScreen = useCallback((index: number) => {
    startScreenTransition(
      () => { setCurrentIndex(index); setRotationEpoch((e) => e + 1); },
      effectRef.current, durationMsRef.current, easingRef.current,
    );
  }, []);

  const nextScreen = useCallback(() => {
    if (screens.length <= 1) return;
    startScreenTransition(
      () => { setCurrentIndex((prev) => (prev + 1) % screens.length); },
      effectRef.current, durationMsRef.current, easingRef.current,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effectRef/durationMsRef/easingRef are stable refs, not deps
  }, [screens.length, screenKey]);

  const prevScreen = useCallback(() => {
    if (screens.length <= 1) return;
    startScreenTransition(
      () => { setCurrentIndex((prev) => (prev - 1 + screens.length) % screens.length); },
      effectRef.current, durationMsRef.current, easingRef.current,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effectRef/durationMsRef/easingRef are stable refs, not deps
  }, [screens.length, screenKey]);

  const resetRotation = useCallback(() => {
    setRotationEpoch((e) => e + 1);
  }, []);

  const { displayState, dimOpacity } = useDisplayControl({
    sleep: settings.sleep,
    screenIndex: safeIndex,
    screenId: currentScreen?.id ?? '',
    screenName: currentScreen?.name ?? '',
    screenCount: screens.length,
    activeProfile: settings.activeProfile,
    nextScreen,
    prevScreen,
    resetRotation,
  });

  // Subscribe to plugin navigate events
  useEffect(() => {
    return pluginEventBus.on((event) => {
      if (event.type !== 'navigate') return;
      if (event.direction === 'next') { nextScreen(); resetRotation(); }
      else if (event.direction === 'prev') { prevScreen(); resetRotation(); }
      else if (event.direction === 'screen' && event.screenIndex != null
        && event.screenIndex >= 0 && event.screenIndex < screens.length) goToScreen(event.screenIndex);
    });
  }, [nextScreen, prevScreen, goToScreen, resetRotation, screens.length]);

  // Push host settings so plugins can read them via getHostSettings().
  // useLayoutEffect ensures settings are available before plugins render.
  useLayoutEffect(() => {
    const lat = settings.latitude ?? settings.weather?.latitude ?? null;
    const lon = settings.longitude ?? settings.weather?.longitude ?? null;
    setHostSettings({
      timezone: settings.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      units: settings.weather?.units ?? 'imperial',
      latitude: lat,
      longitude: lon,
      displayWidth: settings.displayWidth || DEFAULT_DISPLAY_WIDTH,
      displayHeight: settings.displayHeight || DEFAULT_DISPLAY_HEIGHT,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? '',
    });
  }, [settings]);

  // Prefetch next screen's API data before rotation fires
  usePrefetchNextScreen(screens, screenKey, currentIndex, settings.rotationIntervalMs, displayState);

  // Reset currentIndex when the active screen set changes (handles both
  // length changes and same-length profile switches with different screens).
  // No animation — this is a hard reset (e.g. profile switch).
  useEffect(() => {
    setCurrentIndex(0);
  }, [screenKey]);

  // Pause screen rotation when display is asleep (no point cycling invisible screens).
  // rotationEpoch resets the timer after manual navigation (dot click, remote command).
  useEffect(() => {
    if (screens.length <= 1 || displayState === 'asleep') return;
    const interval = setInterval(nextScreen, settings.rotationIntervalMs);
    return () => clearInterval(interval);
  }, [nextScreen, settings.rotationIntervalMs, screens.length, displayState, rotationEpoch]);

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
      <ScreenRenderer screen={currentScreen} settings={settings} rotatingBackground={rotatingBackgrounds[currentScreen.id]} sharedData={sharedData} displayW={displayW} displayH={displayH} scale={scale} />

      {screens.length > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 8,
            zIndex: 100,
            viewTransitionName: 'pagination',
          }}
        >
          {screens.map((s, i) => (
            <button
              key={s.id}
              onClick={() => goToScreen(i)}
              aria-label={`Go to screen ${i + 1}${s.name ? `: ${s.name}` : ''}`}
              aria-current={i === safeIndex ? 'true' : undefined}
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
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: i === safeIndex ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)',
                  transition: 'background-color 0.3s',
                  display: 'block',
                }}
              />
            </button>
          ))}
        </div>
      )}

      <AlertOverlay alertSettings={settings.alerts} displayState={displayState} scale={scale} />

      <SleepOverlay
        displayState={displayState}
        dimOpacity={dimOpacity}
        screensaver={settings.screensaver}
        timezone={settings.timezone}
      />
    </div>
  );
}
