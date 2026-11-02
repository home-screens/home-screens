'use client';

import { useEffect, useRef } from 'react';
import type { DisplayCommand } from '@/lib/display-commands';
import { displayCache } from '@/lib/display-cache';
import { displayFetch } from '@/lib/display-fetch';
import { getDisplayClientId } from '@/lib/display-client-id';
import { MAIN_DISPLAY_ID } from '@/lib/display-filter';
import { snapshotConsoleBuffer } from '@/lib/console-buffer';
import { sharedStateStore } from '@/lib/shared-state-store';
import { providerHealthStore } from '@/lib/provider-health-store';
import type { BrowserStats } from '@/lib/hardware-stats';
import { useAlertStore, type DisplayAlert } from '@/stores/alert-store';
import { getShowingTimerSession, subscribeTimerPresence } from '@/lib/timer-presence';
import { dispatchModuleCommand } from '@/hooks/useModuleCommand';
import { publishRevisions, type DisplayRevisions } from '@/lib/display-heartbeat';
import type { ShownPhoto } from '@/stores/photo-show-store';
import type { AlertType, SavedMeal } from '@/types/config';
import type { ResolvedProfile } from '@/lib/schedule';

export interface CommandHandlers {
  wake: () => void;
  sleep: () => void;
  nextScreen: () => void;
  prevScreen: () => void;
  /** Jump to a screen by id or (case-insensitive) name; resolution happens
   *  in ScreenRotator, which owns the screen list. */
  gotoScreen: (target: string) => void;
  /** Wake and hold awake for N minutes, suppressing the sleep machinery. */
  sleepOverride: (minutes: number) => void;
  setBrightness: (value: number) => void;
  reload: () => void;
  /**
   * Show an alert. Owned by useDisplayControl rather than written straight
   * into the alert store so it can wake a sleeping display for an urgent one
   * and drop a routine one that arrives while asleep.
   */
  showAlert: (alert: Omit<DisplayAlert, 'id'>) => void;
  /** Put a library picture or video over the screen ("Show on the wall" from a phone). */
  showPhoto: (photo: ShownPhoto) => void;
  /** Open a recipe on a card over the screen ("Show on the wall" from the phone's Meals). */
  showRecipe: (meal: SavedMeal) => void;
  /** Close the recipe a phone put up ("Take it down"); with a meal id, only that recipe. */
  hideRecipe: (mealId: string | undefined) => void;
}

/**
 * The meal of a `show-recipe` command, or null for one that is not a meal.
 * The hub built it from the family's own meals, so this only checks the shape
 * the card draws from: an id, a name, and lists that are lists.
 */
function shownRecipeMeal(raw: unknown): SavedMeal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const meal = raw as Record<string, unknown>;
  if (typeof meal.id !== 'string' || !meal.id || typeof meal.name !== 'string' || !meal.name.trim()) return null;
  for (const list of ['ingredients', 'tags'] as const) {
    if (meal[list] !== undefined && !Array.isArray(meal[list])) return null;
  }
  return meal as unknown as SavedMeal;
}

/** Extract the Chromium version from a UA string, or null if not Chromium. */
function parseChromiumVersion(ua: string): string | null {
  const m = /Chrome\/([0-9.]+)/.exec(ua);
  return m ? m[1] : null;
}

// Module-level cache for the WebGL renderer string. It's static for the
// lifetime of a Chromium tab, and Chromium caps live WebGL contexts at ~16 —
// a 30s reporter cadence would churn through the cap over hours and could
// start returning null renderer strings on a long-running kiosk.
let cachedWebglRenderer: string | null | undefined;

function queryWebglRenderer(): string | null {
  if (cachedWebglRenderer !== undefined) return cachedWebglRenderer;
  let renderer: string | null = null;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        const r = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        if (typeof r === 'string') renderer = r;
      }
    }
  } catch {
    /* WebGL unavailable — leave null */
  }
  cachedWebglRenderer = renderer;
  return renderer;
}

function currentBrowserStats(): BrowserStats | undefined {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return undefined;
  const webglRenderer = queryWebglRenderer();
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  return {
    userAgent: nav.userAgent ?? 'unknown',
    chromiumVersion: parseChromiumVersion(nav.userAgent ?? ''),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: nav.hardwareConcurrency ?? null,
    deviceMemory: nav.deviceMemory ?? null,
    webglRenderer,
    reportedAt: new Date().toISOString(),
  };
}

