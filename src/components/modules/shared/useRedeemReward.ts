'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FamilyMember } from '@/types/family';
import type { RewardDefinition, RewardRedemption } from '@/lib/reward-data';
import { displayFetch } from '@/lib/display-fetch';
import { rewardsUrl } from '@/lib/fetch-keys';
import { useTranslate } from '@/i18n';

const REDEEMED_BANNER_MS = 5000;

export interface RedeemPending {
  reward: RewardDefinition;
  member: FamilyMember;
  /** The balance the sheet was built from; the hub refuses if it has moved since. */
  balance?: number;
}

export interface RedeemedInfo {
  memberName: string;
  rewardName: string;
  cost: number;
}

interface UseRedeemRewardOptions {
  /** False makes every call a no-op: a wall that is not meant to be touched. */
  enabled: boolean;
  /**
   * The server said yes, and this is its word on everyone's tickets and the
   * whole redemption list. It goes to `useChoreData().applyRedemption`: a store
   * that kept it to itself lost it again at the next poll of anything else.
   */
  onRedeemed: (result: { balances?: Record<string, number>; redemptions?: RewardRedemption[]; goals?: Record<string, string> }) => void;
}

/**
 * Spending tickets on a wall: ask, confirm, tell the server, celebrate. The
 * full-screen store and the card's store draw this differently, but a kid
 * tapping either one has to get the same "are you sure", the same errors and
 * the same five seconds of "You got it!".
 */
export function useRedeemReward({ enabled, onRedeemed }: UseRedeemRewardOptions) {
  const t = useTranslate('modules');
  const [pending, setPending] = useState<RedeemPending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState<RedeemedInfo | null>(null);
  const redeemedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (redeemedTimerRef.current !== null) clearTimeout(redeemedTimerRef.current);
  }, []);

  const ask = useCallback((reward: RewardDefinition, member: FamilyMember, balance?: number) => {
    if (!enabled) return;
    setError(null);
    setPending({ reward, member, balance });
  }, [enabled]);

  const cancel = useCallback(() => {
    setPending(null);
    setError(null);
  }, []);

  const dismissRedeemed = useCallback(() => {
    if (redeemedTimerRef.current !== null) clearTimeout(redeemedTimerRef.current);
    redeemedTimerRef.current = null;
    setRedeemed(null);
  }, []);

  const confirm = useCallback(async () => {
    if (!enabled || !pending || busy) return;
    const { reward, member, balance } = pending;
    setBusy(true);
    setError(null);
    try {
      const res = await displayFetch(rewardsUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId: reward.id, memberId: member.id, ...(balance !== undefined ? { expectedBalance: balance } : {}) }),
      });
      if (res.ok) {
        const data = await res.json() as { balances?: Record<string, number>; redemptions?: RewardRedemption[]; goals?: Record<string, string> };
        onRedeemed({ balances: data.balances, redemptions: data.redemptions, goals: data.goals });
        setPending(null);
        setRedeemed({ memberName: member.name, rewardName: reward.name, cost: reward.cost });
        if (redeemedTimerRef.current !== null) clearTimeout(redeemedTimerRef.current);
        redeemedTimerRef.current = setTimeout(() => {
          redeemedTimerRef.current = null;
          setRedeemed(null);
        }, REDEEMED_BANNER_MS);
      } else {
        const err = await res.json().catch(() => null) as { error?: string; reason?: string; balances?: Record<string, number>; redemptions?: RewardRedemption[]; goals?: Record<string, string> } | null;
        // The tickets moved under the sheet (another screen spent them): take
        // the hub's numbers now and say so, rather than charge a second time.
        if (res.status === 409 && err?.reason === 'balance') {
          onRedeemed({ balances: err.balances, redemptions: err.redemptions, goals: err.goals });
          setPending(null);
          setError(t('fullscreen-chore-chart.rewardsStore.errorChanged'));
        } else {
          setError(err?.error ?? t('fullscreen-chore-chart.rewardsStore.errorGeneric'));
        }
      }
    } catch {
      setError(t('fullscreen-chore-chart.rewardsStore.errorOffline'));
    } finally {
      setBusy(false);
    }
  }, [enabled, pending, busy, onRedeemed, t]);

  return { pending, busy, error, redeemed, ask, cancel, confirm, dismissRedeemed };
}
