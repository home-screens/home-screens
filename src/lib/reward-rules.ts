import type { RewardDefinition, RewardRedemption } from './reward-data';

/**
 * Who may redeem what, and for how much.
 *
 * Three surfaces ask these questions: the phone's Rewards view, the wall's
 * rewards store (the one kids actually touch), and the server, which is the
 * only one whose answer is binding. Their markup has nothing in common - the
 * wall's card sizes every glyph off its measured box and changes shape by
 * affordability, the phone's is a fixed list row - but a client that offers a
 * reward the server then refuses is a child tapping a thing that does not
 * happen, so the questions themselves belong in one place.
 */

/** An empty `memberIds` means the reward is for everyone. */
export function isRewardEligibleFor(reward: RewardDefinition, memberId: string | null): boolean {
  if (reward.memberIds.length === 0) return true;
  return memberId !== null && reward.memberIds.includes(memberId);
}

/**
 * Whether a surface should offer this reward to this person at all: it has to
 * be switched on and meant for them. Says nothing about whether they can afford
 * it, which is what dims a card rather than hiding it.
 *
 * The server checks the two halves separately so it can answer "no such reward"
 * and "not yours" differently; a surface deciding what to draw wants them
 * together.
 */
export function isRewardOfferedTo(reward: RewardDefinition, memberId: string | null): boolean {
  return reward.enabled && isRewardEligibleFor(reward, memberId);
}

/** Whether this balance covers the reward. The server decides for real. */
export function canAffordReward(balance: number, reward: RewardDefinition): boolean {
  return balance >= reward.cost;
}

/** How many more tickets are needed, for the "N more to go" line. Never negative. */
export function ticketsStillNeeded(balance: number, reward: RewardDefinition): number {
  return Math.max(0, reward.cost - balance);
}

/** What the balance would be after redeeming, for the confirmation line. */
export function ticketsAfterRedeeming(balance: number, reward: RewardDefinition): number {
  return Math.max(0, balance - reward.cost);
}

// ── Savings goal ─────────────────────────────────────────────────────

/** Each person's chosen reward to save toward, by member id. */
export type SavingsGoals = Record<string, string>;

/**
 * The reward this person is saving for, when it is still a reward they could
 * redeem: it exists, it is switched on, and it is meant for them. A goal that
 * fails any of those is no goal, not an error, because a reward is switched
 * off or taken away long after a child picked it.
 */
export function resolveSavingsGoal(
  data: { rewards: readonly RewardDefinition[]; goals?: SavingsGoals },
  memberId: string,
): RewardDefinition | null {
  const rewardId = data.goals?.[memberId];
  if (!rewardId) return null;
  const reward = data.rewards.find((r) => r.id === rewardId);
  return reward && isRewardOfferedTo(reward, memberId) ? reward : null;
}

export interface GoalProgress {
  have: number;
  cost: number;
  stillNeeded: number;
  /** 0 to 1, for the bar. A balance past the cost fills it, never overflows it. */
  fraction: number;
  reached: boolean;
}

/** How far along a goal is, for every bar that draws it. */
export function goalProgress(balance: number, reward: RewardDefinition): GoalProgress {
  const have = Math.max(0, balance);
  const stillNeeded = ticketsStillNeeded(balance, reward);
  const fraction = reward.cost <= 0 ? 1 : Math.min(1, have / reward.cost);
  return { have, cost: reward.cost, stillNeeded, fraction, reached: canAffordReward(balance, reward) };
}

/**
 * The goals without the entries `drop` picks out. Hands back the same object
 * when nothing is dropped, so a store can tell a real change from none.
 */
export function goalsWithout(
  goals: SavingsGoals | undefined,
  drop: (memberId: string, rewardId: string) => boolean,
): SavingsGoals | undefined {
  if (!goals) return goals;
  const kept = Object.entries(goals).filter(([memberId, rewardId]) => !drop(memberId, rewardId));
  return kept.length === Object.keys(goals).length ? goals : Object.fromEntries(kept);
}

/**
 * Redemptions newest first, for every feed that lists them. Returns a copy.
 * A row whose timestamp cannot be read sorts last rather than poisoning the
 * comparator: one NaN makes the whole order depend on the engine.
 */
export function sortRedemptionsNewestFirst(redemptions: readonly RewardRedemption[]): RewardRedemption[] {
  const at = (r: RewardRedemption) => {
    const ms = new Date(r.redeemedAt).getTime();
    return Number.isNaN(ms) ? -Infinity : ms;
  };
  return [...redemptions].sort((a, b) => {
    const am = at(a);
    const bm = at(b);
    return am === bm ? 0 : bm > am ? 1 : -1;
  });
}

