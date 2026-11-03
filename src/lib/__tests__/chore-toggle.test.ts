import { describe, expect, it } from 'vitest';
import type { ChoreCompletion, ChoreDefinition, ChoreGrab, ChoreToggleRequest } from '@/types/config';
import { applyChoreToggle, planChoreToggle, readOverspentNotice, type ChoreToggleContext } from '../chore-toggle';
import { DEFAULT_CHORE_SETTINGS, countsSinceReset, resetViewDay, type BonusChore } from '../chore-bonus';
import type { CompletionsData } from '../chore-completion-data';

// 2026-09-19 is a Saturday; its week runs Monday 14th to Sunday 20th.
const TODAY = '2026-09-19';
const YESTERDAY = '2026-09-18';
const MONDAY = '2026-09-14';
const NOW = '2026-09-19T10:00:00.000Z';
const EARLIER = '2026-09-19T08:00:00.000Z';
const groups = [{ id: 'kids', memberIds: ['ada', 'bram'] }];

function chore(id: string, over: Partial<ChoreDefinition> = {}): ChoreDefinition {
  return {
    id, name: id, emoji: '', points: 5, frequency: 'daily', daysOfWeek: [], timeOfDay: 'anytime',
    assigneeIds: ['ada'], assigneeGroupIds: [], rotation: 'fixed', ...over,
  } as ChoreDefinition;
}

function bonus(id: string, kind: BonusChore['bonus'] = { claim: 'first', comesBack: 'daily' }, over: Partial<ChoreDefinition> = {}): BonusChore {
  return chore(id, { assigneeIds: [], assigneeGroupIds: ['kids'], bonus: kind, ...over }) as BonusChore;
}

function done(choreId: string, memberId: string, date: string, extra: Partial<ChoreCompletion> = {}): ChoreCompletion {
  return { choreId, memberId, date, at: EARLIER, ...extra };
}

function context(chores: ChoreDefinition[], over: Partial<ChoreToggleContext> = {}): ChoreToggleContext {
  return { chores, groups, settings: DEFAULT_CHORE_SETTINGS, today: TODAY, now: NOW, ...over };
}

function tap(choreId: string, memberId = 'ada', date = TODAY, direction?: ChoreToggleRequest['direction']): ChoreToggleRequest {
  return { choreId, memberId, date, ...(direction ? { direction } : {}) };
}

describe('planChoreToggle', () => {
  it('ticks a chore not yet done, stamped with the instant given, and says which entry it adds', () => {
    const plan = planChoreToggle([], 'dishes', 'ada', TODAY, () => true, NOW);
    expect(plan.direction).toBe('complete');
    expect(plan.completions).toEqual([{ choreId: 'dishes', memberId: 'ada', date: TODAY, at: NOW }]);
    expect(plan.added).toBe(plan.completions[0]);
    expect(plan.undone).toBeUndefined();
  });

  it('un-ticks a done chore and says which entry it takes away', () => {
    const mine = done('dishes', 'ada', TODAY);
    const other = done('dishes', 'bram', TODAY);
    const plan = planChoreToggle([other, mine], 'dishes', 'ada', TODAY);
    expect(plan.direction).toBe('uncomplete');
    expect(plan.completions).toEqual([other]);
    expect(plan.undone).toBe(mine);
  });

  it('ticking over a "not today" mark replaces the mark with a finished entry', () => {
    const skipped = done('dishes', 'ada', TODAY, { status: 'skipped' });
    const plan = planChoreToggle([skipped], 'dishes', 'ada', TODAY, () => true, NOW);
    expect(plan.direction).toBe('complete');
    expect(plan.completions).toEqual([{ choreId: 'dishes', memberId: 'ada', date: TODAY, at: NOW }]);
  });

  it('treats an entry that no longer counts as an earlier round: a tick, not an un-tick', () => {
    const old = done('dishes', 'ada', TODAY);
    const plan = planChoreToggle([old], 'dishes', 'ada', TODAY, () => false, NOW);
    expect(plan.direction).toBe('complete');
    expect(plan.completions).toHaveLength(2);
    expect(plan.completions[0]).toBe(old);
  });
});

