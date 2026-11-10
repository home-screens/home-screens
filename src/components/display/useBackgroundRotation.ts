'use client';

import { useState, useEffect } from 'react';
import type { Screen } from '@/types/config';
import { displayFetch } from '@/lib/display-fetch';
import { subscribeRevisions } from '@/lib/display-heartbeat';
import { isRotationActive, rotationCacheKey } from '@/lib/photo-source';
import { setBackgroundCaption } from '@/lib/background-caption-store';

/** How often the client polls the server-side rotation cache (ms) */
const BG_POLL_MS = 60_000;

/**
 * The key the poll starts over on: every rotating screen's `rotationCacheKey`,
 * the same key the hub's rotation cache starts over on, so a changed album
 * filter or a newly ticked wall re-asks at once and nothing else does.
 * Exported so the editor's canvas asks with the same key.
 */
export function buildRotationKey(screens: Screen[]): string {
  return JSON.stringify(
    screens
      .filter((s) => isRotationActive(s.backgroundRotation))
      .map((s) => ({ id: s.id, key: rotationCacheKey(s.backgroundRotation) })),
  );
}

export function useBackgroundRotation(screens: Screen[]) {
  // Persist rotating backgrounds across screen mounts, keyed by screen id. A
  // screen with no entry has no answer yet (see resolveScreenBackground).
  const [backgrounds, setBackgrounds] = useState<Record<string, string | null>>({});

  const rotationKey = buildRotationKey(screens);

  // A screen with rotation off shows its own picture. Recording that as its
  // answer keeps the picture up when rotation is switched on, until the first
  // photo arrives, instead of blanking it for the lookup.
  const staticIds = screens.filter((s) => !isRotationActive(s.backgroundRotation)).map((s) => s.id).join('\n');
  useEffect(() => {
    if (!staticIds) return;
    setBackgrounds((prev) => {
      const unset = staticIds.split('\n').filter((id) => prev[id] !== null);
      return unset.length === 0 ? prev : { ...prev, ...Object.fromEntries(unset.map((id) => [id, null])) };
    });
  }, [staticIds]);

  useEffect(() => {
    // '[]' is JSON.stringify([]): the "no rotating screens" sentinel.
    // Skip polling when nothing is configured to rotate.
    if (rotationKey === '[]') return;

    const screensWithRotation = screens.filter((s) => isRotationActive(s.backgroundRotation));

    // One poll at a time: the screens are asked in turn, and with the hub
    // away each ask can take the whole request timeout, so a poll can outlast
    // the interval. A second one on top would double the dead requests.
    let polling = false;
    async function pollBackgrounds() {
      if (polling) return;
      polling = true;
      try {
        await pollEachScreen();
      } finally {
        polling = false;
      }
    }

    async function pollEachScreen() {
      for (const screen of screensWithRotation) {
        try {
          const res = await displayFetch(`/api/backgrounds/rotate?screenId=${encodeURIComponent(screen.id)}`);
          if (res.ok) {
            const data = await res.json();
            const path: string | null = data.path || null;
            setBackgrounds((prev) => (prev[screen.id] === path ? prev : { ...prev, [screen.id]: path }));
            const credit = data.credit;
            setBackgroundCaption(screen.id, path && credit && typeof credit.name === 'string' && typeof credit.source === 'string' ? credit : null);
            continue;
          }
        } catch {
          // same as a failed status, below
        }
        // A failed lookup keeps the current background; before one, the
        // screen's own picture stands.
        setBackgrounds((prev) => (screen.id in prev ? prev : { ...prev, [screen.id]: null }));
      }
    }

    pollBackgrounds();
    const id = setInterval(pollBackgrounds, BG_POLL_MS);
    // The heartbeat says when a rotation answered anew (an interval that
    // passed on the hub, Refresh now in the editor): re-ask then, not on the
    // next minute. The first beat only records where the hub is.
    let seen: string | undefined;
    const unsubscribe = subscribeRevisions((revisions) => {
      const current = revisions.rotation;
      if (current === undefined) return;
      const changed = seen !== undefined && seen !== current;
      seen = current;
      if (changed) void pollBackgrounds();
    });
    return () => {
      clearInterval(id);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on rotationKey change; other deps are stable or intentionally excluded
  }, [rotationKey]);

  return backgrounds;
}
