import { createJsonStore } from './json-store';
import type { TransactionChange } from './data-transaction';

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

/**
 * Every mutation goes through here so the purge above is actually persisted.
 * `readRewardData` only purges the copy it hands back; a mutator that spread
 * the raw `current` wrote the expired rows straight back to disk, so the
 * 90-day window only ever held for `updateRewardDefinitions`.
 */
function updateRewards(mutator: (current: RewardData) => RewardData): Promise<RewardData> {
  return store.updateAtomic((data) => mutator(purgeOldRedemptions(data)));
}

// ── Public API ───────────────────────────────────────────────────────

export async function readRewardData(): Promise<RewardData> {
  const data = await store.read();
  return purgeOldRedemptions(data);
}

/** Raw whole-file write. Deliberately skips the redemption purge: a restore
 *  has to land the bytes it was given. Mutations belong on `updateRewards`. */
export async function writeRewardData(data: RewardData): Promise<void> {
  await store.write(data);
}

/** Replace reward definitions atomically (preserves balances/redemptions). */
export function updateRewardDefinitions(rewards: RewardDefinition[]): Promise<RewardData> {
  return updateRewards((data) => ({ ...data, rewards }));
}

/** Add points to a member's balance (called on chore completion). */
export function creditPoints(memberId: string, points: number): Promise<RewardData> {
  return updateRewards((data) => ({
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
  return updateRewards((data) => ({
    ...data,
    balances: {
      ...data.balances,
      [memberId]: Math.max(0, (data.balances[memberId] ?? 0) - points),
    },
  }));
}

/** Record a redemption and debit the cost from the member's balance. */
export function redeemReward(
  reward: RewardDefinition,
  memberId: string,
  memberName: string,
): Promise<RewardData> {
  return updateRewards((data) => {
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

export interface PlannedPointsMove {
  /** Null when nothing changed; otherwise hand it to `commitDataTransaction`. */
  change: TransactionChange | null;
  data: RewardData;
  /** Balance after the move. Negative is real accounting, as in `debitPointsExact`. */
  balance: number;
  wentNegative: boolean;
}

/**
 * Plan a `delta`-point move for one member WITHOUT publishing the write, so the
 * chore completion that caused it can be committed in the same transaction.
 * A chore toggle used to write completions and rewards as two independent
 * durable writes, so losing power between them recorded the chore and credited
 * nothing. Same accounting as `debitPointsExact`: the balance may go negative.
 */
export function planPointsMove(memberId: string, delta: number): Promise<PlannedPointsMove> {
  let balance = 0;
  return store
    .planUpdate((current) => {
      const data = purgeOldRedemptions(current);
      balance = (data.balances[memberId] ?? 0) + delta;
      return { ...data, balances: { ...data.balances, [memberId]: balance } };
    })
    .then(({ change, result }) => ({ change, data: result, balance, wentNegative: balance < 0 }));
}
