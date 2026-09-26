'use client';

import { useState, useEffect } from 'react';
import type { Screen } from '@/types/config';
import { displayFetch } from '@/lib/display-fetch';

/** How often the client polls the server-side rotation cache (ms) */
const BG_POLL_MS = 60_000;

/**
 * Build the stable rotation key for a list of screens. Exported so unit
 * tests can verify that every field affecting background selection
 * (including Immich filters) participates in the key — otherwise the
 * useEffect below will not re-run when the user changes those filters.
 *
 * Uses JSON.stringify rather than a delimiter-joined string so that future
 * fields containing `:` or `|` (e.g. URLs, free-text queries) cannot collide
 * across configs.
 */
export function buildRotationKey(screens: Screen[]): string {
  return JSON.stringify(
    screens
      .filter((s) => s.backgroundRotation?.enabled)
      .map((s) => {
        const r = s.backgroundRotation!;
        return {
          id: s.id,
          source: r.source || 'unsplash',
          query: r.query,
          intervalMinutes: r.intervalMinutes,
          immichAlbumId: r.immichAlbumId ?? null,
          immichPersonId: r.immichPersonId ?? null,
          immichFavoritesOnly: r.immichFavoritesOnly ?? false,
          icloudAlbumUrl: r.icloudAlbumUrl ?? null,
        };
      }),
  );
}

export function useBackgroundRotation(screens: Screen[]) {
  // Persist rotating backgrounds across screen mounts, keyed by screen id. A
  // screen with no entry has no answer yet (see resolveScreenBackground).
  const [backgrounds, setBackgrounds] = useState<Record<string, string | null>>({});

  // Build a stable key from only the rotation-relevant config so we don't
  // restart polling when unrelated screen fields change. Must include EVERY
  // field that affects which photo the server returns, otherwise changing
  // (e.g.) an Immich album filter would not invalidate the rotation cache.
  const rotationKey = buildRotationKey(screens);

  // A screen with rotation off shows its own picture. Recording that as its
  // answer keeps the picture up when rotation is switched on, until the first
  // photo arrives, instead of blanking it for the lookup.
  const staticIds = screens.filter((s) => !s.backgroundRotation?.enabled).map((s) => s.id).join('\n');
  useEffect(() => {
    if (!staticIds) return;
    setBackgrounds((prev) => {
      const unset = staticIds.split('\n').filter((id) => prev[id] !== null);
      return unset.length === 0 ? prev : { ...prev, ...Object.fromEntries(unset.map((id) => [id, null])) };
    });
  }, [staticIds]);

  useEffect(() => {
    // '[]' is JSON.stringify([]) — the "no rotating screens" sentinel.
    // Skip polling when nothing is configured to rotate.
    if (rotationKey === '[]') return;

    const screensWithRotation = screens.filter((s) => s.backgroundRotation?.enabled);

    async function pollBackgrounds() {
      for (const screen of screensWithRotation) {
        try {
          const res = await displayFetch(`/api/backgrounds/rotate?screenId=${encodeURIComponent(screen.id)}`);
          if (res.ok) {
            const data = await res.json();
            const path: string | null = data.path || null;
            setBackgrounds((prev) => (prev[screen.id] === path ? prev : { ...prev, [screen.id]: path }));
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
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on rotationKey change; other deps are stable or intentionally excluded
  }, [rotationKey]);

  return backgrounds;
}
