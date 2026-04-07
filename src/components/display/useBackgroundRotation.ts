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
        };
      }),
  );
}

export function useBackgroundRotation(screens: Screen[]) {
  // Persist rotating backgrounds across screen mounts, keyed by screen id
  const [backgrounds, setBackgrounds] = useState<Record<string, string>>({});

  // Build a stable key from only the rotation-relevant config so we don't
  // restart polling when unrelated screen fields change. Must include EVERY
  // field that affects which photo the server returns, otherwise changing
  // (e.g.) an Immich album filter would not invalidate the rotation cache.
  const rotationKey = buildRotationKey(screens);

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
            if (data.path) {
              setBackgrounds((prev) => {
                if (prev[screen.id] === data.path) return prev;
                return { ...prev, [screen.id]: data.path };
              });
            }
          }
        } catch {
          // keep current background on failure
        }
      }
    }

    pollBackgrounds();
    const id = setInterval(pollBackgrounds, BG_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on rotationKey change; other deps are stable or intentionally excluded
  }, [rotationKey]);

  return backgrounds;
}
