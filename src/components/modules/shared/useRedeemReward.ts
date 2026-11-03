'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FamilyMember } from '@/types/family';
import type { RewardDefinition } from '@/lib/reward-data';
import { displayFetch } from '@/lib/display-fetch';
import { requestRedemption, type RedeemNumbers, type RedeemOutcome } from '@/lib/reward-rules';
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
  onRedeemed: (result: RedeemNumbers) => void;
}

/**
 * The wall's words for each refusal. The hub's own sentence is never shown:
 * it is English on a wall set to any language, and written for developers.
 */
const REFUSAL_KEYS: Record<Exclude<RedeemOutcome, 'redeemed'>, string> = {
  alreadyGot: 'fullscreen-chore-chart.rewardsStore.errorAlreadyGot',
  moved: 'fullscreen-chore-chart.rewardsStore.errorChanged',
  notEnough: 'fullscreen-chore-chart.rewardsStore.errorNotEnough',
  notOffered: 'fullscreen-chore-chart.rewardsStore.errorNotOffered',
  removed: 'fullscreen-chore-chart.rewardsStore.errorRemoved',
  failed: 'fullscreen-chore-chart.rewardsStore.errorGeneric',
};

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
      const { outcome, numbers } = await requestRedemption(displayFetch, { rewardId: reward.id, memberId: member.id, expectedBalance: balance });
      // The hub's numbers, whether it said yes or the tickets moved under the
      // sheet (another screen spent them): take them now rather than charge
      // a second time or wait for the next poll.
      if (numbers) onRedeemed(numbers);
      if (outcome === 'redeemed') {
        setPending(null);
        setRedeemed({ memberName: member.name, rewardName: reward.name, cost: reward.cost });
        if (redeemedTimerRef.current !== null) clearTimeout(redeemedTimerRef.current);
        redeemedTimerRef.current = setTimeout(() => {
          redeemedTimerRef.current = null;
          setRedeemed(null);
        }, REDEEMED_BANNER_MS);
      } else {
        // The sheet stays up with the reason, since both stores draw the
        // error inside it: a sheet that just closes reads as "you got it".
        // When the tickets moved, the sheet quotes the hub's number from now
        // on, so a second Yes is judged on the real balance, not refused again.
        if (balance !== undefined && numbers?.balances) setPending({ reward, member, balance: numbers.balances[member.id] ?? 0 });
        setError(t(REFUSAL_KEYS[outcome], { reward: reward.name }));
      }
    } catch {
      setError(t('fullscreen-chore-chart.rewardsStore.errorOffline'));
    } finally {
      setBusy(false);
    }
  }, [enabled, pending, busy, onRedeemed, t]);

  return { pending, busy, error, redeemed, ask, cancel, confirm, dismissRedeemed };
}
