'use client';

import { useEffect, useState } from 'react';
import { HUB_UNREACHABLE_AFTER_MS, hubSilentSince, subscribeHubReach } from '@/lib/display-heartbeat';

/**
 * When the hub last answered this wall's heartbeat, once it has gone
 * `HUB_UNREACHABLE_AFTER_MS` without answering; null while it answers, and
 * through a shorter gap. Only a wall takes a heartbeat, so anywhere else this
 * stays null.
 */
export function useHubUnreachableSince(): number | null {
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      const since = hubSilentSince();
      if (since === null) {
        setShown(null);
        return;
      }
      const wait = since + HUB_UNREACHABLE_AFTER_MS - Date.now();
      if (wait <= 0) {
        setShown(since);
        return;
      }
      setShown(null);
      timer = setTimeout(update, wait);
    };
    const unsubscribe = subscribeHubReach(update);
    // The hub may have stopped answering before this mounted.
    timer = setTimeout(update, 0);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  return shown;
}