// ── Redeeming ────────────────────────────────────────────────────────

/**
 * What a redeem answer from the hub means to the person who tapped.
 *
 * - `redeemed`: they got it.
 * - `alreadyGot`: the hub said no, but this very reward was redeemed for this
 *   person a moment ago from another screen, so they already have it and
 *   "not enough tickets" would send them asking for it again.
 * - `moved`: the tickets changed under the sheet (another screen spent them);
 *   the hub's numbers came back with the refusal.
 * - `notEnough`: too few tickets.
 * - `notOffered`: the reward is gone, switched off or not for this person.
 * - `removed`: this person is no longer in the family.
 * - `failed`: anything else; the hub's words are never shown.
 */
export type RedeemOutcome = 'redeemed' | 'alreadyGot' | 'moved' | 'notEnough' | 'notOffered' | 'removed' | 'failed';

/** The hub's whole word on tickets after a redeem, sent with a yes and with a "moved" refusal. */
export interface RedeemNumbers {
  balances?: Record<string, number>;
  redemptions?: RewardRedemption[];
  goals?: SavingsGoals;
}

/** A redemption this recent counts as "you already got it" rather than "not enough tickets". */
export const ALREADY_GOT_WINDOW_MS = 10 * 60_000;

/**
 * The refusal reason the hub attaches when the quoted balance has moved. The
 * route's other refusals carry English text only, so everything else is told
 * apart by status.
 */
const MOVED_REASON = 'balance';

/**
 * The one reading of a redeem answer, so the wall and the phone agree on what
 * a kid is told. `recentRedemptions` is a fresher list than the answer
 * carries, read after a 400 (see `requestRedemption`); a moved refusal
 * brings the hub's own list with it.
 */
export function classifyRedeemAnswer({ status, body, recentRedemptions, rewardId, memberId, now }: {
  status: number;
  body: (RedeemNumbers & { reason?: string }) | null;
  recentRedemptions?: readonly RewardRedemption[];
  rewardId: string;
  memberId: string;
  now: number;
}): RedeemOutcome {
  if (status >= 200 && status < 300) return 'redeemed';
  const moved = status === 409 && body?.reason === MOVED_REASON;
  if (moved || status === 400) {
    const justGot = (recentRedemptions ?? body?.redemptions ?? []).some((r) => r.memberId === memberId && r.rewardId === rewardId && now - new Date(r.redeemedAt).getTime() < ALREADY_GOT_WINDOW_MS);
    if (justGot) return 'alreadyGot';
    return moved ? 'moved' : 'notEnough';
  }
  if (status === 404 || status === 403) return 'notOffered';
  if (status === 409) return 'removed';
  return 'failed';
}

export interface RedeemResult {
  outcome: RedeemOutcome;
  /**
   * The hub's numbers when it sent them: with a yes, and with a "moved" or
   * "already got it" refusal. A surface adopts them at once rather than
   * charging twice or waiting for the next poll.
   */
  numbers: RedeemNumbers | null;
}

/**
 * Ask the hub to redeem and read its answer. `fetchFn` is the surface's own
 * transport (the wall's `displayFetch`, the phone's `editorFetch`); a
 * connection failure rejects as it would from that transport. The follow-up
 * read of recent redemptions happens only when the rule needs it, on a 400.
 */
export async function requestRedemption(
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>,
  { rewardId, memberId, expectedBalance, now = Date.now() }: { rewardId: string; memberId: string; expectedBalance?: number; now?: number },
): Promise<RedeemResult> {
  const res = await fetchFn('/api/rewards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rewardId, memberId, ...(expectedBalance !== undefined ? { expectedBalance } : {}) }),
  });
  const body = await res.json().catch(() => null) as (RedeemNumbers & { reason?: string }) | null;
  let recentRedemptions: RewardRedemption[] | undefined;
  if (res.status === 400) {
    const fresh = await fetchFn('/api/rewards').then((r) => (r.ok ? r.json() : null)).catch(() => null) as { redemptions?: RewardRedemption[] } | null;
    recentRedemptions = fresh?.redemptions;
  }
  const outcome = classifyRedeemAnswer({ status: res.status, body, recentRedemptions, rewardId, memberId, now });
  const carriesNumbers = outcome === 'redeemed' || (res.status === 409 && body?.reason === MOVED_REASON);
  return { outcome, numbers: carriesNumbers && body ? { balances: body.balances, redemptions: body.redemptions, goals: body.goals } : null };
}
