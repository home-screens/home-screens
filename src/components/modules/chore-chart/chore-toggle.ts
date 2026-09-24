import type { ChoreCompletion, ChoreToggleResponse } from '@/types/config';
import type { FamilyMember } from '@/types/family';

/** What a tap on a chore row means, and the list it leaves behind. */
export interface ChoreTogglePlan {
  direction: 'complete' | 'uncomplete';
  completions: ChoreCompletion[];
}

/**
 * Work out what a tap intends before it is sent.
 *
 * `POST /api/chores` flips the completion when it is given no direction, so
 * two people tapping the same chore in the same second apply two flips and
 * the chore ends up not done. Saying which way the tap meant makes the write
 * idempotent: a second "complete" for the same chore, person and day is a
 * no-op instead of an undo.
 */
export function planChoreToggle(
  completions: ChoreCompletion[],
  choreId: string,
  memberId: string,
  date: string,
  /**
   * Whether a finished entry still counts. A bonus chore a grown-up put back
   * has earlier rounds that no longer do (`countsSinceReset`): ticking it again
   * is a new round, not an un-tick of the old one. Defaults to every entry.
   */
  counts: (completion: ChoreCompletion) => boolean = () => true,
): ChoreTogglePlan {
  const sameDay = (c: ChoreCompletion) => c.choreId === choreId && c.memberId === memberId && c.date === date;
  // A "not today" mark is not a finished chore: ticking over it completes the
  // chore, and the server replaces the mark the same way.
  const existing = completions.findIndex((c) => sameDay(c) && !c.status && counts(c));
  if (existing >= 0) {
    return { direction: 'uncomplete', completions: completions.filter((_, i) => i !== existing) };
  }
  // Stamped like the server stamps it, so the new round counts on screen at once.
  return {
    direction: 'complete',
    completions: [...completions.filter((c) => !(sameDay(c) && c.status)), { choreId, memberId, date, at: new Date().toISOString() }],
  };
}

/** An un-tick that took someone's tickets below zero, in the words a screen needs. */
export interface OverspentNotice {
  /** The person's name, or null when the roster has no one by that id. */
  name: string | null;
  /** The balance after the debit: zero or less. */
  balance: number;
  /** How many tickets have to be earned to get back to zero. */
  owed: number;
}

/**
 * Turn the server's overspent field into something a screen can say. Un-ticking
 * a chore takes its tickets back, and they may already have been spent on a
 * reward, so the balance can go below zero with nothing else on screen to
 * explain where the tickets went.
 */
export function readOverspentNotice(
  overspent: ChoreToggleResponse['overspent'],
  members: FamilyMember[],
): OverspentNotice | null {
  if (!overspent) return null;
  return {
    name: members.find((m) => m.id === overspent.memberId)?.name ?? null,
    balance: overspent.balance,
    owed: Math.abs(overspent.balance),
  };
}
