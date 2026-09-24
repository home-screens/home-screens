import type { RewardRedemption } from './reward-data';
import { sortRedemptionsNewestFirst } from './reward-rules';
import { isoDateInTZ } from './timezone';
import { daysBetween } from './todo-due-labels';

/**
 * How a family's redemptions are read back on the wall: split by how long ago
 * they happened, and summed up for the totals tiles. The card chart, the three
 * full-screen history views and the store's own history all list the same
 * rows, so the grouping and the sums live here rather than in any one of them.
 */

export type RedemptionBucket = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

export const REDEMPTION_BUCKETS: readonly RedemptionBucket[] = ['today', 'yesterday', 'thisWeek', 'earlier'];

export interface RedemptionGroup {
  bucket: RedemptionBucket;
  redemptions: RewardRedemption[];
}

/**
 * Whole calendar days between a redemption and now, counted on the
 * household's calendar (`timeZone`; the machine's own without one). Calendar
 * days, not 24-hour spans: something redeemed at 9pm is "yesterday" at 7am.
 */
function daysAgo(redeemedAt: string, now: Date, timeZone?: string): number | null {
  const at = new Date(redeemedAt);
  if (Number.isNaN(at.getTime())) return null;
  return daysBetween(isoDateInTZ(at, timeZone), isoDateInTZ(now, timeZone));
}

function bucketFor(days: number | null): RedemptionBucket {
  // A row that cannot be dated, or one stamped in the future by a clock that
  // was wrong, still has to land somewhere it can be seen.
  if (days === null) return 'earlier';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return days < 7 ? 'thisWeek' : 'earlier';
}

/**
 * Newest first, split into the buckets that have anything in them, in order.
 * `now` is a real instant; `timeZone` is the household's, so the wall and the
 * phone agree on which evening counts as today.
 */
export function groupRedemptionsByDay(redemptions: readonly RewardRedemption[], now: Date, timeZone?: string): RedemptionGroup[] {
  const byBucket = new Map<RedemptionBucket, RewardRedemption[]>();
  for (const redemption of sortRedemptionsNewestFirst(redemptions)) {
    const bucket = bucketFor(daysAgo(redemption.redeemedAt, now, timeZone));
    const list = byBucket.get(bucket);
    if (list) list.push(redemption);
    else byBucket.set(bucket, [redemption]);
  }
  return REDEMPTION_BUCKETS.flatMap((bucket) => {
    const list = byBucket.get(bucket);
    return list ? [{ bucket, redemptions: list }] : [];
  });
}

export interface RedemptionSummary {
  ticketsSpent: number;
  count: number;
  /** The reward redeemed most often. A tie goes to the one redeemed most recently. */
  favorite: { rewardName: string; count: number } | null;
}

/** How many days the totals tiles look back. */
export const SUMMARY_DAYS = 30;

/** Totals over the last `days` household calendar days, today included. */
export function summarizeRedemptions(
  redemptions: readonly RewardRedemption[],
  now: Date,
  days = SUMMARY_DAYS,
  timeZone?: string,
): RedemptionSummary {
  const recent = sortRedemptionsNewestFirst(redemptions).filter((r) => {
    const ago = daysAgo(r.redeemedAt, now, timeZone);
    return ago !== null && ago < days;
  });
  // Counted by name, not id: a reward that was deleted and made again is the
  // same treat to the family. Map order is newest first, which settles ties.
  const counts = new Map<string, number>();
  for (const r of recent) counts.set(r.rewardName, (counts.get(r.rewardName) ?? 0) + 1);
  let favorite: RedemptionSummary['favorite'] = null;
  for (const [rewardName, count] of counts) {
    if (!favorite || count > favorite.count) favorite = { rewardName, count };
  }
  return { ticketsSpent: recent.reduce((sum, r) => sum + r.cost, 0), count: recent.length, favorite };
}
