import { sendJsonWrite, type HubFetch } from './hub-request';
import { RevisionSession } from './revision-session';
import type { RewardDefinition } from './reward-data';
import type { SavingsGoals } from './reward-rules';

/**
 * The phone's writes to the rewards: the list a grown-up edits, tickets given
 * or taken by hand, and what someone is saving for. Redeeming is
 * `requestRedemption` in `reward-rules.ts`, which the wall shares.
 */

/** What a save of the reward list answers with, and what a conflict carries: the list and the revision the next save quotes. */
export interface RewardListSnapshot {
  rewards: RewardDefinition[];
  revision: string;
}

/** The snapshot in an answer, or null when the body is not one: an answer cut short is never a saved list. */
export function asRewardListSnapshot(json: unknown): RewardListSnapshot | null {
  const d = json as { rewards?: unknown; revision?: unknown } | null;
  if (!d || !Array.isArray(d.rewards) || typeof d.revision !== 'string' || !d.revision) return null;
  return { rewards: d.rewards as RewardDefinition[], revision: d.revision };
}

/**
 * One phone's saves of the reward list, in order (see `RevisionSession`).
 * `force` is for deleting the only reward: the hub refuses an empty list as a
 * guard against a broken client wiping the data, and the person just
 * confirmed exactly that list.
 */
export class RewardSession extends RevisionSession<RewardDefinition[], RewardListSnapshot> {
  constructor(fetcher: HubFetch, initial?: { revision: string } | null) {
    super(fetcher, {
      url: '/api/rewards/data',
      body: (rewards, revision, force) => ({ rewards, ...(force ? { force: true } : {}), revision }),
      parse: asRewardListSnapshot,
    }, initial);
  }
}

export interface TicketAdjustment {
  memberIds: string[];
  /** The same amount for each person; negative takes tickets away. */
  amount: number;
  /** Lands in each person's ticket history. */
  reason?: string;
}

/**
 * Give or take tickets by hand. Resolves with everyone's balance after it;
 * rejects when the hub refuses, cannot be reached, or answers without them.
 */
export async function adjustTickets(fetcher: HubFetch, { memberIds, amount, reason }: TicketAdjustment, fallback: string): Promise<Record<string, number>> {
  const json = await sendJsonWrite(fetcher, { url: '/api/rewards/data', method: 'POST', body: { memberIds, amount, ...(reason ? { reason } : {}) } }, fallback);
  const balances = (json as { balances?: unknown } | null)?.balances;
  if (!balances || typeof balances !== 'object') throw new Error(fallback);
  return balances as Record<string, number>;
}

/** Pick what someone is saving for, or clear it with `null`. Resolves with everyone's picks after it. */
export async function setSavingsGoal(fetcher: HubFetch, memberId: string, rewardId: string | null, fallback: string): Promise<SavingsGoals> {
  const json = await sendJsonWrite(fetcher, { url: '/api/rewards/goal', method: 'POST', body: { memberId, rewardId } }, fallback);
  const goals = (json as { goals?: unknown } | null)?.goals;
  return goals && typeof goals === 'object' ? goals as SavingsGoals : {};
}
