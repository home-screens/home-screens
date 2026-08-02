'use client';

import { useCallback, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { usePolledFetch } from './usePolledFetch';
import type { DisplaysApiResponse } from '@/lib/displays-api-types';

/**
 * The `/api/displays` heartbeat poll shared by SettingsSidebar,
 * DisplaysIndexPage, and PerDisplayPage — each previously hand-rolled the
 * same 5s loop with divergent visibility handling. The 5s cadence is what
 * the route's tiny readConfig cache (1.5s TTL) was sized for, so multiple
 * open editor surfaces collapse to one disk read per cycle; pausing on
 * hidden tabs keeps a background editor window from polling the hub Pi
 * forever.
 *
 * Fetch failures are silent and keep the previous snapshot — blanking the
 * status pills / heartbeat dots on a transient network blip would read as
 * every display going offline at once.
 */
export function useDisplayHeartbeats(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const [data, setData] = useState<DisplaysApiResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const poll = useCallback(async (isMounted: () => boolean) => {
    setRefreshing(true);
    try {
      const res = await editorFetch('/api/displays');
      if (res.ok && isMounted()) {
        setData((await res.json()) as DisplaysApiResponse);
      }
    } catch {
      // Silent — keep the previous snapshot.
    } finally {
      if (isMounted()) setRefreshing(false);
    }
  }, []);

  usePolledFetch(poll, [], { intervalMs: 5_000, enabled, pauseWhenHidden: true });

  // Zero-arg so it can be wired straight to onClick without the event
  // leaking into the isMounted slot.
  const refresh = useCallback(() => poll(() => true), [poll]);

  return { data, refresh, refreshing };
}
