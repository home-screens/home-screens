import { describe, expect, it } from 'vitest';
import type { ChoreCompletion, ChoreDefinition } from '@/types/config';
import { buildCompletionSet } from '../chore-assignments';
import type { BonusChore, BonusItem } from '../chore-bonus';
import { choreDayMenu, choreDayMenuKey } from '../chore-day-menu';

/**
 * The grown-up's menu for one chore, for one person, on the day on screen.
 * Every rule the phone used to carry in the component is pinned here.
 */

const DAY = '2026-11-03';
const EARLIER = '2026-11-02';
const ADA = 'ada';
const BRAM = 'bram';
const CLEO = 'cleo';
const everyone = [ADA, BRAM, CLEO];

const chore: ChoreDefinition = {
  id: 'dishes', name: 'Dishes', emoji: '', points: 2, frequency: 'daily',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: [ADA, BRAM, CLEO], rotation: 'fixed',
};
const solo: ChoreDefinition = { ...chore, id: 'bed', name: 'Make your bed', assigneeIds: [ADA] };
const bonusChore: BonusChore = { ...chore, id: 'garage', name: 'Garage', assigneeIds: [], bonus: { claim: 'first', comesBack: 'manual' } };
const everyoneCan: BonusChore = { ...chore, id: 'leaves', name: 'Rake leaves', assigneeIds: [], bonus: { claim: 'each', comesBack: 'daily' } };

const done = (choreId: string, memberId: string, date = DAY): ChoreCompletion => ({ choreId, memberId, date });
const skipped = (choreId: string, memberId: string, date = DAY): ChoreCompletion => ({ choreId, memberId, date, status: 'skipped' });

function menu(target: ChoreDefinition, completions: ChoreCompletion[], extra: Partial<Parameters<typeof choreDayMenu>[0]> = {}) {
  return choreDayMenu({
    chore: target,
    memberId: ADA,
    date: DAY,
    isPast: false,
    memberIds: everyone,
    groups: [],
    completionSet: buildCompletionSet(completions),
    ...extra,
  });
}

function bonusItem(target: BonusChore, overrides: Partial<BonusItem> = {}): BonusItem {
  return { chore: target, eligibleIds: everyone, doneIds: [], doneOn: {}, roundIsToday: false, waiting: false, ...overrides };
}

describe('a regular chore', () => {
  it('offers "did it" and "not today" while it is open', () => {
    expect(menu(solo, [])).toEqual([{ id: 'toggle', done: false }, { id: 'skip' }]);
  });

  it('offers only "not done" once it is ticked', () => {
    expect(menu(solo, [done('bed', ADA)])).toEqual([{ id: 'toggle', done: true }]);
  });

  it('offers only "back on today" while it is marked not today', () => {
    expect(menu(solo, [skipped('bed', ADA)])).toEqual([{ id: 'undo-skip' }]);
  });

  it('has nothing for a chore the person is not assigned on the day', () => {
    expect(menu(solo, [], { memberId: BRAM })).toBeNull();
  });

  it('adds "not today for everyone" naming only the people still owing it', () => {
    const actions = menu(chore, [done('dishes', BRAM)]);
    expect(actions).toContainEqual({ id: 'skip-all', memberIds: [ADA, CLEO] });
  });

  it('leaves an assignee who is no longer in the family out of everyone', () => {
    const actions = menu(chore, [], { memberIds: [ADA, BRAM] });
    expect(actions).toContainEqual({ id: 'skip-all', memberIds: [ADA, BRAM] });
  });

  it('has no "for everyone" on a chore one person has', () => {
    expect(menu(solo, [])?.some((a) => a.id === 'skip-all')).toBe(false);
  });

  it('has no "for everyone" once nobody owes it', () => {
    const actions = menu(chore, [done('dishes', ADA), done('dishes', BRAM), skipped('dishes', CLEO)]);
    expect(actions?.some((a) => a.id === 'skip-all')).toBe(false);
  });

  it('undoes "not today for everyone" in one go when at least two have it', () => {
    const actions = menu(chore, [skipped('dishes', ADA), skipped('dishes', BRAM)]);
    expect(actions).toEqual([{ id: 'undo-skip' }, { id: 'skip-all', memberIds: [CLEO] }, { id: 'undo-skip-all', memberIds: [ADA, BRAM] }]);
  });

  it('does not offer the one-go undo for a single not today', () => {
    expect(menu(chore, [skipped('dishes', BRAM)])?.some((a) => a.id === 'undo-skip-all')).toBe(false);
  });

  it('still offers "not today" on an earlier day', () => {
    expect(menu(solo, [], { isPast: true })).toEqual([{ id: 'toggle', done: false }, { id: 'skip' }]);
  });
});

