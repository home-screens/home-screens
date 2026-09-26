'use client';

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import type { Screen, GlobalSettings, Profile, DisplayRule } from '@/types/config';
import ScreenRenderer from './ScreenRenderer';
import BackgroundProviderLayer from './BackgroundProviderLayer';
import EmptyDisplayHint from './EmptyDisplayHint';
import { isScreenEmpty } from '@/lib/display-filter';
import { selectRotatingScreens } from '@/lib/rotating-screens';
import PluginServiceLayer from './PluginServiceLayer';
import SleepOverlay from './SleepOverlay';
import AlertOverlay from './AlertOverlay';
import { useAlertStore } from '@/stores/alert-store';
import TimerOverlay from './TimerOverlay';
import NetworkIndicator from './NetworkIndicator';
import PaginationDots from './PaginationDots';
import { useDisplayControl } from './useDisplayControl';
import { useDisplayRules } from './useDisplayRules';
import { useBackgroundRotation } from './useBackgroundRotation';
import { useLiveConfig, type DisplayDescriptor } from './useLiveConfig';
import { useSharedDisplayData } from './useSharedDisplayData';
import { usePrefetchNextScreen } from './usePrefetchNextScreen';
import { useBootWarmup } from './useBootWarmup';
import { useScreenRotationTimer } from './useScreenRotationTimer';
import { usePauseRotation } from './usePauseRotation';
import { useScreenTransition } from './useScreenTransition';
import { useSwipeNavigation } from './useSwipeNavigation';
import { useInteractionHeld } from '@/lib/interaction-hold';
import { useTapRotationHold } from './useTapRotationHold';
import { resolveScreenDuration } from '@/lib/resolve-screen-duration';
import { resolveScreenTargetIndex } from '@/lib/resolve-screen-target';
import { useWallClock } from '@/hooks/useTZClock';
import { resolveProfileScreens, isModuleVisible } from '@/lib/schedule';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';
import { getLocation } from '@/lib/location';
import { useIdleCursor } from '@/hooks/useIdleCursor';
import { RULE_WAKE_HOLD_MS, WAKE_TAP_GUARD_MS } from '@/hooks/useSleepManager';
import { usePluginStore } from '@/stores/plugin-store';
import { pluginEventBus } from '@/lib/plugin-events';
import { setHostSettings } from '@/lib/plugin-host-settings';
import { setDisplayToken } from '@/lib/display-fetch';
import { ModuleSurfaceProvider } from '@/components/modules/module-surface';
import { installConsoleBuffer } from '@/lib/console-buffer';
import { showsPaginationDots } from '@/lib/pagination-dots';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import NoTimezoneBanner from '@/components/NoTimezoneBanner';

interface ScreenRotatorProps {
  screens: Screen[];
  settings: GlobalSettings;
  /**
   * The hub's own clock zone, which the display runs in while no zone is
   * saved. Handed down from the server render so the first client render
   * matches the server's HTML instead of switching to the kiosk's own zone.
   */
  hubTimezone: string;
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
  /**
   * Start on this screen instead of the first one (`?screen=<id>`). If the
   * screen exists but is out of the rotation (disabled, off-profile, off-
   * schedule) it is still shown, pinned, until the first navigation.
   */
  initialScreenId?: string;
  /**
   * Editor preview (`?preview=1`): rotation held, sleep schedule ignored, no
   * command polling or status reports. What the Preview button opens.
   */
  preview?: boolean;
  /**
   * The ETag a wall's config read would have been answered with when the
   * server rendered this page (`wallConfigEtag`). The live config starts from
   * it, so a freshly loaded wall fetches the config only if it changed since.
   */
  configEtag?: string;
}

