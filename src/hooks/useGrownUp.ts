'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { currentUnlock, subscribeUnlock, type GrownUpUnlock } from '@/lib/grown-up-client';
import { NO_GROWN_UP_CODE, type GrownUpStatus } from '@/lib/grown-up-code';

/** This tab's unlock, kept current (an unlock runs out on its own). */
export function useGrownUpUnlock(): GrownUpUnlock | null {
  return useSyncExternalStore(subscribeUnlock, currentUnlock, () => null);
}

/** How often a page asks the hub what the code guards; a stale answer only changes a label. */
const STATUS_REFRESH_MS = 60_000;

/**
 * Whether a code is set and what it guards, for labelling a button "Ask a
 * grown-up" before it is pressed. Only a label: the hub decides, and a page
 * whose answer is a minute old still gets asked when the hub says so.
 */
export function useGrownUpStatus(fetcher: (url: string) => Promise<Response> = fetch, enabled = true): GrownUpStatus {
  const [status, setStatus] = useState<GrownUpStatus>(NO_GROWN_UP_CODE);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const load = () => {
      fetcher('/api/grown-up-code')
        .then((res) => (res.ok ? res.json() : null))
        .then((next: GrownUpStatus | null) => { if (live && next) setStatus(next); })
        .catch(() => { /* keep the last answer */ });
    };
    load();
    const id = setInterval(load, STATUS_REFRESH_MS);
    return () => { live = false; clearInterval(id); };
  }, [fetcher, enabled]);
  return status;
}
