import { createJsonStore } from './json-store';

// ── Types ────────────────────────────────────────────────────────────

export interface RewardDefinition {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  description: string;
  memberIds: string[];   // empty = available to all
  enabled: boolean;
}

export interface RewardRedemption {
  id: string;
  rewardId: string;
  rewardName: string;    // denormalized snapshot
  memberId: string;
  memberName: string;    // denormalized snapshot
  cost: number;          // point value at time of redemption
  redeemedAt: string;    // ISO timestamp
}

export interface RewardData {
  rewards: RewardDefinition[];
  balances: Record<string, number>;  // memberId → lifetime point balance
  redemptions: RewardRedemption[];
}

// ── Store ────────────────────────────────────────────────────────────

const EMPTY: RewardData = { rewards: [], balances: {}, redemptions: [] };

const store = createJsonStore<RewardData>({
  path: 'data/rewards.json',
  defaultValue: EMPTY,
  backup: true,
  errorHandling: 'throw-corrupt',
});

// ── Purge ────────────────────────────────────────────────────────────

const PURGE_DAYS = 90;

function purgeOldRedemptions(data: RewardData): RewardData {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PURGE_DAYS);
  const cutoffMs = cutoff.getTime();
  const cleaned = data.redemptions.filter(
    (r) => new Date(r.redeemedAt).getTime() >= cutoffMs,
  );
  if (cleaned.length === data.redemptions.length) return data;
  return { ...data, redemptions: cleaned };
}

// ── Public API ───────────────────────────────────────────────────────

export async function readRewardData(): Promise<RewardData> {
  const data = await store.read();
  return purgeOldRedemptions(data);
}

export async function writeRewardData(data: RewardData): Promise<void> {
  await store.write(data);
}

/** Replace reward definitions atomically (preserves balances/redemptions). */
export function updateRewardDefinitions(rewards: RewardDefinition[]): Promise<RewardData> {
  return store.updateAtomic((data) => ({ ...purgeOldRedemptions(data), rewards }));
}

/** Add points to a member's balance (called on chore completion). */
export function creditPoints(memberId: string, points: number): Promise<RewardData> {
  return store.updateAtomic((data) => ({
    ...data,
    balances: {
      ...data.balances,
      [memberId]: (data.balances[memberId] ?? 0) + points,
    },
  }));
}

/** Subtract points from a member's balance, flooring at 0.
 *  Used for admin manual balance adjustments where going negative isn't desired. */
export function debitPoints(memberId: string, points: number): Promise<RewardData> {
  return store.updateAtomic((data) => ({
    ...data,
    balances: {
      ...data.balances,
      [memberId]: Math.max(0, (data.balances[memberId] ?? 0) - points),
    },
  }));
}

export interface DebitExactResult {
  data: RewardData;
  /** Final balance after the debit (may be negative). */
  balance: number;
  /** True if the balance went negative — caller should surface a warning. */
  wentNegative: boolean;
}

/** Subtract points from a member's balance EXACTLY, allowing negative balances.
 *  Used when un-completing a chore whose points were already spent — the
 *  resulting negative balance is real accounting and must be earned back before
 *  the next reward can be redeemed. `redeemReward` already gates redemptions on
 *  `balance >= cost` so a negative balance can't be drained further. */
export async function debitPointsExact(
  memberId: string,
  points: number,
): Promise<DebitExactResult> {
  let balance = 0;
  let wentNegative = false;
  const data = await store.updateAtomic((current) => {
    const before = current.balances[memberId] ?? 0;
    balance = before - points;
    wentNegative = balance < 0;
    return {
      ...current,
      balances: { ...current.balances, [memberId]: balance },
    };
  });
  return { data, balance, wentNegative };
}

/** Record a redemption and debit the cost from the member's balance. */
export function redeemReward(
  reward: RewardDefinition,
  memberId: string,
  memberName: string,
): Promise<RewardData> {
  return store.updateAtomic((data) => {
    const balance = data.balances[memberId] ?? 0;
    if (balance < reward.cost) throw new Error('Insufficient balance');

    const redemption: RewardRedemption = {
      id: crypto.randomUUID(),
      rewardId: reward.id,
      rewardName: reward.name,
      memberId,
      memberName,
      cost: reward.cost,
      redeemedAt: new Date().toISOString(),
    };

    return {
      ...data,
      balances: {
        ...data.balances,
        [memberId]: balance - reward.cost,
      },
      redemptions: [...data.redemptions, redemption],
    };
  });
}

/** Remove a member's balance and strip them from reward memberIds.
 *  Redemption history is preserved (denormalized names). */
export function rewardCascadeDeleteMember(memberId: string): Promise<RewardData> {
  return store.updateAtomic((data) => {
    const { [memberId]: _, ...remainingBalances } = data.balances;
    return {
      ...data,
      balances: remainingBalances,
      rewards: data.rewards.map((r) =>
        r.memberIds.length > 0
          ? { ...r, memberIds: r.memberIds.filter((id) => id !== memberId) }
          : r,
      ),
    };
  });
}
