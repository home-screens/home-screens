'use client';

import { useCallback, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { usePolledFetch } from './usePolledFetch';
import type { WallsApiResponse } from '@/lib/walls-api-types';

/**
 * The walls this hub has let in and the ones waiting, polled every 5 s
 * while the tab is visible, with the two things a grown-up can do about
 * them. Each action answers whether it worked and reads the list again.
 */
export function useWalls(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const [data, setData] = useState<WallsApiResponse | null>(null);

  const poll = useCallback(async (isMounted: () => boolean) => {
    try {
      const res = await editorFetch('/api/display/walls');
      if (res.ok && isMounted()) setData((await res.json()) as WallsApiResponse);
    } catch {
      // Keep what we had; the next turn tries again.
    }
  }, []);

  usePolledFetch(poll, [], { intervalMs: 5_000, enabled, pauseWhenHidden: true });

  const refresh = useCallback(() => poll(() => true), [poll]);

  const letIn = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await editorFetch('/api/display/walls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'let-in', id }),
      });
      await refresh();
      return res.ok;
    } catch {
      return false;
    }
  }, [refresh]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await editorFetch(`/api/display/walls?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await refresh();
      return res.ok;
    } catch {
      return false;
    }
  }, [refresh]);

  return { data, refresh, letIn, remove };
}
