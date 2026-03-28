'use client';

import { useEffect, useRef } from 'react';
import type { DisplayCommand } from '@/lib/display-commands';
import { displayCache } from '@/lib/display-cache';
import { displayFetch } from '@/lib/display-fetch';
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
 * Polls /api/display/commands every 3s and dispatches to handler callbacks.
 * Commands are drained from the server queue on each poll.
 */
export function useDisplayCommands(handlers: CommandHandlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const res = await displayFetch('/api/display/commands');
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
  }, []);
}

/**
 * Reports display status to /api/display/status periodically (every 30s)
 * and immediately on significant state changes.
 */
export function useStatusReporter(
  currentScreenIndex: number,
  currentScreenId: string,
  currentScreenName: string,
  screenCount: number,
  activeProfile: string | undefined | null,
  displayState: string,
) {
  const valuesRef = useRef({
    currentScreenIndex,
    currentScreenId,
    currentScreenName,
    screenCount,
    activeProfile,
    displayState,
  });

  useEffect(() => {
    valuesRef.current = {
      currentScreenIndex,
      currentScreenId,
      currentScreenName,
      screenCount,
      activeProfile,
      displayState,
    };
  });

  // Report immediately on significant changes
  const prevKeyRef = useRef('');
  useEffect(() => {
    const key = `${currentScreenIndex}:${screenCount}:${displayState}:${activeProfile}`;
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;
    reportStatus(valuesRef.current);
  }, [currentScreenIndex, screenCount, displayState, activeProfile]);

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
}) {
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
    }),
  }).catch(() => {});
}
