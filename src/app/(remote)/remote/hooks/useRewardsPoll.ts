'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RewardData } from '@/lib/reward-data';
import { editorFetch } from '@/lib/editor-fetch';
import { usePolledFetch } from '@/hooks/usePolledFetch';
import type { RewardsData } from '../components/RewardsView';

/** How often the rewards are read while they are on screen. */
export const REWARDS_POLL_MS = 15_000;

export interface UseRewardsPollOptions {
  /** Whether anything on screen shows the rewards; nothing is read otherwise. */
  enabled: boolean;
  /**
   * Read again when this changes: entering or leaving the Rewards view. The
   * balances beside the progress header may be up to a poll old, and a
   * redeem or a list edit built from them is refused.
   */
  view: string;
}

/**
 * The rewards answer, shared by the Today view and the Rewards view: one poll
 * feeds the ticket balances beside the progress header (so a kid sees the
 * count grow as they check things off) and the store. Read while the tab is
 * in view and again as soon as it is: two parents giving tickets within a
 * quarter of a minute were otherwise looking at different numbers.
 */
export function useRewardsPoll({ enabled, view }: UseRewardsPollOptions) {
  /** null until the first read lands. */
  const [data, setData] = useState<RewardsData | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await editorFetch('/api/rewards');
      if (!res.ok) return;
      const next = await res.json() as RewardsData;
      if (!mountedRef.current) return;
      setData(next);
    } catch { /* silent; the next poll reads again */ }
  }, []);

  usePolledFetch(() => { void refresh(); }, [refresh, view], { intervalMs: REWARDS_POLL_MS, enabled, pauseWhenHidden: true });

  /**
   * What a tick moved: balances and the redemption history. The answer also
   * carries the reward list, but this phone's copy of the list is the one its
   * revision belongs to. Taking the list without its revision would show
   * another phone's new reward and then have the next reward save here
   * refused as stale.
   */
  const applyMoved = useCallback((moved: RewardData) => {
    setData((prev) => (prev ? { ...prev, balances: moved.balances, redemptions: moved.redemptions } : prev));
  }, []);

  return { data, setData, refresh, applyMoved };
}
