'use client';

import { useState, useEffect } from 'react';
import type { Screen } from '@/types/config';
import { displayFetch } from '@/lib/display-fetch';

/** How often the client polls the server-side rotation cache (ms) */
const BG_POLL_MS = 60_000;

export function useBackgroundRotation(screens: Screen[]) {
  // Persist rotating backgrounds across screen mounts, keyed by screen id
  const [backgrounds, setBackgrounds] = useState<Record<string, string>>({});

  // Build a stable key from only the rotation-relevant config so we don't
  // restart polling when unrelated screen fields change.
  const rotationKey = screens
    .filter((s) => s.backgroundRotation?.enabled)
    .map((s) => `${s.id}:${s.backgroundRotation!.source || 'unsplash'}:${s.backgroundRotation!.query}:${s.backgroundRotation!.intervalMinutes}`)
    .join('|');

  useEffect(() => {
    if (!rotationKey) return;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotationKey]);

  return backgrounds;
}