describe('applyChoreToggle', () => {
  const dishes = chore('dishes');

  it('flips a plain toggle either way and says which way it went', () => {
    const first = applyChoreToggle({ completions: [] }, tap('dishes'), context([dishes]));
    expect(first).toMatchObject({ outcome: 'changed', direction: 'complete' });
    expect(first.data.completions).toEqual([{ choreId: 'dishes', memberId: 'ada', date: TODAY, at: NOW }]);

    const second = applyChoreToggle(first.data, tap('dishes'), context([dishes]));
    expect(second).toMatchObject({ outcome: 'changed', direction: 'uncomplete' });
    expect(second.data.completions).toEqual([]);
  });

  it('is a no-op, handing back the same lists, when a direction asks for the state the chore is in', () => {
    const empty: CompletionsData = { completions: [] };
    const notDone = applyChoreToggle(empty, tap('dishes', 'ada', TODAY, 'uncomplete'), context([dishes]));
    expect(notDone.outcome).toBe('noop');
    expect(notDone.data).toBe(empty);

    const already: CompletionsData = { completions: [done('dishes', 'ada', TODAY)] };
    const repeat = applyChoreToggle(already, tap('dishes', 'ada', TODAY, 'complete'), context([dishes]));
    expect(repeat.outcome).toBe('noop');
    expect(repeat.data).toBe(already);
  });

  it('still ticks and un-ticks a chore that no longer exists', () => {
    const ticked = applyChoreToggle({ completions: [] }, tap('gone'), context([dishes]));
    expect(ticked).toMatchObject({ outcome: 'changed', direction: 'complete' });
    const unticked = applyChoreToggle(ticked.data, tap('gone'), context([dishes]));
    expect(unticked).toMatchObject({ outcome: 'changed', direction: 'uncomplete' });
    expect(unticked.data.completions).toEqual([]);
  });

  it('leaves the grabs key absent when the toggle leaves grabs alone, so the file keeps its shape', () => {
    const result = applyChoreToggle({ completions: [] }, tap('dishes'), context([dishes]));
    expect('grabs' in result.data).toBe(false);
  });

  describe('bonus chores', () => {
    const grabbable = bonus('wash-car');
    const each = bonus('leaves', { claim: 'each', comesBack: 'weekly' });

    it('refuses someone the chore is not open to, handing back the lists as they were', () => {
      const data: CompletionsData = { completions: [] };
      const result = applyChoreToggle(data, tap('wash-car', 'zed'), context([grabbable]));
      expect(result).toMatchObject({ outcome: 'refused', refused: { refusal: 'not-yours' } });
      expect(result.data).toBe(data);
    });

    it('refuses a chore someone else already did this round, naming them', () => {
      const data: CompletionsData = { completions: [done('wash-car', 'bram', TODAY)] };
      const result = applyChoreToggle(data, tap('wash-car'), context([grabbable]));
      expect(result).toMatchObject({ outcome: 'refused', refused: { refusal: 'taken', memberId: 'bram' } });
      expect(result.data).toBe(data);
    });

    it('refuses a chore someone else is holding, naming them', () => {
      const data: CompletionsData = { completions: [], grabs: [{ choreId: 'wash-car', memberId: 'bram', date: TODAY }] };
      const result = applyChoreToggle(data, tap('wash-car'), context([grabbable]));
      expect(result).toMatchObject({ outcome: 'refused', refused: { refusal: 'grabbed', memberId: 'bram' } });
    });

    it('treats an everyone-can chore already done this round on another day as a repeat tick', () => {
      const data: CompletionsData = { completions: [done('leaves', 'ada', MONDAY)] };
      const result = applyChoreToggle(data, tap('leaves'), context([each]));
      expect(result.outcome).toBe('noop');
      expect(result.data).toBe(data);
    });

    it('finishing the chore one holds ends the grabs and remembers the grab on the completion', () => {
      const data: CompletionsData = { completions: [], grabs: [{ choreId: 'wash-car', memberId: 'ada', date: TODAY }] };
      const result = applyChoreToggle(data, tap('wash-car'), context([grabbable]));
      expect(result).toMatchObject({ outcome: 'changed', direction: 'complete' });
      expect(result.data.completions).toEqual([{ choreId: 'wash-car', memberId: 'ada', date: TODAY, at: NOW, endedGrab: TODAY }]);
      expect(result.data.grabs).toEqual([]);
    });

    it('a tick nobody had grabbed for remembers no grab', () => {
      const result = applyChoreToggle({ completions: [] }, tap('wash-car'), context([grabbable]));
      expect(result.data.completions[0].endedGrab).toBeUndefined();
      expect(result.data.grabs).toEqual([]);
    });

    it('un-ticking hands the grab back with its own date', () => {
      const data: CompletionsData = { completions: [done('wash-car', 'ada', TODAY, { endedGrab: TODAY })], grabs: [] };
      const result = applyChoreToggle(data, tap('wash-car'), context([grabbable]));
      expect(result).toMatchObject({ outcome: 'changed', direction: 'uncomplete' });
      expect(result.data.completions).toEqual([]);
      expect(result.data.grabs).toEqual([{ choreId: 'wash-car', memberId: 'ada', date: TODAY }]);
    });

    it('un-ticking puts the chore up for grabs instead when someone grabbed it since', () => {
      const since: ChoreGrab = { choreId: 'wash-car', memberId: 'bram', date: TODAY };
      const data: CompletionsData = { completions: [done('wash-car', 'ada', TODAY, { endedGrab: TODAY })], grabs: [since] };
      const result = applyChoreToggle(data, tap('wash-car'), context([grabbable]));
      expect(result.data.grabs).toEqual([since]);
    });

    it('un-ticking puts the chore up for grabs instead when the person holds as many as allowed', () => {
      const other = bonus('mow');
      const held: ChoreGrab = { choreId: 'mow', memberId: 'ada', date: TODAY };
      const data: CompletionsData = { completions: [done('wash-car', 'ada', TODAY, { endedGrab: TODAY })], grabs: [held] };
      const result = applyChoreToggle(data, tap('wash-car'), context([grabbable, other]));
      expect(result.data.grabs).toEqual([held]);
    });

    it("ticking yesterday's round leaves today's grab alone", () => {
      const todays: ChoreGrab = { choreId: 'wash-car', memberId: 'bram', date: TODAY };
      const data: CompletionsData = { completions: [], grabs: [todays] };
      const result = applyChoreToggle(data, tap('wash-car', 'ada', YESTERDAY), context([grabbable]));
      expect(result).toMatchObject({ outcome: 'changed', direction: 'complete' });
      expect(result.data.grabs).toBe(data.grabs);
      expect(result.data.completions[0].endedGrab).toBeUndefined();
    });
  });
});