const HEARTBEAT_MS = 3_000;

const KEY_RELOAD_AT = 'hs-display-key-reload-at';
const KEY_RELOAD_EVERY_MS = 60_000;

/**
 * Whether a wall the hub just refused should reload to pick up a new key.
 *
 * The key is handed to the page when it is rendered, so a wall that was open
 * when a grown-up made a new key (or first set a password) holds one the hub
 * no longer accepts, and every beat after that is refused: no commands, no
 * layout changes, no way to tell it to reload. Loading the page again gets
 * the current key. At most once a minute, remembered across the reload, so
 * a wall the hub keeps refusing for another reason does not spin.
 */
function reloadForNewKey(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY_RELOAD_AT)) || 0;
    if (Date.now() - last < KEY_RELOAD_EVERY_MS) return false;
    sessionStorage.setItem(KEY_RELOAD_AT, String(Date.now()));
    return true;
  } catch {
    // No storage to remember the reload in: reloading could loop, so do not.
    return false;
  }
}

/**
 * Whether an editor is currently watching this display's shared-state
 * snapshot, as signaled by `sharedStateWatched` on the commands-drain
 * response. Module-level because the poll (useDisplayCommands) and the
 * status reporter (useStatusReporter) are separate hooks mounted by the
 * same display page. Gates the fast bus-change re-reporting below so idle
 * displays only ship their snapshot on the 30s heartbeat.
 */
let editorWatchingSharedState = false;

/**
 * Whether the previous status POST carried an empty (or omitted) snapshot —
 * used to send exactly one empty snapshot after the last key clears.
 */
let lastReportedSharedStateEmpty = true;

/**
 * Same one-empty-report latch for provider health, so a resolved outage
 * clears the hub's served value once instead of holding it until the TTL.
 */
let lastReportedProviderHealthEmpty = true;

/** Test-only escape hatch; production code writes these from the poll/report. */
export function __resetSharedStateReportingForTests(watching = false): void {
  editorWatchingSharedState = watching;
  lastReportedSharedStateEmpty = true;
  lastReportedProviderHealthEmpty = true;
}

/**
 * Append `?display=<id>` (or `&display=<id>`) when running in multi-display
 * mode. Single-display mode (no displayId) uses the bare URL exactly as today.
 */
