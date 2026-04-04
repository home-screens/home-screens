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

// ── Serialized operation queue ───────────────────────────────────────
// Prevents lost-update races on read-modify-write cycles.
// Same pattern as chore completions (src/app/api/chores/route.ts).
// Lives here (not in the route) so all callers share one queue.

let opQueue: Promise<RewardData> = Promise.resolve(EMPTY);

function enqueueOp(fn: (data: RewardData) => RewardData | Promise<RewardData>): Promise<RewardData> {
  const next = opQueue.then(async () => {
    const data = await store.read();
    const result = await fn(data);
    await store.write(result);
    return result;
  });
  opQueue = next.catch(() => EMPTY);
  return next;
}

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
  return enqueueOp((data) => ({ ...purgeOldRedemptions(data), rewards }));
}

/** Add points to a member's balance (called on chore completion). */
export function creditPoints(memberId: string, points: number): Promise<RewardData> {
  return enqueueOp((data) => ({
    ...data,
    balances: {
      ...data.balances,
      [memberId]: (data.balances[memberId] ?? 0) + points,
    },
  }));
}

/** Subtract points from a member's balance, flooring at 0. */
export function debitPoints(memberId: string, points: number): Promise<RewardData> {
  return enqueueOp((data) => ({
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
  return enqueueOp((data) => {
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
  return enqueueOp((data) => {
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
