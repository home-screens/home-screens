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