export default function ScreenRotator({ screens: initialScreens, settings: initialSettings, hubTimezone, profiles: initialProfiles, rules: initialRules, displayToken, displayId, initialDisplays, initialScreenId, preview = false, configEtag }: ScreenRotatorProps) {
  // Set display token before any fetches fire — useLayoutEffect runs before useEffect
  useLayoutEffect(() => { setDisplayToken(displayToken ?? null); }, [displayToken]);

  const { screens: allScreens, settings, timezoneSaved, profiles, rules, displays } = useLiveConfig(initialScreens, initialSettings, hubTimezone, initialProfiles, displayId, initialDisplays, initialRules, configEtag);
  const loadPlugins = usePluginStore((s) => s.loadPlugins);
  // Subscribe to plugin count to trigger re-render when plugins finish loading
  usePluginStore((s) => s.plugins.size);
  const cursorRef = useIdleCursor(settings.cursorHideSeconds ?? 3);

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
  // The requested start screen, consumed by the first screen-set effect that
  // finds it in the rotation. While it is not in the rotation (disabled,
  // off-profile) it is rendered pinned instead — a preview of the screen
  // being edited must show that screen, whatever the rotation thinks.
  const startScreenRef = useRef<string | null>(initialScreenId ?? null);
  const [pinnedScreenId, setPinnedScreenId] = useState<string | null>(initialScreenId ?? null);
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
  const now = useWallClock(settings.timezone, 60_000);

  // Filter out screens whose schedule excludes "now".
  // Falls back to enabledScreens when the filter leaves nothing — better to
  // show something than a blank kiosk. Mirrors resolveProfileScreens'
  // "no match → all screens" safety.
  const scheduledScreens = useMemo(() => {
    const filtered = enabledScreens.filter((s) => isModuleVisible(s.schedule, now));
    return filtered.length > 0 ? filtered : enabledScreens;
  }, [enabledScreens, now]);

  // Last filter before the rotation list is final: a screen nobody has put
  // anything on yet does not get a turn on the wall (see selectRotatingScreens
  // for what counts as empty, and for the all-empty case the watermark owns).
  // The dots, the rotation timer, prefetch and the screen count reported to
  // the hub all read this same list, so a skipped screen leaves no dot behind
  // and no gap in "2 of 3".
  const screens = useMemo(
    () => selectRotatingScreens(
      resolveProfileScreens(scheduledScreens, profiles, settings.activeProfile, now),
    ),
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
  // A preview window runs no rules: a sleep rule would black it out and a
  // showScreen takeover would swap out the screen being previewed.
  } = useDisplayRules(preview ? undefined : rules, allScreens, settings.timezone);
  // A pinned start screen only matters while it is outside the rotation;
  // once the rotation contains it, currentIndex already points at it.
  const pinnedScreen = pinnedScreenId && !screens.some((s) => s.id === pinnedScreenId)
    ? allScreens.find((s) => s.id === pinnedScreenId) ?? null
    : null;
  const renderedScreen = takeoverScreen ?? pinnedScreen ?? currentScreen;

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
  //
  // Backward navigation passes 'backward' so directional transition effects
  // (slide, slide-up, flip) animate the way the navigation moves. goToScreen
  // compares against a ref of the current index rather than listing it as a
  // dependency — that would churn its identity (it's handed to
  // usePauseRotation) on every screen change.
  const safeIndexRef = useRef(safeIndex);
  useEffect(() => { safeIndexRef.current = safeIndex; }, [safeIndex]);

  // Any navigation also forgets the requested start screen (see
  // startScreenRef): both the pin and the "land here when the rotation next
  // includes it" intent, so a later profile switch cannot yank the display
  // back to it.
  const forgetStartScreen = useCallback(() => {
    startScreenRef.current = null;
    setPinnedScreenId(null);
  }, []);

  const goToScreen = useCallback((index: number) => {
    releaseActiveTakeover();
    forgetStartScreen();
    const direction = index < safeIndexRef.current ? 'backward' : 'forward';
    transition(() => { setCurrentIndex(index); }, direction);
  }, [releaseActiveTakeover, forgetStartScreen, transition]);

  const nextScreen = useCallback(() => {
    releaseActiveTakeover();
    forgetStartScreen();
    if (screens.length <= 1) return;
    transition(() => { setCurrentIndex((prev) => (prev + 1) % screens.length); });
  }, [screens.length, releaseActiveTakeover, forgetStartScreen, transition]);

  const prevScreen = useCallback(() => {
    releaseActiveTakeover();
    forgetStartScreen();
    if (screens.length <= 1) return;
    transition(() => { setCurrentIndex((prev) => (prev - 1 + screens.length) % screens.length); }, 'backward');
  }, [screens.length, releaseActiveTakeover, forgetStartScreen, transition]);

  const resetRotation = useCallback(() => {
    setRotationEpoch((e) => e + 1);
  }, []);

  // The pause gesture and the progress line both live on the dots, so with
  // the dots off neither exists. Folding this into `pauseEnabled` lets the
  // hook's own "feature switched off" clear release a pause taken before the
  // dots went away, which would otherwise freeze rotation with no pill and no
  // gesture left to resume it.
  const showDots = showsPaginationDots(settings);

  // All pause state and the double-tap gesture. Must run above
  // useDisplayControl, which consumes `clearPause` for its remote next/prev.
  const { paused, pausedUntil, handleDotClick, clearPause } = usePauseRotation({
    pauseEnabled: showDots && (settings.pauseEnabled ?? true),
    pauseTimeoutSeconds: settings.pauseTimeoutSeconds,
    activeIndex: safeIndex,
    screenKey,
    goToScreen,
  });

  // Remote `goto-screen` command: the payload is a raw id-or-name string
  // (voice says names) resolved here against the rotation list — the hub
  // never sees this display's screens, so resolution can't happen there.
  // A target outside the current rotation (excluded by profile/schedule, or
  // a typo'd sentence) is ignored with a warn; jumping to a screen the
  // rotation can't otherwise show would strand the kiosk on it.
  const gotoScreenByTarget = useCallback((target: string) => {
    const index = resolveScreenTargetIndex(screens, target);
    if (index === -1) {
      console.warn(`goto-screen: no screen in the current rotation matches "${target}"`);
      return;
    }
    goToScreen(index);
    clearPause();
  }, [screens, goToScreen, clearPause]);

  // Status reports name the takeover screen when one is pinned, so the
  // editor's "currently showing" readout stays truthful during a rule firing.
  const { displayState, dimOpacity, brightnessOverride, wake, forceSleep } = useDisplayControl({
    // A preview window ignores the sleep schedule: it exists to show a
    // screen, and a black rectangle at 10 PM reads as "it's broken".
    sleep: preview ? undefined : settings.sleep,
    timezone: settings.timezone,
    screenIndex: safeIndex,
    screenId: renderedScreen?.id ?? '',
    screenName: renderedScreen?.name ?? '',
    screenCount: screens.length,
    activeProfile: settings.activeProfile,
    nextScreen,
    prevScreen,
    gotoScreen: gotoScreenByTarget,
    resetRotation,
    clearPause,
    displayId,
    hubTransport: !preview,
  });

  /**
   * Whether the wall is showing live content a finger may act on.
   *
   * Not the same question as `displayState === 'active'`. A standing
   * brightness from the remote or a Display Control module (1-99) parks the
   * display in 'dimmed', but that dim is a deliberate brightness choice:
   * content is drawn normally and no screensaver covers it (see
   * `brightnessOverride` in useSleepManager, and SleepOverlay). Gating on the
   * state alone made every tap and flick on such a display do nothing at all,
   * with the content plainly visible and nothing on screen to explain it.
   *
   * Idle dims, scheduled dims and sleep keep the wake-only behaviour: there
   * the first touch means "wake up", not "press what is under my finger".
   */
  const contentIsLive = displayState === 'active'
    || (displayState === 'dimmed' && brightnessOverride !== null);

  // interactionHeld gates both the swipe gesture below and the rotation
  // timer further down: true while an overlay (e.g. an open recipe) is up, and
  // for a moment after someone taps a control (useTapRotationHold below).
  const interactionHeld = useInteractionHeld();

  // A tap on any control holds the screen briefly, so a rotation cannot take
  // the chart out from under a half-finished tap. Only while the content is
  // live: a touch on a dimmed or sleeping display is a wake, and the sleep
  // manager owns that.
  useTapRotationHold(contentIsLive && !preview);

  // Flick navigation. Same triple as remote/plugin nav: navigate, grant the
  // new screen a full dwell, resume a paused rotator. Gated at pointerdown
  // inside the hook, and only while the content is live: a flick on an idle-
  // dimmed, scheduled-dim or asleep display should just wake it (the sleep
  // manager's own touch listener does that). Navigating too would land the
  // waking user on a screen they never saw change, and would silently discard
  // an explicit double-tap pause.
  useSwipeNavigation({
    enabled: (settings.swipeEnabled ?? true) && contentIsLive && !interactionHeld,
    onSwipeLeft: () => { nextScreen(); resetRotation(); clearPause(); },
    onSwipeRight: () => { prevScreen(); resetRotation(); clearPause(); },
  });

  // Chromium only honours overscroll-behavior at the document root (html/
  // body) — on an inner div it cannot suppress the edge-swipe history
  // gesture that would navigate the kiosk away from /display. Set it
  // imperatively so only display surfaces opt out (globals.css is shared
  // with the editor and /remote). --overscroll-history-navigation=0 in the
  // kiosk launch flags is the belt-and-suspenders for this.
  //
  // touch-action: pan-y is what keeps flick navigation alive on a real
  // touchscreen: with a permissive touch-action (auto/manipulation), Chromium
  // claims a horizontal touch pan as a scroll gesture — at the viewport even
  // though /display has nothing to scroll, and at any vertically-scrollable
  // module region (chore lists, agendas) even though they never scroll
  // sideways — and fires pointercancel, so useSwipeNavigation never sees the
  // pointerup (mouse input skips the gesture recognizer, which is why dev
  // and E2E never hit this). The effective touch-action is resolved per
  // touched element, so the root alone is not enough: the subtree rule
  // covers every module region. The only two surfaces that legitimately own
  // a horizontal touch drag get their gestures back — the same two
  // useSwipeNavigation excludes at pointerdown. Inline touchAction styles
  // would override the sheet, so display modules must not set values looser
  // than pan-y. Side effect, welcome on a kiosk: pinch-zoom and double-tap
  // zoom are gone.
  useEffect(() => {
    const html = document.documentElement.style;
    const body = document.body.style;
    const prevHtml = html.overscrollBehavior;
    const prevBody = body.overscrollBehavior;
    const prevHtmlTouch = html.touchAction;
    const prevBodyTouch = body.touchAction;
    html.overscrollBehavior = 'none';
    body.overscrollBehavior = 'none';
    html.touchAction = 'pan-y';
    body.touchAction = 'pan-y';
    const sheet = document.createElement('style');
    sheet.textContent = [
      'body * { touch-action: pan-y; }',
      "body input[type='range'] { touch-action: none; }",
      'body [data-swipe-ignore], body [data-swipe-ignore] * { touch-action: auto; }',
    ].join('\n');
    document.head.appendChild(sheet);
    return () => {
      html.overscrollBehavior = prevHtml;
      body.overscrollBehavior = prevBody;
      html.touchAction = prevHtmlTouch;
      body.touchAction = prevBodyTouch;
      sheet.remove();
    };
  }, []);

  // Perform `wake`/`sleep`-action rule firings. `useDisplayRules` reports them
  // as counters (see its docblock); both guards compare against the previous
  // value so mount, and any re-run caused by `wake`/`forceSleep` changing
  // identity, are no-ops.
  //
  // A rule-fired wake holds the display awake through a scheduled sleep window
  // for RULE_WAKE_HOLD_MS, so an alert isn't blacked out ~10s later. Touch and
  // remote wakes get their own hold (SleepSettings.wakeHoldMinutes), armed
  // inside useSleepManager only when the wake lands in a schedule window.
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
      timezone: settings.timezone,
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

  // Boot warm-up: every other screen's module data, one screen every 400ms,
  // so the first pass of the rotation does not flash skeletons. Not in a
  // preview window, which shows one screen and never rotates.
  useBootWarmup(screens, screenKey, safeIndex, settings.timezone, !preview);

  // Reset currentIndex when the active screen set changes (handles both length
  // changes and same-length profile switches with different screens). No
  // animation — this is a hard reset. usePauseRotation clears pause on the
  // same key. The first set that contains the requested start screen lands
  // on it instead of screen 1 (and unpins it); until then it stays pinned.
  //
  // Keyed by the last screenKey handled: React Strict Mode (dev) runs mount
  // effects twice, and a second run for the same key must not treat the
  // just-consumed start screen as "gone" and reset to screen 1.
  const screensRef = useRef(screens);
  screensRef.current = screens;
  const handledScreenKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (handledScreenKeyRef.current === screenKey) return;
    handledScreenKeyRef.current = screenKey;
    const start = startScreenRef.current;
    if (start) {
      const index = screensRef.current.findIndex((s) => s.id === start);
      if (index !== -1) {
        startScreenRef.current = null;
        setPinnedScreenId(null);
        setCurrentIndex(index);
        return;
      }
    }
    setCurrentIndex(0);
  }, [screenKey]);

  // The one pause-clear that cannot live in usePauseRotation: it needs
  // displayState, which comes from useDisplayControl, which consumes the
  // clearPause that hook returns. Waking must never restore a pause set before
  // the display slept.
  const prevDisplayStateRef = useRef(displayState);
  const prevContentIsLiveRef = useRef(contentIsLive);
  const wakeGuardUntilRef = useRef(0);
  useEffect(() => {
    const prev = prevDisplayStateRef.current;
    prevDisplayStateRef.current = displayState;
    if (prev === 'asleep' && displayState !== 'asleep') clearPause();
    // Stamp wake transitions for the tap guard below. The sleep manager wakes
    // on a passive touchstart, so by the time the same finger's `click` fires
    // the state often already reads 'active' — the timestamp covers that gap.
    // Keyed on the content becoming live rather than on the state reaching
    // 'active', so raising a standing brightness back to 100 (which was never
    // a wake: the content was live and tappable the whole time) does not eat
    // the next 700ms of taps.
    const wasLive = prevContentIsLiveRef.current;
    prevContentIsLiveRef.current = contentIsLive;
    if (!wasLive && contentIsLive) {
      wakeGuardUntilRef.current = Date.now() + WAKE_TAP_GUARD_MS;
    }
  }, [displayState, contentIsLive, clearPause]);

  // A tap on a sleeping display, or one dimmed by idle or by schedule, should
  // only wake it, and the same touch must not activate whatever tappable module
  // content (event blocks, chores, todos, recipes) happens to be under the
  // finger. Swipe navigation already has this gate via its `enabled` flag;
  // this is the click-side equivalent, applied at capture so it runs before
  // any module handler.
  const contentIsLiveRef = useRef(contentIsLive);
  contentIsLiveRef.current = contentIsLive;
  useEffect(() => {
    function onClickCapture(e: MouseEvent) {
      // Alert controls are never module content: an urgent alert wakes the
      // display itself, and the tap on its Dismiss button seconds later must
      // land, not be eaten as the "wake tap".
      if (e.target instanceof Element && e.target.closest('[data-alert-control]')) return;
      if (!contentIsLiveRef.current || Date.now() < wakeGuardUntilRef.current) {
        e.stopPropagation();
        e.preventDefault();
      }
    }
    window.addEventListener('click', onClickCapture, { capture: true });
    return () => window.removeEventListener('click', onClickCapture, { capture: true });
  }, []);

  // Rotation timer: schedules a single setTimeout per screen using the
  // screen's resolved duration. Sticky screens (0) skip scheduling entirely.
  // rotationEpoch resets the timer after manual navigation or on current-screen changes.
  // interactionHeld pauses rotation while an overlay (e.g. an open recipe) is
  // being read; the overlay's own auto-dismiss timers bound the hold.
  const dwellStartedAt = useScreenRotationTimer({
    durationMs: currentDuration,
    onAdvance: nextScreen,
    // SIX ways a kiosk sits frozen on one screen, all of which look identical
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
    //   6. preview  — an editor preview window (?preview=1); held on purpose
    // Unsticking paths: dot taps, remote/voice commands, and (unless
    // swipeEnabled is off or the display is dimmed/asleep) a horizontal
    // flick anywhere on the touchscreen — states 3-5 all yield to any of
    // them.
    active: screens.length > 1 && displayState !== 'asleep' && !paused && !interactionHeld && !takeoverScreen && !preview,
    resetKey: rotationEpoch,
  });

  // Restart the rotation timer whenever the current screen changes so the
  // new screen gets its full dwell time (not the residual from the previous).
  useEffect(() => {
    setRotationEpoch((e) => e + 1);
  }, [safeIndex]);

  // Nothing to show — no screens resolve (none configured, or every one
  // disabled), or every resolved screen is empty (no modules and no
  // background of its own). The second case is what a fresh install looks
  // like: the seed config ships one screen with no modules, so without this
  // branch the first thing a new Pi shows is a black rectangle that reads as
  // a failed install. The setup watermark prints this hub's own address;
  // `setupHintEnabled: false` (global, or overridden for this display)
  // leaves the panel black instead.
  //
  // Only ALL of them being empty reaches here: one empty screen among full
  // ones never joins the rotation in the first place (selectRotatingScreens),
  // which is why the watermark cannot be triggered by a half-built config.
  //
  // A rule takeover wins over the watermark: an alert screen pinned by a
  // `showScreen` rule is usually excluded from rotation, so "every rotating
  // screen is empty" says nothing about it. And the provider layers stay
  // mounted either way — a rule keyed on plugin state can only ever fire if
  // the producer is running, watermark or not.
  //
  // The hint replaces only the ScreenRenderer: the overlays below (sleep,
  // alerts, timers) stay mounted, so a blank display still honours its sleep
  // schedule, a remote sleep command still blacks the panel, and an urgent
  // alert still shows.
  const showHint = !takeoverScreen && !pinnedScreen && (screens.length === 0 || screens.every(isScreenEmpty));

  // Which watermark: a true first boot (nothing was ever here) gets the
  // address only; a display that showed real content before, or whose
  // screens are all switched off, also gets the "want a blank screen
  // instead?" line, because whoever emptied it knows the setting exists.
  // "Showed content before" is remembered per display in this browser,
  // since the config itself cannot tell a deleted screen from one that
  // never existed.
  const hadContentKey = `hs:had-content:${displayId ?? 'default'}`;
  const [hadContentBefore, setHadContentBefore] = useState(false);
  useEffect(() => {
    try { setHadContentBefore(window.localStorage.getItem(hadContentKey) === '1'); } catch { /* storage blocked */ }
  }, [hadContentKey]);
  useEffect(() => {
    if (showHint) return;
    setHadContentBefore(true);
    try { window.localStorage.setItem(hadContentKey, '1'); } catch { /* storage blocked */ }
  }, [showHint, hadContentKey]);
  const deliberatelyEmpty = hadContentBefore || (allScreens.length > 0 && enabledScreens.length === 0);

  // The thin line under the active dot. Off in settings, no dots to draw it
  // under, or nothing armed (sticky screen, single screen), draws nothing.
  const rotationProgress = showDots && (settings.showRotationProgress ?? true) && dwellStartedAt !== null && currentDuration > 0
    ? { startedAt: dwellStartedAt, durationMs: currentDuration }
    : null;

  // While an urgent alert bar is up, the whole canvas is pushed down under it
  // and scaled to what is left, so the bar covers nothing — the clock stays
  // readable through a tornado warning. One transform on the renderer's
  // wrapper: modules never relayout. Only the canvas moves; the dots and the
  // sleep/timer overlays keep their places.
  const urgentInset = useAlertStore((s) => s.urgentInsetPx);
  const canvasPush = urgentInset > 0 && viewportSize.h > 0
    ? `translateY(${urgentInset}px) scale(${Math.max(0.3, (viewportSize.h - urgentInset) / viewportSize.h)})`
    : 'none';

  return (
    <div ref={cursorRef} style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      backgroundColor: '#000',
    }}>
      {/* renderedScreen is the takeover screen while a rule is firing,
          resolved from the display's full screen list (an alert screen may
          be deliberately excluded from normal rotation). */}
      {showHint || !renderedScreen ? (
        settings.setupHintEnabled === false
          ? <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000' }} />
          : <EmptyDisplayHint deliberatelyEmpty={deliberatelyEmpty} />
      ) : (
        <div
          data-testid="display-canvas"
          style={{
            position: 'absolute',
            inset: 0,
            // Center the scaled renderer using padding — flex centering doesn't
            // work because the ScreenRenderer's layout box (1920x1080) is larger
            // than the viewport, and overflow: hidden clips the layout box before
            // transform. With transformOrigin: top left on the renderer, we
            // position it manually.
            paddingTop: viewportSize.h > 0 ? Math.max(0, (viewportSize.h - displayH * scale) / 2) : 0,
            paddingLeft: viewportSize.w > 0 ? Math.max(0, (viewportSize.w - displayW * scale) / 2) : 0,
            boxSizing: 'border-box',
            transform: canvasPush,
            transformOrigin: 'top center',
            transition: 'transform 300ms ease',
          }}
        >
          {/* The preview surface keeps tappable modules (display-control)
              from commanding the real kiosk this window is standing in for. */}
          <ModuleSurfaceProvider value={preview ? 'preview' : 'display'}>
            <ScreenRenderer screen={renderedScreen} settings={settings} rotatingBackground={rotatingBackgrounds[renderedScreen.id]} sharedData={sharedData} displayW={displayW} displayH={displayH} scale={scale} availableDisplays={displays} displayId={displayId} />
          </ModuleSurfaceProvider>
        </div>
      )}

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

      {showDots && (
        <PaginationDots
          screens={screens}
          activeIndex={safeIndex}
          paused={paused || preview}
          onDotClick={handleDotClick}
          onResume={preview ? undefined : clearPause}
          pausedUntil={pausedUntil}
          progress={preview ? null : rotationProgress}
        />
      )}

      <NetworkIndicator displayState={displayState} scale={scale} />
      <AlertOverlay alertSettings={settings.alerts} displayState={displayState} viewport={viewportSize} />

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
        brightnessOverride={brightnessOverride}
        screensaver={settings.screensaver}
        timezone={settings.timezone}
        timeFormat={settings.timeFormat}
      />

      {/* Same z as SleepOverlay but later in DOM, so a running timer shows
          over a sleeping display (starting one is an explicit wake intent)
          while urgent alerts (9998) still surface above it. */}
      {/* A preview must neither show nor control the live routine. The overlay
          owns its polling and step-done writes, so leave it unmounted here. */}
      {!preview && <TimerOverlay displayId={displayId} viewport={viewportSize} />}

      {/* The wall runs on the hub's clock while no zone is saved, so the
          preview says so where the parent is looking. Not on a real wall:
          nobody there can act on it. */}
      {preview && !timezoneSaved && (
        <div style={{ position: 'fixed', top: 12, left: 12, right: 12, zIndex: DISPLAY_LAYERS.previewNotice, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <NoTimezoneBanner zone={{ timezone: settings.timezone, saved: false }} className="pointer-events-auto max-w-[760px] shadow-lg" />
        </div>
      )}
    </div>
  );
}
