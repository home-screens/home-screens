import type { ChoreDefinition } from '@/types/config';
import { isAssignedOn, isChoreComplete, isChoreSkipped, resolveAssignee, type ChoreGroup } from './chore-assignments';
import { canPutBack, type BonusItem } from './chore-bonus';

/**
 * What a grown-up may do to one chore, for one person, on the day on screen:
 * the menu the phone opens by holding a chore row. The rules live here as a
 * pure function over the lists; the component turns each action into words
 * and a handler.
 */

export type ChoreDayMenuAction =
  /** Tick the chore for the person, or take the tick away when `done`. */
  | { id: 'toggle'; done: boolean }
  /** Let go of the grab `memberId` is holding. */
  | { id: 'let-go'; memberId: string }
  /** Put a "when I put it back" bonus chore back so it can be done again. */
  | { id: 'put-back' }
  /** Mark it "not today" for the person. */
  | { id: 'skip' }
  /** Take the person's "not today" away. */
  | { id: 'undo-skip' }
  /** "Not today" for everyone who still owes it. */
  | { id: 'skip-all'; memberIds: string[] }
  /** Take "not today" away from everyone it was given to, in one go. */
  | { id: 'undo-skip-all'; memberIds: string[] };

export interface ChoreDayMenuInput {
  chore: ChoreDefinition;
  /** The person picked. */
  memberId: string;
  /** The day on screen. */
  date: string;
  /** Whether `date` is before the household's today. */
  isPast: boolean;
  /** Everyone in the roster; an assignee no longer in it is left out of "everyone". */
  memberIds: readonly string[];
  groups: readonly ChoreGroup[];
  completionSet: Set<string>;
  /**
   * The chore as a bonus chore stands for the person on `date`, when it is
   * one the screen shows them. Absent for a regular chore, and for a bonus
   * chore the person is not offered (not open to them, or waiting for a
   * grown-up out of a kid's sight).
   */
  bonus?: BonusItem;
}

/**
 * The actions the menu offers, in order, or null when there is nothing to
 * offer: then the row has no menu and no hold.
 */
export function choreDayMenu({ chore, memberId, date, isPast, memberIds, groups, completionSet, bonus }: ChoreDayMenuInput): ChoreDayMenuAction[] | null {
  if (chore.bonus) {
    if (!bonus) return null;
    const actions: ChoreDayMenuAction[] = [];
    const grab = bonus.grab;
    const doneOn = grab
      ? (grab.status === 'done' && grab.memberId === memberId ? grab.date : undefined)
      : bonus.doneOn[memberId];
    // On an earlier day of today's round, a held chore is finished or let go
    // from today's page: a tick here would finish today's job.
    const held = grab?.status === 'grabbed' && (grab.memberId !== memberId || bonus.roundIsToday);
    if (doneOn === date) {
      actions.push({ id: 'toggle', done: true });
    } else if (!doneOn && grab?.status !== 'done' && !held) {
      actions.push({ id: 'toggle', done: false });
    }
    if (grab?.status === 'grabbed' && !bonus.roundIsToday) {
      actions.push({ id: 'let-go', memberId: grab.memberId });
    }
    if (canPutBack(bonus) && !isPast) {
      actions.push({ id: 'put-back' });
    }
    return actions.length ? actions : null;
  }

  if (!isAssignedOn(chore, memberId, date, groups)) return null;
  const actions: ChoreDayMenuAction[] = [];
  const done = isChoreComplete(completionSet, chore.id, memberId, date);
  if (isChoreSkipped(completionSet, chore.id, memberId, date)) {
    actions.push({ id: 'undo-skip' });
  } else {
    actions.push({ id: 'toggle', done });
    if (!done) actions.push({ id: 'skip' });
  }
  const everyone = resolveAssignee(chore, date, groups).filter((id) => memberIds.includes(id));
  const stillOwing = everyone.filter((id) => !isChoreComplete(completionSet, chore.id, id, date) && !isChoreSkipped(completionSet, chore.id, id, date));
  if (everyone.length > 1 && stillOwing.length > 0) {
    actions.push({ id: 'skip-all', memberIds: stillOwing });
  }
  const skipped = everyone.filter((id) => isChoreSkipped(completionSet, chore.id, id, date));
  if (skipped.length > 1) {
    actions.push({ id: 'undo-skip-all', memberIds: skipped });
  }
  return actions;
}

/**
 * The menu's choices as one string, so a surface can tell whether a refresh
 * changed what the open menu offers (someone grabbed the chore meanwhile) and
 * close it rather than swap a choice under the finger.
 */
export function choreDayMenuKey(actions: readonly ChoreDayMenuAction[] | null): string {
  return actions ? actions.map((a) => JSON.stringify(a)).join('|') : '';
}
