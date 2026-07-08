'use client';

import { useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { usePolledFetch } from '@/hooks/usePolledFetch';
import { logger } from '@/lib/logger';

const log = logger('useActiveBackground');

/**
 * Polls the server-side background cache so the editor shows the same rotating
 * background the display is using. Returns null when rotation is disabled.
 */
export function useActiveBackground(screenId: string | undefined, rotationEnabled: boolean) {
  const [activeBackground, setActiveBackground] = useState<string | null>(null);

  usePolledFetch(
    async () => {
      try {
        const res = await editorFetch(`/api/backgrounds/rotate?screenId=${encodeURIComponent(screenId!)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.path) setActiveBackground(data.path);
        }
      } catch (err) {
        log.debug('Failed to fetch active background:', err);
      }
    },
    [screenId],
    {
      intervalMs: 30_000,
      enabled: rotationEnabled && !!screenId,
      onSkip: () => setActiveBackground(null),
    },
  );

  return activeBackground;
}
