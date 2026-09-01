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
import { dispatchModuleCommand } from '@/hooks/useModuleCommand';
import type { AlertType } from '@/types/config';

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

const COMMAND_POLL_MS = 3_000;

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
 * Polls /api/display/commands every 3s and dispatches to handler callbacks.
 * Commands are drained from the server queue on each poll.
 *
 * When `displayId` is provided, the poll targets that display's queue and
 * also registers it in the hub's `knownDisplays` set (so it shows up in
 * the editor's "Unadopted Displays" section before being formally added).
 */
export function useDisplayCommands(handlers: CommandHandlers, displayId?: string, enabled = true) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    // An editor preview window must not drain the real display's queue.
    if (!enabled) return;
    let mounted = true;

    async function poll() {
      try {
        const res = await displayFetch(withDisplayParam('/api/display/commands', displayId));
        if (!res.ok || !mounted) return;
        const { commands, sharedStateWatched } = (await res.json()) as {
          commands: DisplayCommand[];
          sharedStateWatched?: boolean;
        };
        editorWatchingSharedState = sharedStateWatched === true;
        if (!Array.isArray(commands)) return;

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
              if (p && (p.title || p.message)) {
                handlersRef.current.showAlert({
                  type: (p.type as AlertType) ?? 'info',
                  title: (p.title as string) ?? '',
                  message: (p.message as string) ?? '',
                  duration: typeof p.duration === 'number' ? p.duration : undefined,
                  icon: typeof p.icon === 'string' ? p.icon : undefined,
                  dismissible: typeof p.dismissible === 'boolean' ? p.dismissible : undefined,
                  wake: typeof p.wake === 'boolean' ? p.wake : undefined,
                });
              }
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
      } catch {
        // silent — keep polling
      }
    }

    poll();
    const id = setInterval(poll, COMMAND_POLL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [displayId, enabled]);
}

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
  activeProfile: string | undefined | null,
  displayState: string,
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
    };
  });

  // Report immediately on significant changes. The screen ID is part of the
  // key (not just the index) because a rule takeover swaps the rendered
  // screen without touching the rotation index — the editor's "currently
  // showing" readout must reflect the takeover, not wait for the 30s beat.
  //
  // `enabled` is false for an editor preview window, which must not report
  // as (or over) the real display.
  const prevKeyRef = useRef('');
  useEffect(() => {
    if (!enabled) return;
    const key = `${currentScreenIndex}:${currentScreenId}:${screenCount}:${displayState}:${activeProfile}:${displayId ?? ''}`;
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;
    reportStatus(valuesRef.current);
  }, [currentScreenIndex, currentScreenId, screenCount, displayState, activeProfile, displayId, enabled]);

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
  activeProfile: string | undefined | null;
  displayState: string;
  displayId?: string;
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
      activeProfile: s.activeProfile ?? null,
      displayState: s.displayState,
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