describe('an up-for-grabs bonus chore', () => {
  it('has nothing when the screen does not show it to the person', () => {
    expect(menu(bonusChore, [])).toBeNull();
  });

  it('offers "did it" while it is open', () => {
    expect(menu(bonusChore, [], { bonus: bonusItem(bonusChore) })).toEqual([{ id: 'toggle', done: false }]);
  });

  it('offers "not done" on the day this person finished it', () => {
    const bonus = bonusItem(bonusChore, { grab: { status: 'done', memberId: ADA, date: DAY } });
    expect(menu(bonusChore, [], { bonus })).toEqual([{ id: 'toggle', done: true }, { id: 'put-back' }]);
  });

  it('offers nothing to tick once someone else finished it, only to put it back', () => {
    const bonus = bonusItem(bonusChore, { grab: { status: 'done', memberId: BRAM, date: DAY } });
    expect(menu(bonusChore, [], { bonus })).toEqual([{ id: 'put-back' }]);
  });

  it("lets go of another person's grab instead of ticking over it", () => {
    const bonus = bonusItem(bonusChore, { grab: { status: 'grabbed', memberId: BRAM } });
    expect(menu(bonusChore, [], { bonus })).toEqual([{ id: 'let-go', memberId: BRAM }]);
  });

  it("offers a tick and a let-go on the person's own grab", () => {
    const bonus = bonusItem(bonusChore, { grab: { status: 'grabbed', memberId: ADA } });
    expect(menu(bonusChore, [], { bonus })).toEqual([{ id: 'toggle', done: false }, { id: 'let-go', memberId: ADA }]);
  });

  it("on an earlier day of today's round, a held chore is handled from today's page", () => {
    const bonus = bonusItem(bonusChore, { grab: { status: 'grabbed', memberId: ADA }, roundIsToday: true });
    expect(menu(bonusChore, [], { bonus, date: EARLIER, isPast: true })).toBeNull();
  });

  it('never puts a chore back from an earlier day', () => {
    const bonus = bonusItem(bonusChore, { grab: { status: 'done', memberId: BRAM, date: EARLIER } });
    expect(menu(bonusChore, [], { bonus, date: EARLIER, isPast: true })).toBeNull();
  });

  it('only puts back a chore that comes back when a grown-up says so', () => {
    const daily: BonusChore = { ...bonusChore, bonus: { claim: 'first', comesBack: 'daily' } };
    const bonus = bonusItem(daily, { grab: { status: 'done', memberId: BRAM, date: DAY } });
    expect(menu(daily, [], { bonus })).toBeNull();
  });
});

describe('an everyone-can bonus chore', () => {
  it('offers "did it" to someone who has not done it this round', () => {
    const bonus = bonusItem(everyoneCan, { doneIds: [BRAM], doneOn: { [BRAM]: DAY } });
    expect(menu(everyoneCan, [], { bonus })).toEqual([{ id: 'toggle', done: false }]);
  });

  it('offers "not done" on the day the person did it', () => {
    const bonus = bonusItem(everyoneCan, { doneIds: [ADA], doneOn: { [ADA]: DAY } });
    expect(menu(everyoneCan, [], { bonus })).toEqual([{ id: 'toggle', done: true }]);
  });

  it('offers nothing to tick on another day of a round the person already did', () => {
    const bonus = bonusItem(everyoneCan, { doneIds: [ADA], doneOn: { [ADA]: EARLIER } });
    expect(menu(everyoneCan, [], { bonus })).toBeNull();
  });
});

describe('the menu key', () => {
  it('changes when a choice changes, so an open menu can close rather than swap under a finger', () => {
    const open = menu(bonusChore, [], { bonus: bonusItem(bonusChore) });
    const held = menu(bonusChore, [], { bonus: bonusItem(bonusChore, { grab: { status: 'grabbed', memberId: BRAM } }) });
    expect(choreDayMenuKey(open)).not.toBe(choreDayMenuKey(held));
    expect(choreDayMenuKey(open)).toBe(choreDayMenuKey(menu(bonusChore, [], { bonus: bonusItem(bonusChore) })));
    expect(choreDayMenuKey(null)).toBe('');
  });
});