/**
 * The phone and the wall draw a tap with `planChoreToggle` before the hub
 * answers, and tell the hub which way it went. What they draw must be what the
 * hub saves, or the chore flickers at the next poll.
 */
describe('the screen and the hub agree on what a tap leaves', () => {
  const dishes = chore('dishes');
  const putBack = bonus('garage', { claim: 'each', comesBack: 'manual' });
  const grabbable = bonus('wash-car');

  // The wall's `counts` as `useChoreData` writes it; the phone's is the same with its own day.
  const asTheWallPlans = (data: CompletionsData, choreId: string, chores: ChoreDefinition[]) => {
    const found = chores.find((c) => c.id === choreId);
    return planChoreToggle(
      data.completions, choreId, 'ada', TODAY,
      (c) => !found || countsSinceReset(found, c, data.bonusResets ?? {}, resetViewDay(TODAY, TODAY)),
      NOW,
    );
  };

  const scenarios: Array<{ name: string; data: CompletionsData; choreId: string; chores: ChoreDefinition[] }> = [
    { name: 'ticking a regular chore', data: { completions: [] }, choreId: 'dishes', chores: [dishes] },
    { name: 'un-ticking a regular chore', data: { completions: [done('dishes', 'ada', TODAY)] }, choreId: 'dishes', chores: [dishes] },
    { name: 'ticking over a "not today" mark', data: { completions: [done('dishes', 'ada', TODAY, { status: 'skipped' })] }, choreId: 'dishes', chores: [dishes] },
    {
      name: 'ticking a put-back chore again after a grown-up put it back',
      data: { completions: [done('garage', 'ada', TODAY)], bonusResets: { garage: '2026-09-19T09:00:00.000Z' } },
      choreId: 'garage',
      chores: [putBack],
    },
    { name: 'un-ticking a put-back chore done since the put-back', data: { completions: [done('garage', 'ada', TODAY)] }, choreId: 'garage', chores: [putBack] },
    { name: 'ticking an open up-for-grabs chore', data: { completions: [] }, choreId: 'wash-car', chores: [grabbable] },
  ];

  it.each(scenarios)('$name', ({ data, choreId, chores }) => {
    const screen = asTheWallPlans(data, choreId, chores);
    const hub = applyChoreToggle(data, { choreId, memberId: 'ada', date: TODAY, direction: screen.direction }, context(chores));
    expect(hub).toMatchObject({ outcome: 'changed', direction: screen.direction });
    expect(hub.data.completions).toEqual(screen.completions);
  });

  it('differs only by the grab stamp the hub alone knows when the person was holding the chore', () => {
    const data: CompletionsData = { completions: [], grabs: [{ choreId: 'wash-car', memberId: 'ada', date: TODAY }] };
    const screen = asTheWallPlans(data, 'wash-car', [grabbable]);
    const hub = applyChoreToggle(data, { choreId: 'wash-car', memberId: 'ada', date: TODAY, direction: screen.direction }, context([grabbable]));
    expect(hub.data.completions.map(({ endedGrab: _stamp, ...rest }) => rest)).toEqual(screen.completions);
  });
});

describe('readOverspentNotice', () => {
  const members = [{ id: 'ada', name: 'Ada' }] as Parameters<typeof readOverspentNotice>[1];

  it('names the person and how many tickets they owe', () => {
    expect(readOverspentNotice({ memberId: 'ada', balance: -3 }, members)).toEqual({ name: 'Ada', balance: -3, owed: 3 });
  });

  it('is nothing when the hub reported no overspend, and nameless for someone not in the roster', () => {
    expect(readOverspentNotice(undefined, members)).toBeNull();
    expect(readOverspentNotice({ memberId: 'zed', balance: -1 }, members)).toEqual({ name: null, balance: -1, owed: 1 });
  });
});
