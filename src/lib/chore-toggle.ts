import type { ChoreCompletion, ChoreDefinition, ChoreSettings, ChoreToggleRequest, ChoreToggleResponse } from '@/types/config';
import type { FamilyMember } from '@/types/family';
import type { ChoreGroup } from './chore-assignments';
import { applyToggleGrabEffects, checkBonusComplete, countsSinceReset, isBonusChore, resetViewDay, type BonusCheck, type BonusMarks } from './chore-bonus';
// A type only: the store behind it opens files, and the phone and the wall load this module.
import type { CompletionsData } from './chore-completion-data';

/**
 * What ticking a chore means. The phone and the wall plan a tap with
 * `planChoreToggle` to draw it at once and to tell the hub which way it went;
 * the hub applies the same plan with `applyChoreToggle`, plus the bonus rules
 * a screen cannot judge alone (who is holding an up-for-grabs chore, and
 * what finishing it does to the grab). Both halves live here so the screen
 * and the saved file cannot disagree about the completion a tap leaves.
 */

/** What a tap on a chore row means, and the list it leaves behind. */
export interface ChoreTogglePlan {
  direction: 'complete' | 'uncomplete';
  completions: ChoreCompletion[];
  /** A tick: the finished entry it adds, the last in `completions`. */
  added?: ChoreCompletion;
  /** An un-tick: the finished entry it takes away. */
  undone?: ChoreCompletion;
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
  /** The instant a tick is stamped with. Defaults to now. */
  at: string = new Date().toISOString(),
): ChoreTogglePlan {
  const sameDay = (c: ChoreCompletion) => c.choreId === choreId && c.memberId === memberId && c.date === date;
  // A "not today" mark is not a finished chore: ticking over it completes the
  // chore, and the server replaces the mark the same way.
  const existing = completions.findIndex((c) => sameDay(c) && !c.status && counts(c));
  if (existing >= 0) {
    return { direction: 'uncomplete', completions: completions.filter((_, i) => i !== existing), undone: completions[existing] };
  }
  // The hub stamps a new round the same way, so it counts on screen at once.
  const added: ChoreCompletion = { choreId, memberId, date, at };
  return {
    direction: 'complete',
    completions: [...completions.filter((c) => !(sameDay(c) && c.status)), added],
    added,
  };
}

/** What the hub knows that a tap cannot: the chores, the family's groups, the household's rules and day. */
export interface ChoreToggleContext {
  chores: readonly ChoreDefinition[];
  groups: readonly ChoreGroup[];
  settings: ChoreSettings;
  /** The household's today. */
  today: string;
  /** The instant a tick is stamped with. */
  now: string;
}

/** What a toggle came to, with the lists it leaves. */
export type ChoreToggleResult =
  /** The lists are as they were: the request asked for a state the chore was already in. */
  | { outcome: 'noop'; data: CompletionsData }
  /** The lists changed, `direction` says which way. */
  | { outcome: 'changed'; direction: 'complete' | 'uncomplete'; data: CompletionsData }
  /** A bonus chore someone else has, or that is not open to this person. The lists are as they were. */
  | { outcome: 'refused'; refused: BonusCheck; data: CompletionsData };

/**
 * Apply a tick or un-tick to the saved lists. A no-op and a refusal hand back
 * the very `data` they were given, so a store can tell nothing changed.
 *
 * A directional request is idempotent: already in the asked-for state is a
 * no-op, so a repeated "I finished the dishes" from a voice caller never flips
 * the chore back off or moves tickets twice. A bonus chore can be finished
 * only by someone it is open to, and an up-for-grabs one only once and only by
 * whoever is holding it; an everyone-can chore already done this time round
 * is a no-op, like a repeat tick. A chore that no longer exists is still
 * ticked and un-ticked: the mark is the household's, whatever became of the
 * chore. What a tick does to the chore's grabs is `applyToggleGrabEffects`.
 */
export function applyChoreToggle(
  data: CompletionsData,
  request: ChoreToggleRequest,
  context: ChoreToggleContext,
): ChoreToggleResult {
  const { choreId, memberId, date, direction } = request;
  const { chores, groups, settings, today, now } = context;
  const chore = chores.find((c) => c.id === choreId);
  // A finished entry for this chore, person and day that still counts. One
  // made before a grown-up put the chore back is an earlier round: it stays
  // (its tickets were earned) and is neither this tick's "already done" nor
  // what an un-tick takes away.
  const grabs = data.grabs ?? [];
  const bonusResets = data.bonusResets ?? {};
  const counts = (c: ChoreCompletion) => !chore || countsSinceReset(chore, c, bonusResets, resetViewDay(date, today));
  const plan = planChoreToggle(data.completions, choreId, memberId, date, counts, now);

  if (direction !== undefined && direction !== plan.direction) return { outcome: 'noop', data };

  if (plan.direction === 'complete' && chore && isBonusChore(chore)) {
    const before: BonusMarks = { completions: data.completions, grabs, bonusResets };
    const check = checkBonusComplete(chore, memberId, date, before, groups, settings.grabHold, today);
    if (check && 'already' in check) return { outcome: 'noop', data };
    if (check) return { outcome: 'refused', refused: check, data };
  }

  const effects = chore
    ? applyToggleGrabEffects(
        chore,
        { direction: plan.direction, memberId, date, undone: plan.undone },
        { completions: plan.completions, grabs, bonusResets },
        chores,
        settings,
        groups,
        today,
      )
    : {};
  const completions = effects.endedGrab !== undefined
    ? plan.completions.map((c) => (c === plan.added ? { ...c, endedGrab: effects.endedGrab } : c))
    : plan.completions;
  return {
    outcome: 'changed',
    direction: plan.direction,
    data: { ...data, completions, ...(effects.grabs ? { grabs: effects.grabs } : {}) },
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
