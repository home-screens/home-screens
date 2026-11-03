import { createJsonStore } from './json-store';
import type { TransactionChange } from './data-transaction';
import { isRecord } from './member-references/contract';
import { canAffordReward, goalsWithout, type SavingsGoals } from '@/lib/reward-rules';

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

/**
 * A grown-up giving or taking tickets by hand. Tickets from chores are not
 * rows here: they are read back from the completions, which already say what
 * was done and when. Only the moves nothing else records are kept.
 */
export interface RewardAdjustment {
  id: string;
  memberId: string;
  /** The change that actually applied: a take-away that hit zero records what came off, not what was asked. */
  delta: number;
  /** Why, in the grown-up's words. Absent on a quick +1 / -1. */
  reason?: string;
  /** When, as an ISO timestamp. */
  at: string;
}

export interface RewardData {
  rewards: RewardDefinition[];
  balances: Record<string, number>;  // memberId → lifetime point balance
  redemptions: RewardRedemption[];
  /** Each person's reward to save toward, by member id. Absent until someone picks one. */
  goals?: SavingsGoals;
  /** Hand adjustments, kept 90 days like redemptions. Absent until the first one. */
  adjustments?: RewardAdjustment[];
}

// ── Store ────────────────────────────────────────────────────────────

const EMPTY: RewardData = { rewards: [], balances: {}, redemptions: [] };

/** Where rewards, balances and redemptions live, relative to the data root. */
export const REWARDS_FILE = 'data/rewards.json';

const store = createJsonStore<RewardData>({
  path: REWARDS_FILE,
  defaultValue: EMPTY,
  backup: true,
  errorHandling: 'throw-corrupt',
});

// ── Purge ────────────────────────────────────────────────────────────

const PURGE_DAYS = 90;

/** Redemptions and adjustments older than the window are dropped; the rest of the file is untouched. */
function purgeOldRedemptions(data: RewardData): RewardData {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PURGE_DAYS);
  const cutoffMs = cutoff.getTime();
  const redemptions = data.redemptions.filter(
    (r) => new Date(r.redeemedAt).getTime() >= cutoffMs,
  );
  const adjustments = data.adjustments?.filter((a) => new Date(a.at).getTime() >= cutoffMs);
  const sameRedemptions = redemptions.length === data.redemptions.length;
  const sameAdjustments = !data.adjustments || adjustments!.length === data.adjustments.length;
  if (sameRedemptions && sameAdjustments) return data;
  return {
    ...data,
    redemptions: sameRedemptions ? data.redemptions : redemptions,
    ...(sameAdjustments ? {} : { adjustments }),
  };
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

// ── Validation ───────────────────────────────────────────────────────

/**
 * Why a reward list cannot be written, or null when every reward is well
 * formed. The reward save and a backup restore both ask this, so a restored
 * list is one every later save would accept too.
 */
export function validateRewardList(rewards: unknown): string | null {
  if (!Array.isArray(rewards)) return 'Rewards need a list of choices.';
  for (const reward of rewards) {
    if (!isRecord(reward) || typeof reward.id !== 'string' || !reward.id || typeof reward.name !== 'string') return 'Each reward needs an id and a name.';
    if (!Array.isArray(reward.memberIds) || reward.memberIds.some((id) => typeof id !== 'string')) return 'Each reward needs a member list.';
    if (typeof reward.cost !== 'number' || !Number.isFinite(reward.cost) || reward.cost < 0) return 'A reward must cost 0 or more tickets.';
  }
  return null;
}

