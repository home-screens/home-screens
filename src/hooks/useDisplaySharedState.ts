'use client';

import { useEffect, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import type { SharedStateEntry } from '@/lib/shared-state-types';

/**
 * Last shared-state snapshot a display reported to the hub. Producers run on
 * the display client, so the editor tab's own sharedStateStore is always
 * empty — this is the editor's only window into live values. Best-effort:
 * values lag the display by up to the heartbeat throttle (~5s).
 */
export interface DisplaySharedState {
  entries: Record<string, SharedStateEntry>;
  /** Server clock when the display last reported, or null if never. */
  reportedAt: number | null;
}

const POLL_MS = 5_000;
const EMPTY: DisplaySharedState = { entries: {}, reportedAt: null };

/**
 * Poll the hub for a display's last-reported shared-state snapshot.
 * `displayId: null` targets the legacy single-display slot.
 */
export function useDisplaySharedState(displayId: string | null): DisplaySharedState {
  const [state, setState] = useState<DisplaySharedState>(EMPTY);

  useEffect(() => {
    let mounted = true;
    setState(EMPTY);

    async function poll() {
      try {
        const url = displayId
          ? `/api/display/shared-state?display=${encodeURIComponent(displayId)}`
          : '/api/display/shared-state';
        const res = await editorFetch(url);
        if (!res.ok || !mounted) return;
        const data = await res.json();
        if (data && typeof data === 'object' && data.entries && typeof data.entries === 'object') {
          setState({
            entries: data.entries as Record<string, SharedStateEntry>,
            reportedAt: typeof data.reportedAt === 'number' ? data.reportedAt : null,
          });
        }
      } catch {
        // Best-effort hint — keep showing the last snapshot on a failed poll.
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [displayId]);

  return state;
}
