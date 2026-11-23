'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FamilyMember } from '@/types/family';
import type { RewardDefinition } from '@/lib/reward-data';
import { displayFetch } from '@/lib/display-fetch';
import { requestRedemption, type RedeemNumbers, type RedeemOutcome } from '@/lib/reward-rules';
import { useTranslate } from '@/i18n';
import { asksForCode } from '@/lib/grown-up-code';
import { grownUpFetch, isGrownUpCancelled } from '@/lib/grown-up-client';
import { useGrownUpStatus, useGrownUpUnlock } from '@/hooks/useGrownUp';
import { CHORE_SHEET_IDLE_MS } from '@/lib/chore-constants';
import type { WallSheetOptions } from './useWallSheet';

const REDEEMED_BANNER_MS = 5000;

/** How long "Spend your tickets?" waits with nobody touching it, as every chore chart sheet does. */
export const REDEEM_IDLE_MS = CHORE_SHEET_IDLE_MS;

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
const REFUSAL_KEYS: Record<Exclude<RedeemOutcome, 'redeemed'>, readonly ['core' | 'modules', string]> = {
  alreadyGot: ['modules', 'fullscreen-chore-chart.rewardsStore.errorAlreadyGot'],
  moved: ['modules', 'fullscreen-chore-chart.rewardsStore.errorChanged'],
  notEnough: ['modules', 'fullscreen-chore-chart.rewardsStore.errorNotEnough'],
  // Said in the same words on the phone, so these two live in `core`.
  notOffered: ['core', 'rewards.redeem.notOffered'],
  removed: ['core', 'rewards.redeem.removed'],
  failed: ['core', 'refusals.failed'],
};

/**
 * Spending tickets on a wall: ask, confirm, tell the server, celebrate. The
 * full-screen store and the card's store draw this differently, but a kid
 * tapping either one has to get the same "are you sure", the same errors and
 * the same five seconds of "You got it!".
 */
export function useRedeemReward({ enabled, onRedeemed }: UseRedeemRewardOptions) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const [pending, setPending] = useState<RedeemPending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState<RedeemedInfo | null>(null);
  const redeemedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Spending tickets may need the grown-up code: the confirm button says so
  // before it is pressed, unless this wall is already unlocked.
  const grownUpStatus = useGrownUpStatus(displayFetch, enabled);
  const unlocked = useGrownUpUnlock() !== null;
  const asksGrownUp = asksForCode(grownUpStatus, 'redeem') && !unlocked;

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
      const why = tCore('grownUp.why.redeem', { count: reward.cost, member: member.name, reward: reward.name });
      const { outcome, numbers } = await requestRedemption(grownUpFetch(displayFetch, why), { rewardId: reward.id, memberId: member.id, expectedBalance: balance });
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
        const [dictionary, key] = REFUSAL_KEYS[outcome];
        setError((dictionary === 'core' ? tCore : t)(key, { reward: reward.name }));
      }
    } catch (err) {
      // Nobody gave the grown-up code: the sheet stays, with nothing to report.
      if (!isGrownUpCancelled(err)) setError(t('fullscreen-chore-chart.rewardsStore.errorOffline'));
    } finally {
      setBusy(false);
    }
  }, [enabled, pending, busy, onRedeemed, t, tCore]);

  // How "Spend your tickets?" closes, for both stores' sheets (`useWallSheet`):
  // by itself after a spell with nobody touching it, so a wall with rotation
  // off never keeps a question up for good, but never while the spend is on
  // its way or the grown-up pad is up over it.
  const sheet = useMemo<WallSheetOptions>(() => ({ onClose: cancel, autoCloseMs: REDEEM_IDLE_MS, paused: busy }), [cancel, busy]);

  return { pending, busy, error, redeemed, asksGrownUp, ask, cancel, confirm, dismissRedeemed, sheet };
}