function withDisplayParam(url: string, displayId: string | undefined): string {
  if (!displayId) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}display=${encodeURIComponent(displayId)}`;
}

/**
 * The display's heartbeat: one request to the hub every 3s. It drains this
 * display's command queue (dispatching each command to the handlers) and
 * hands the answer's revisions to `display-heartbeat`, whose readers
 * (useLiveConfig, TimerOverlay) fetch their data only when it changed.
 *
 * When `displayId` is provided, the beat drains that display's queue and
 * also registers it in the hub's `knownDisplays` set (so it shows up in
 * the editor's "Unadopted Displays" section before being formally added).
 *
 * `drain` is false for an editor preview window: it reads the revisions
 * alone, so it follows edits without draining the real display's queue or
 * standing in for its heartbeat.
 */
export function useDisplayCommands(handlers: CommandHandlers, displayId?: string, drain = true) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    let mounted = true;

    function runCommands(commands: DisplayCommand[]) {
      for (const cmd of commands) {
        if (!mounted) break;
        switch (cmd.type) {
          case 'wake':
            handlersRef.current.wake();
            break;
          case 'sleep':
            handlersRef.current.sleep();
            break;
          case 'next-screen':
            handlersRef.current.nextScreen();
            break;
          case 'prev-screen':
            handlersRef.current.prevScreen();
            break;
          case 'goto-screen':
            if (typeof cmd.payload?.screen === 'string') {
              handlersRef.current.gotoScreen(cmd.payload.screen);
            }
            break;
          case 'sleep-override':
            if (typeof cmd.payload?.minutes === 'number' && cmd.payload.minutes > 0) {
              handlersRef.current.sleepOverride(cmd.payload.minutes);
            }
            break;
          case 'brightness':
            if (typeof cmd.payload?.value === 'number') {
              handlersRef.current.setBrightness(cmd.payload.value);
            }
            break;
          case 'reload':
            handlersRef.current.reload();
            break;
          case 'clear-alerts':
            useAlertStore.getState().clearAlerts();
            break;
          case 'alert': {
            const p = cmd.payload;
            // Only text is drawn: whatever else a hub queued is left out
            // rather than handed to the overlay.
            const title = typeof p?.title === 'string' ? p.title : '';
            const message = typeof p?.message === 'string' ? p.message : '';
            if (p && (title || message)) {
              handlersRef.current.showAlert({
                type: (p.type as AlertType) ?? 'info',
                title,
                message,
                duration: typeof p.duration === 'number' ? p.duration : undefined,
                icon: typeof p.icon === 'string' ? p.icon : undefined,
                dismissible: typeof p.dismissible === 'boolean' ? p.dismissible : undefined,
                wake: typeof p.wake === 'boolean' ? p.wake : undefined,
              });
            }
            break;
          }
          case 'show-photo': {
            const p = cmd.payload;
            // Queued for a wall that was off: a photo whose moment has passed
            // (by the hub's clock, give or take a minute) is not shown late.
            const current = typeof p?.expiresAt !== 'number' || p.expiresAt + 60_000 > Date.now();
            if (
              current
              && typeof p?.url === 'string' && p.url.startsWith('/api/backgrounds/serve?')
              && (p.kind === 'image' || p.kind === 'video')
              && typeof p.durationMs === 'number' && p.durationMs > 0
            ) {
              const sized = typeof p.width === 'number' && p.width > 0 && typeof p.height === 'number' && p.height > 0;
              handlersRef.current.showPhoto({
                url: p.url,
                kind: p.kind,
                durationMs: p.durationMs,
                ...(sized ? { width: p.width as number, height: p.height as number } : {}),
              });
            }
            break;
          }
          case 'show-recipe': {
            const p = cmd.payload;
            // A recipe sent while the wall was off is not opened once its
            // moment has passed (by the hub's clock, give or take a minute).
            const current = typeof p?.expiresAt !== 'number' || p.expiresAt + 60_000 > Date.now();
            const meal = current ? shownRecipeMeal(p?.meal) : null;
            if (meal) handlersRef.current.showRecipe(meal);
            break;
          }
          case 'hide-recipe': {
            const mealId = cmd.payload?.mealId;
            handlersRef.current.hideRecipe(typeof mealId === 'string' && mealId ? mealId : undefined);
            break;
          }
          case 'module-command': {
            const p = cmd.payload;
            if (p && typeof p.module === 'string' && typeof p.action === 'string') {
              const value = typeof p.value === 'string' || typeof p.value === 'number' ? p.value : undefined;
              dispatchModuleCommand({ module: p.module, action: p.action, value });
            }
            break;
          }
          case 'dump-console-log': {
            const entries = snapshotConsoleBuffer();
            displayFetch('/api/display/console-log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                displayId: displayId ?? MAIN_DISPLAY_ID,
                entries,
              }),
            }).catch(() => {});
            break;
          }
        }
      }
    }

    /**
     * A beat that names no build (refused after a deploy that changed auth,
     * or answered by a hub older than revisions) must still let the wall
     * notice a new build, or it could never reload onto the code that hub
     * serves. The build-id endpoint is public for this.
     */
    async function publishBuildIdAlone() {
      try {
        const res = await displayFetch('/api/system/build-id');
        if (res.ok && mounted) publishRevisions({ buildId: await res.text() });
      } catch {
        // The hub is unreachable; the next beat tries again.
      }
    }

    // One beat out at a time. While the hub is unreachable a request can
    // take the whole timeout to fail; starting another every 3 s meanwhile
    // would stack five of them on dead sockets.
    let beating = false;
    async function beat() {
      if (beating) return;
      beating = true;
      try {
        const res = await displayFetch(
          drain ? withDisplayParam('/api/display/commands', displayId) : '/api/display/revisions',
        );
        if (!mounted) return;
        if (res.status === 401 && drain && reloadForNewKey()) {
          handlersRef.current.reload();
          return;
        }
        if (!res.ok) {
          await publishBuildIdAlone();
          return;
        }
        const { commands, sharedStateWatched, revisions } = (await res.json()) as {
          commands?: DisplayCommand[];
          sharedStateWatched?: boolean;
          revisions?: DisplayRevisions;
        };
        if (drain) {
          editorWatchingSharedState = sharedStateWatched === true;
          if (Array.isArray(commands)) runCommands(commands);
        }
        // After the commands, which were drained on the hub and exist
        // nowhere else: a reader's fetch must never stand in their way.
        if (!mounted) return;
        if (revisions) {
          publishRevisions(revisions);
        } else {
          // A hub from before revisions existed (after a rollback) drains
          // commands but names no build. Without this the page would never
          // reload onto that hub's code, and never see another change.
          await publishBuildIdAlone();
        }
      } catch {
        // silent, keep polling
      } finally {
        beating = false;
      }
    }

    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [displayId, drain]);
}

/** The profile a display reports: the one in effect, and whether a schedule chose it. */
type ReportedProfile = Pick<ResolvedProfile, 'profileId' | 'scheduled'>;

/**
 * Reports display status to /api/display/status periodically (every 30s)
 * and immediately on significant state changes.
 *
 * In multi-display mode the `displayId` is included in the POST body so
 * the hub can store the report under the right per-display slot.
 */
export function useStatusReporter(
  currentScreenIndex: number,
  currentScreenId: string,
  currentScreenName: string,
  screenCount: number,
  activeProfile: ReportedProfile,
  displayState: string,
  brightness: number,
  displayId?: string,
  enabled = true,
) {
  const valuesRef = useRef({
    currentScreenIndex,
    currentScreenId,
    currentScreenName,
    screenCount,
    activeProfile,
    displayState,
    displayId,
    brightness,
  });

  useEffect(() => {
    valuesRef.current = {
      currentScreenIndex,
      currentScreenId,
      currentScreenName,
      screenCount,
      activeProfile,
      displayState,
      displayId,
      brightness,
    };
  });

  // Report immediately on significant changes. The screen ID is part of the
  // key (not just the index) because a rule takeover swaps the rendered
  // screen without touching the rotation index — the editor's "currently
  // showing" readout must reflect the takeover, not wait for the 30s beat.
  //
  // `enabled` is false for an editor preview window, which must not report
  // as (or over) the real display.
  //
  // Brightness is part of the key too: the remote holds its slider at the
  // value it sent until this display confirms it, so a brightness command
  // must be answered on the spot rather than on the next 30s beat.
  const prevKeyRef = useRef('');
  const { profileId, scheduled: profileScheduled } = activeProfile;
  useEffect(() => {
    if (!enabled) return;
    const key = `${currentScreenIndex}:${currentScreenId}:${screenCount}:${displayState}:${profileId}:${profileScheduled}:${displayId ?? ''}:${brightness}`;
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;
    reportStatus(valuesRef.current);
  }, [currentScreenIndex, currentScreenId, screenCount, displayState, profileId, profileScheduled, displayId, enabled, brightness]);

  // Same immediacy for the two facts the remote confirms against that live
  // outside React props: the alert count (Send Alert / Clear alerts) and the
  // timer session on screen ("Showing on Kitchen").
  useEffect(() => {
    if (!enabled) return;
    let lastAlertCount = useAlertStore.getState().alerts.length;
    const unsubscribeAlerts = useAlertStore.subscribe((state) => {
      if (state.alerts.length === lastAlertCount) return;
      lastAlertCount = state.alerts.length;
      reportStatus(valuesRef.current);
    });
    const unsubscribeTimer = subscribeTimerPresence(() => reportStatus(valuesRef.current));
    return () => {
      unsubscribeAlerts();
      unsubscribeTimer();
    };
  }, [enabled]);

  // Periodic report every 30s for freshness
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => reportStatus(valuesRef.current), 30_000);
    return () => clearInterval(id);
  }, [enabled]);

  // Re-report when the shared-state bus changes so the editor's live-value
  // hints (visibility conditions) stay fresh, throttled to one POST per
  // SHARED_STATE_REPORT_THROTTLE_MS with a trailing report so the last
  // change in a burst always reaches the hub. Only armed while an editor is
  // actually watching (per the commands-drain flag) — otherwise a chatty
  // producer would multiply the full-payload heartbeat ~6x for data nobody
  // is reading, and the snapshot just rides the 30s heartbeat instead.
  useEffect(() => {
    if (!enabled) return;
    let lastReport = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Both the bus and the provider-health store feed the same throttled
    // re-report: a health transition is just as much a reason to refresh the
    // editor's live view as a value change, and shares the throttle so a burst
    // across both stores still collapses into one trailing POST.
    const trigger = () => {
      if (!editorWatchingSharedState) return;
      const now = Date.now();
      const due = lastReport + SHARED_STATE_REPORT_THROTTLE_MS;
      if (now >= due) {
        lastReport = now;
        reportStatus(valuesRef.current);
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          lastReport = Date.now();
          reportStatus(valuesRef.current);
        }, due - now);
      }
    };
    const unsubscribeBus = sharedStateStore.subscribe(trigger);
    const unsubscribeHealth = providerHealthStore.subscribe(trigger);
    return () => {
      unsubscribeBus();
      unsubscribeHealth();
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);
}

const SHARED_STATE_REPORT_THROTTLE_MS = 5_000;

function reportStatus(s: {
  currentScreenIndex: number;
  currentScreenId: string;
  currentScreenName: string;
  screenCount: number;
  activeProfile: ReportedProfile;
  displayState: string;
  displayId?: string;
  brightness: number;
}) {
  // Viewport is carried implicitly inside `browserStats` (viewportWidth /
  // viewportHeight). The server derives the per-client report from those
  // fields, so we don't duplicate the data at the top level.
  //
  // The per-tab `clientId` lets the hub distinguish "two things reporting
  // with the same display ID" from "one thing reporting consistently", so
  // the editor can surface a multi-client conflict instead of silently
  // flapping between whichever tab POSTed last.
  const clientId = getDisplayClientId();

  // Shared-state bus snapshot for the editor's live-value hints. Caps are
  // bus-enforced (256 keys × 1KB values) so worst case is ~300KB and typical
  // is under 1KB.
  //
  // Tombstoned entries are INCLUDED, carrying their `staleAt`. They used to be
  // filtered out, which made the editor disagree with the display for the whole
  // 15s grace window: the display's own evaluation still sees a tombstoned key
  // (`states.has(key)` is true), so reloading a plugin with the visibility panel
  // open flipped the editor to "Hidden right now, waiting for <key>" while the
  // kiosk still showed the module. Sending `staleAt` lets the editor evaluate
  // exactly as the display does and badge the value as stale.
  const sharedState: Record<string, { value: string; updatedAt: number; staleAt?: number }> = {};
  for (const [key, entry] of sharedStateStore.snapshot()) {
    sharedState[key] = entry.staleAt === undefined
      ? { value: entry.value, updatedAt: entry.updatedAt }
      : { value: entry.value, updatedAt: entry.updatedAt, staleAt: entry.staleAt };
  }
  // Omit the field while empty so installs with no producers never pay for
  // it — but send ONE empty snapshot after the last key clears, otherwise
  // the hub would keep serving the stale values until its 5-minute TTL.
  const sharedStateEmpty = Object.keys(sharedState).length === 0;
  const includeSharedState = !sharedStateEmpty || !lastReportedSharedStateEmpty;
  lastReportedSharedStateEmpty = sharedStateEmpty;

  // Provider-health snapshot (only unhealthy plugins) — same omit-while-empty
  // convention as the bus snapshot, so a resolved outage clears exactly once.
  const providerHealth: Record<string, { message: string; since: number }> = {};
  for (const [pluginId, entry] of providerHealthStore.snapshot()) {
    providerHealth[pluginId] = { message: entry.message, since: entry.since };
  }
  const providerHealthEmpty = Object.keys(providerHealth).length === 0;
  const includeProviderHealth = !providerHealthEmpty || !lastReportedProviderHealthEmpty;
  lastReportedProviderHealthEmpty = providerHealthEmpty;

  displayFetch('/api/display/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      currentScreen: {
        index: s.currentScreenIndex,
        id: s.currentScreenId,
        name: s.currentScreenName,
      },
      screenCount: s.screenCount,
      activeProfile: s.activeProfile.profileId,
      profileScheduled: s.activeProfile.scheduled,
      displayState: s.displayState,
      brightness: s.brightness,
      timerSessionId: getShowingTimerSession(),
      activeAlerts: useAlertStore.getState().alerts.length,
      timestamp: Date.now(),
      cacheStats: displayCache.getStats(),
      clientId,
      browserStats: currentBrowserStats(),
      ...(includeSharedState ? { sharedState } : {}),
      ...(includeProviderHealth ? { providerHealth } : {}),
      // Stripped server-side before storage; lets the hub key the report
      // under the right per-display slot in `statusMap`.
      ...(s.displayId ? { displayId: s.displayId } : {}),
    }),
  }).catch(() => {});
}
