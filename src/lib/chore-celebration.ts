import type { FullscreenChoreCelebration } from '@/types/config';

/**
 * When a day is finished: the moment a person ticks the last chore they owe
 * today. Both the wall and the phone celebrate it, and the wall has to notice
 * it in data that arrived from anywhere (a tick on the phone, on another
 * display, or on itself), so the test is over two snapshots of the counts
 * rather than inside any one tap handler.
 */

/** The two numbers that matter, from `MemberStats`. */
export interface DayCounts {
  /** Chores owed today. Bonus chores and "not today" are never in it. */
  total: number;
  completed: number;
}

/** The chart's setting for what a finished day looks like; the phone follows it. */
export type ChoreCelebration = FullscreenChoreCelebration;

/** How long the celebration stays up, on the wall and on the phone, before it goes by itself. */
export const CELEBRATION_MS = 6000;

function complete(counts: DayCounts | undefined): boolean {
  return !!counts && counts.total > 0 && counts.completed >= counts.total;
}

/**
 * The people who finished their day between `prev` and `next`, in `next`'s
 * order. Nobody on the first snapshot (`prev` null), because what was already
 * finished when the chart loaded was not finished just now. A day that
 * becomes complete because a chore was taken away (the total shrank and
 * nothing more was ticked) is not a finish either: nobody did anything.
 */
export function detectDayComplete<T extends DayCounts>(
  prev: ReadonlyMap<string, T> | null,
  next: ReadonlyMap<string, T>,
): string[] {
  if (!prev) return [];
  const finished: string[] = [];
  for (const [memberId, counts] of next) {
    if (!complete(counts)) continue;
    const before = prev.get(memberId);
    if (complete(before)) continue;
    if (before && counts.completed <= before.completed) continue;
    finished.push(memberId);
  }
  return finished;
}