/** Why a whole rewards file cannot be written, or null. Only a backup restore writes the file whole. */
export function validateRewardData(raw: unknown): string | null {
  if (!isRecord(raw)) return 'Rewards need choices, balances and history.';
  const list = validateRewardList(raw.rewards);
  if (list) return list;
  if (!isRecord(raw.balances) || Object.values(raw.balances).some((balance) => typeof balance !== 'number' || !Number.isFinite(balance))) {
    return 'Each ticket balance must be a number.';
  }
  if (!Array.isArray(raw.redemptions) || raw.redemptions.some((redemption) => !isRecord(redemption) || typeof redemption.redeemedAt !== 'string')) {
    return 'Each reward in the history needs the time it was redeemed.';
  }
  if (raw.goals !== undefined && (!isRecord(raw.goals) || Object.values(raw.goals).some((rewardId) => typeof rewardId !== 'string'))) {
    return 'Each savings goal must name a reward.';
  }
  if (raw.adjustments !== undefined && (!Array.isArray(raw.adjustments) || raw.adjustments.some((adjustment) => !isRecord(adjustment)
    || typeof adjustment.memberId !== 'string' || typeof adjustment.delta !== 'number' || !Number.isFinite(adjustment.delta) || typeof adjustment.at !== 'string'))) {
    return 'Each hand-given ticket change needs the person, the amount and the time.';
  }
  return null;
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

/**
 * Replace reward definitions atomically (preserves balances/redemptions).
 * A goal pointing at a reward that is no longer in the list goes with it.
 */
export function updateRewardDefinitions(rewards: RewardDefinition[]): Promise<RewardData> {
  return updateRewards((data) => {
    const ids = new Set(rewards.map((r) => r.id));
    return withGoals({ ...data, rewards }, goalsWithout(data.goals, (_member, rewardId) => !ids.has(rewardId)));
  });
}

/** `data` with these goals, and without the key at all when there are none left. */
function withGoals(data: RewardData, goals: SavingsGoals | undefined): RewardData {
  if (goals === data.goals) return data;
  const { goals: _dropped, ...rest } = data;
  return goals && Object.keys(goals).length > 0 ? { ...rest, goals } : rest;
}

/** Pick, or with `null` clear, the reward this person is saving toward. */
export function setSavingsGoal(memberId: string, rewardId: string | null): Promise<RewardData> {
  return updateRewards((data) => {
    if (rewardId === null) return withGoals(data, goalsWithout(data.goals, (member) => member === memberId));
    if (data.goals?.[memberId] === rewardId) return data;
    return { ...data, goals: { ...data.goals, [memberId]: rewardId } };
  });
}

/**
 * A grown-up gives (`delta` above zero) or takes tickets by hand. Taking
 * floors the balance at zero, as it always has, and the row records what
 * actually came off so the ledger adds up to the balance. A move that
 * changes nothing (taking from zero) writes nothing.
 */
export function adjustPoints(memberId: string, delta: number, reason?: string): Promise<RewardData> {
  return updateRewards((data) => {
    const before = data.balances[memberId] ?? 0;
    const after = Math.max(0, before + delta);
    if (after === before) return data;
    const adjustment: RewardAdjustment = {
      id: crypto.randomUUID(),
      memberId,
      delta: after - before,
      ...(reason ? { reason } : {}),
      at: new Date().toISOString(),
    };
    return {
      ...data,
      balances: { ...data.balances, [memberId]: after },
      adjustments: [...(data.adjustments ?? []), adjustment],
    };
  });
}

/** Record a redemption and debit the cost from the member's balance. */
export function redeemReward(
  reward: RewardDefinition,
  memberId: string,
  memberName: string,
): Promise<RewardData> {
  return updateRewards((data) => {
    const balance = data.balances[memberId] ?? 0;
    if (!canAffordReward(balance, reward)) throw new Error('Insufficient balance');

    const redemption: RewardRedemption = {
      id: crypto.randomUUID(),
      rewardId: reward.id,
      rewardName: reward.name,
      memberId,
      memberName,
      cost: reward.cost,
      redeemedAt: new Date().toISOString(),
    };

    // The reward they were saving for is theirs now; the bar starts over.
    const goals = goalsWithout(data.goals, (member, rewardId) => member === memberId && rewardId === reward.id);
    return withGoals({
      ...data,
      balances: {
        ...data.balances,
        [memberId]: balance - reward.cost,
      },
      redemptions: [...data.redemptions, redemption],
    }, goals);
  });
}

export interface PlannedPointsMove {
  /** Null when nothing changed; otherwise hand it to `commitDataTransaction`. */
  change: TransactionChange | null;
  data: RewardData;
  /**
   * Balance after the move. Negative is real accounting: a chore undo may take
   * the balance below zero, while a hand adjustment (`adjustPoints`) floors at zero.
   */
  balance: number;
  wentNegative: boolean;
}

/**
 * Plan a `delta`-point move for one member WITHOUT publishing the write, so the
 * chore completion that caused it can be committed in the same transaction.
 * A chore toggle used to write completions and rewards as two independent
 * durable writes, so losing power between them recorded the chore and credited
 * nothing. A chore undo may take the balance below zero; only a hand
 * adjustment (`adjustPoints`) floors at zero.
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
