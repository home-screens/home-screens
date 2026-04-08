'use client';

import { useEffect, useRef } from 'react';
import type { DisplayCommand } from '@/lib/display-commands';
import { displayCache } from '@/lib/display-cache';
import { displayFetch } from '@/lib/display-fetch';
import { getDisplayClientId } from '@/lib/display-client-id';
import { useAlertStore } from '@/stores/alert-store';
import type { AlertType } from '@/types/config';

export interface CommandHandlers {
  wake: () => void;
  sleep: () => void;
  nextScreen: () => void;
  prevScreen: () => void;
  setBrightness: (value: number) => void;
  reload: () => void;
}

const COMMAND_POLL_MS = 3_000;

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
export function useDisplayCommands(handlers: CommandHandlers, displayId?: string) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const res = await displayFetch(withDisplayParam('/api/display/commands', displayId));
        if (!res.ok || !mounted) return;
        const { commands } = (await res.json()) as {
          commands: DisplayCommand[];
        };
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
                useAlertStore.getState().showAlert({
                  type: (p.type as AlertType) ?? 'info',
                  title: (p.title as string) ?? '',
                  message: (p.message as string) ?? '',
                  duration: typeof p.duration === 'number' ? p.duration : undefined,
                  icon: typeof p.icon === 'string' ? p.icon : undefined,
                  dismissible: typeof p.dismissible === 'boolean' ? p.dismissible : undefined,
                });
              }
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
  }, [displayId]);
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

  // Report immediately on significant changes
  const prevKeyRef = useRef('');
  useEffect(() => {
    const key = `${currentScreenIndex}:${screenCount}:${displayState}:${activeProfile}:${displayId ?? ''}`;
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;
    reportStatus(valuesRef.current);
  }, [currentScreenIndex, screenCount, displayState, activeProfile, displayId]);

  // Periodic report every 30s for freshness
  useEffect(() => {
    const id = setInterval(() => reportStatus(valuesRef.current), 30_000);
    return () => clearInterval(id);
  }, []);
}

function reportStatus(s: {
  currentScreenIndex: number;
  currentScreenId: string;
  currentScreenName: string;
  screenCount: number;
  activeProfile: string | undefined | null;
  displayState: string;
  displayId?: string;
}) {
  // Self-report the viewport so the hub can pre-fill per-display dimensions
  // in the editor. `innerWidth`/`innerHeight` are post-rotation, so a
  // portrait-rotated 1920×1080 panel reports as 1080×1920 directly.
  //
  // The per-tab `clientId` lets the hub distinguish "two things reporting
  // with the same display ID" from "one thing reporting consistently", so
  // the editor can surface a multi-client conflict instead of silently
  // flapping between whichever tab POSTed last.
  const viewport =
    typeof window !== 'undefined'
      ? { width: window.innerWidth, height: window.innerHeight }
      : undefined;
  const clientId = getDisplayClientId();
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
      ...(viewport ? { reportedViewport: viewport } : {}),
      // Stripped server-side before storage; lets the hub key the report
      // under the right per-display slot in `statusMap`.
      ...(s.displayId ? { displayId: s.displayId } : {}),
    }),
  }).catch(() => {});
}
