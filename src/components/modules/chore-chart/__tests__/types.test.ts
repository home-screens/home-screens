import { describe, it, expect } from 'vitest';
import {
  localDateStr,
  getOrderedDays,
  resolveAssignee,
  choreAppliesToday,
  sortChores,
  getCurrentTimeOfDay,
  completionKey,
  todayStr,
  dateNDaysAgo,
  addDaysISO,
  getWeekDatesFor,
  cascadeDeleteMember,
  parseISO,
  addMonthsClamped,
  computeDayEntries,
  CHORE_HISTORY_DAYS,
  type ResolvedAssignment,
} from '../types';
import type { ChoreDefinition, ChoreMember } from '@/types/config';

function makeChore(overrides: Partial<ChoreDefinition> = {}): ChoreDefinition {
  return {
    id: 'chore-1',
    name: 'Dishes',
    emoji: '🍽️',
    points: 1,
    frequency: 'daily',
    daysOfWeek: [],
    timeOfDay: 'morning',
    assigneeIds: ['alice', 'bob'],
    rotation: 'fixed',
    ...overrides,
  };
}

describe('localDateStr', () => {
  it('formats a date as YYYY-MM-DD', () => {
    const d = new Date(2026, 2, 15); // March 15, 2026
    expect(localDateStr(d)).toBe('2026-03-15');
  });

  it('zero-pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5); // Jan 5, 2026
    expect(localDateStr(d)).toBe('2026-01-05');
  });

  it('handles December 31st correctly', () => {
    const d = new Date(2025, 11, 31);
    expect(localDateStr(d)).toBe('2025-12-31');
  });
});

describe('getOrderedDays', () => {
  it('returns Sunday-first order for "sunday"', () => {
    expect(getOrderedDays('sunday')).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('returns Monday-first order for "monday"', () => {
    expect(getOrderedDays('monday')).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe('todayStr', () => {
  it('returns a YYYY-MM-DD string matching today', () => {
    const result = todayStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe(localDateStr(new Date()));
  });
});

describe('dateNDaysAgo', () => {
  it('returns today for n=0', () => {
    expect(dateNDaysAgo(0)).toBe(todayStr());
  });

  it('returns a date in the past for positive n', () => {
    const result = dateNDaysAgo(7);
    const d = new Date();
    d.setDate(d.getDate() - 7);
    expect(result).toBe(localDateStr(d));
  });
});

describe('addDaysISO', () => {
  it('adds positive days within the same month', () => {
    expect(addDaysISO('2026-03-15', 5)).toBe('2026-03-20');
  });

  it('subtracts days within the same month', () => {
    expect(addDaysISO('2026-03-15', -5)).toBe('2026-03-10');
  });

  it('handles crossing into the next month', () => {
    expect(addDaysISO('2026-03-30', 5)).toBe('2026-04-04');
  });

  it('handles crossing into the previous month', () => {
    expect(addDaysISO('2026-03-02', -5)).toBe('2026-02-25');
  });

  it('handles crossing into the next year', () => {
    expect(addDaysISO('2025-12-30', 5)).toBe('2026-01-04');
  });

  it('handles crossing into the previous year', () => {
    expect(addDaysISO('2026-01-02', -5)).toBe('2025-12-28');
  });

  it('handles a full 90-day walk backward', () => {
    // Round trip check — walking 90 days back then 90 days forward returns the same ISO.
    const start = '2026-04-09';
    const back = addDaysISO(start, -90);
    expect(addDaysISO(back, 90)).toBe(start);
  });

  it('handles leap-year February', () => {
    expect(addDaysISO('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDaysISO('2024-02-29', 1)).toBe('2024-03-01');
  });

  it('returns n=0 unchanged', () => {
    expect(addDaysISO('2026-03-15', 0)).toBe('2026-03-15');
  });
});

describe('getWeekDatesFor', () => {
  it('returns 7 dates starting on Sunday for "sunday" weekStartDay', () => {
    // 2026-04-09 is a Thursday. Sunday-start week = 2026-04-05..2026-04-11.
    const dates = getWeekDatesFor('2026-04-09', 'sunday');
    expect(dates).toEqual([
      '2026-04-05',
      '2026-04-06',
      '2026-04-07',
      '2026-04-08',
      '2026-04-09',
      '2026-04-10',
      '2026-04-11',
    ]);
  });

  it('returns 7 dates starting on Monday for "monday" weekStartDay', () => {
    // 2026-04-09 is a Thursday. Monday-start week = 2026-04-06..2026-04-12.
    const dates = getWeekDatesFor('2026-04-09', 'monday');
    expect(dates).toEqual([
      '2026-04-06',
      '2026-04-07',
      '2026-04-08',
      '2026-04-09',
      '2026-04-10',
      '2026-04-11',
      '2026-04-12',
    ]);
  });

  it('handles a Sunday reference with sunday start (no backtrack)', () => {
    // 2026-04-05 is a Sunday.
    const dates = getWeekDatesFor('2026-04-05', 'sunday');
    expect(dates[0]).toBe('2026-04-05');
    expect(dates[6]).toBe('2026-04-11');
  });

  it('handles a Sunday reference with monday start (backtracks 6 days)', () => {
    // 2026-04-05 Sunday should pull back to 2026-03-30 Monday.
    const dates = getWeekDatesFor('2026-04-05', 'monday');
    expect(dates[0]).toBe('2026-03-30');
    expect(dates[6]).toBe('2026-04-05');
  });

  it('accepts a Date object and a string reference equivalently', () => {
    const asString = getWeekDatesFor('2026-04-09', 'monday');
    const asDate = getWeekDatesFor(new Date(2026, 3, 9), 'monday');
    expect(asString).toEqual(asDate);
  });

  it('walks backward across a month boundary', () => {
    // 2026-05-02 is a Saturday; monday-start week = 2026-04-27..2026-05-03.
    const dates = getWeekDatesFor('2026-05-02', 'monday');
    expect(dates[0]).toBe('2026-04-27');
    expect(dates[6]).toBe('2026-05-03');
  });

  it('walks backward across a year boundary', () => {
    // 2026-01-02 is a Friday; sunday-start week = 2025-12-28..2026-01-03.
    const dates = getWeekDatesFor('2026-01-02', 'sunday');
    expect(dates[0]).toBe('2025-12-28');
    expect(dates[6]).toBe('2026-01-03');
  });

  it('always returns exactly 7 dates', () => {
    const dates = getWeekDatesFor('2026-04-09', 'sunday');
    expect(dates).toHaveLength(7);
  });
});

describe('resolveAssignee', () => {
  it('returns all assignees for fixed rotation', () => {
    const chore = makeChore({ rotation: 'fixed' });
    expect(resolveAssignee(chore, '2026-03-15')).toEqual(['alice', 'bob']);
  });

  it('returns all assignees when only one member (regardless of rotation)', () => {
    const chore = makeChore({ rotation: 'rotate-daily', assigneeIds: ['alice'] });
    expect(resolveAssignee(chore, '2026-03-15')).toEqual(['alice']);
  });

  it('rotates daily across members deterministically', () => {
    const chore = makeChore({ rotation: 'rotate-daily', assigneeIds: ['alice', 'bob', 'charlie'] });

    const day1 = resolveAssignee(chore, '2026-03-15');
    const day2 = resolveAssignee(chore, '2026-03-16');
    const day3 = resolveAssignee(chore, '2026-03-17');

    // Each day returns exactly one assignee
    expect(day1).toHaveLength(1);
    expect(day2).toHaveLength(1);
    expect(day3).toHaveLength(1);

    // Consecutive days cycle through different members
    expect(day1[0]).not.toBe(day2[0]);
    expect(day2[0]).not.toBe(day3[0]);
  });

  it('returns the same assignee for the same date (daily rotation)', () => {
    const chore = makeChore({ rotation: 'rotate-daily', assigneeIds: ['alice', 'bob'] });
    const first = resolveAssignee(chore, '2026-03-15');
    const second = resolveAssignee(chore, '2026-03-15');
    expect(first).toEqual(second);
  });

  it('rotates weekly — same assignee for dates within the same 7-day epoch span', () => {
    const chore = makeChore({ rotation: 'rotate-weekly', assigneeIds: ['alice', 'bob'] });

    // Epoch is 2024-01-01. weeksSinceEpoch = Math.round(days / 7).
    // Days 0-3 from epoch → week 0; days 4-10 → week 1; etc.
    // Pick two dates in the same week-span:
    const day1 = resolveAssignee(chore, '2024-01-01'); // day 0 → week 0
    const day2 = resolveAssignee(chore, '2024-01-03'); // day 2 → week 0
    expect(day1).toEqual(day2);
  });

  it('rotates weekly — different assignee in a different 7-day span', () => {
    const chore = makeChore({ rotation: 'rotate-weekly', assigneeIds: ['alice', 'bob'] });
    // day 0 → week 0, day 7 → week 1
    const week0 = resolveAssignee(chore, '2024-01-01');
    const week1 = resolveAssignee(chore, '2024-01-08');
    expect(week0[0]).not.toBe(week1[0]);
  });
});

describe('choreAppliesToday', () => {
  it('applies on any day when daysOfWeek is empty', () => {
    const chore = makeChore({ daysOfWeek: [] });
    expect(choreAppliesToday(chore, 0)).toBe(true); // Sunday
    expect(choreAppliesToday(chore, 3)).toBe(true); // Wednesday
    expect(choreAppliesToday(chore, 6)).toBe(true); // Saturday
  });

  it('applies only on specified days', () => {
    const chore = makeChore({ daysOfWeek: [1, 3, 5] }); // Mon, Wed, Fri
    expect(choreAppliesToday(chore, 1)).toBe(true);
    expect(choreAppliesToday(chore, 2)).toBe(false);
    expect(choreAppliesToday(chore, 3)).toBe(true);
    expect(choreAppliesToday(chore, 4)).toBe(false);
    expect(choreAppliesToday(chore, 5)).toBe(true);
  });

  it('respects biweekly frequency — only applies on even weeks from epoch', () => {
    const chore = makeChore({ frequency: 'biweekly', daysOfWeek: [] });

    // The epoch is 2024-01-01 UTC. Weeks are counted from that point.
    // We need to find two dates exactly one week apart and verify one passes, one fails.
    const result1 = choreAppliesToday(chore, 1, '2024-01-01'); // week 0 (even)
    const result2 = choreAppliesToday(chore, 1, '2024-01-08'); // week 1 (odd)

    expect(result1).toBe(true);
    expect(result2).toBe(false);
  });

  it('applies biweekly daily chores regardless when no date is provided', () => {
    const chore = makeChore({ frequency: 'biweekly', daysOfWeek: [] });
    // Without a date, biweekly check is skipped
    expect(choreAppliesToday(chore, 3)).toBe(true);
  });
});

describe('sortChores', () => {
  function makeAssignment(
    overrides: Partial<ResolvedAssignment> & { timeOfDay?: ChoreDefinition['timeOfDay']; completed?: boolean },
  ): ResolvedAssignment {
    return {
      chore: makeChore({ timeOfDay: overrides.timeOfDay ?? 'morning' }),
      memberId: 'alice',
      isCompleted: overrides.completed ?? false,
      ...overrides,
    };
  }

  it('sorts incomplete before completed', () => {
    const assignments: ResolvedAssignment[] = [
      makeAssignment({ completed: true }),
      makeAssignment({ completed: false }),
    ];

    const sorted = sortChores(assignments, false);
    expect(sorted[0].isCompleted).toBe(false);
    expect(sorted[1].isCompleted).toBe(true);
  });

  it('sorts by time of day when enabled', () => {
    const assignments: ResolvedAssignment[] = [
      makeAssignment({ timeOfDay: 'evening' }),
      makeAssignment({ timeOfDay: 'morning' }),
      makeAssignment({ timeOfDay: 'afternoon' }),
    ];

    const sorted = sortChores(assignments, true);
    expect(sorted[0].chore.timeOfDay).toBe('morning');
    expect(sorted[1].chore.timeOfDay).toBe('afternoon');
    expect(sorted[2].chore.timeOfDay).toBe('evening');
  });

  it('does not sort by time of day when disabled', () => {
    const assignments: ResolvedAssignment[] = [
      makeAssignment({ timeOfDay: 'evening' }),
      makeAssignment({ timeOfDay: 'morning' }),
    ];

    // With showTimeOfDay=false, order among same-completion items is preserved
    const sorted = sortChores(assignments, false);
    // Both incomplete, so stable order maintained
    expect(sorted[0].chore.timeOfDay).toBe('evening');
    expect(sorted[1].chore.timeOfDay).toBe('morning');
  });

  it('does not mutate the original array', () => {
    const assignments: ResolvedAssignment[] = [
      makeAssignment({ completed: true }),
      makeAssignment({ completed: false }),
    ];
    const original = [...assignments];
    sortChores(assignments, false);
    expect(assignments[0]).toBe(original[0]);
  });
});

describe('getCurrentTimeOfDay', () => {
  it('returns morning for hours 0-11', () => {
    expect(getCurrentTimeOfDay(0)).toBe('morning');
    expect(getCurrentTimeOfDay(6)).toBe('morning');
    expect(getCurrentTimeOfDay(11)).toBe('morning');
  });

  it('returns afternoon for hours 12-16', () => {
    expect(getCurrentTimeOfDay(12)).toBe('afternoon');
    expect(getCurrentTimeOfDay(14)).toBe('afternoon');
    expect(getCurrentTimeOfDay(16)).toBe('afternoon');
  });

  it('returns evening for hours 17-23', () => {
    expect(getCurrentTimeOfDay(17)).toBe('evening');
    expect(getCurrentTimeOfDay(20)).toBe('evening');
    expect(getCurrentTimeOfDay(23)).toBe('evening');
  });
});

describe('completionKey', () => {
  it('builds a hyphen-separated key', () => {
    expect(completionKey('chore-1', 'alice', '2026-03-15')).toBe('chore-1-alice-2026-03-15');
  });
});

describe('cascadeDeleteMember', () => {
  const makeMember = (id: string, name: string): ChoreMember => ({
    id,
    name,
    emoji: '',
    color: '#fff',
  });

  it('removes the member from the members list', () => {
    const members = [makeMember('a', 'Alice'), makeMember('b', 'Bob')];
    const chores = [makeChore({ id: 'c1', assigneeIds: ['a'] })];
    const result = cascadeDeleteMember(members, chores, 'a');
    expect(result.members).toEqual([makeMember('b', 'Bob')]);
  });

  it('removes the member from all chore assigneeIds', () => {
    const members = [makeMember('a', 'Alice'), makeMember('b', 'Bob')];
    const chores = [makeChore({ id: 'c1', assigneeIds: ['a', 'b'] })];
    const result = cascadeDeleteMember(members, chores, 'a');
    expect(result.chores[0].assigneeIds).toEqual(['b']);
  });

  it('deletes chores with no remaining assignees', () => {
    const members = [makeMember('a', 'Alice'), makeMember('b', 'Bob')];
    const chores = [
      makeChore({ id: 'c1', assigneeIds: ['a'] }),
      makeChore({ id: 'c2', assigneeIds: ['a', 'b'] }),
    ];
    const result = cascadeDeleteMember(members, chores, 'a');
    expect(result.chores).toHaveLength(1);
    expect(result.chores[0].id).toBe('c2');
    expect(result.chores[0].assigneeIds).toEqual(['b']);
  });

  it('returns empty chores when deleting the last member', () => {
    const members = [makeMember('a', 'Alice')];
    const chores = [
      makeChore({ id: 'c1', assigneeIds: ['a'] }),
      makeChore({ id: 'c2', assigneeIds: ['a'] }),
    ];
    const result = cascadeDeleteMember(members, chores, 'a');
    expect(result.members).toEqual([]);
    expect(result.chores).toEqual([]);
  });

  it('leaves unrelated chores untouched', () => {
    const members = [makeMember('a', 'Alice'), makeMember('b', 'Bob')];
    const chores = [makeChore({ id: 'c1', assigneeIds: ['b'] })];
    const result = cascadeDeleteMember(members, chores, 'a');
    expect(result.chores).toEqual(chores);
  });
});

describe('CHORE_HISTORY_DAYS', () => {
  it('is 90 days (single source of truth for client + server)', () => {
    expect(CHORE_HISTORY_DAYS).toBe(90);
  });
});

describe('parseISO', () => {
  it('returns a local-midnight Date for a YYYY-MM-DD string', () => {
    const d = parseISO('2026-04-09');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // April = 3
    expect(d.getDate()).toBe(9);
    expect(d.getHours()).toBe(0);
  });
});

describe('addMonthsClamped', () => {
  it('walks one month forward within the same year', () => {
    expect(addMonthsClamped('2026-03-15', 1, '2025-01-01', '2026-12-31')).toBe('2026-04-15');
  });

  it('walks one month backward within the same year', () => {
    expect(addMonthsClamped('2026-03-15', -1, '2025-01-01', '2026-12-31')).toBe('2026-02-15');
  });

  it('handles JS month overflow — Jan 31 + 1 month → Feb 28 (non-leap)', () => {
    expect(addMonthsClamped('2025-01-31', 1, '2024-01-01', '2026-12-31')).toBe('2025-02-28');
  });

  it('handles JS month overflow — Jan 31 + 1 month → Feb 29 (leap year)', () => {
    expect(addMonthsClamped('2024-01-31', 1, '2023-01-01', '2026-12-31')).toBe('2024-02-29');
  });

  it('handles JS month overflow — Mar 31 - 1 month → Feb 28 (non-leap)', () => {
    expect(addMonthsClamped('2025-03-31', -1, '2024-01-01', '2026-12-31')).toBe('2025-02-28');
  });

  it('clamps to earliest when target falls below the window', () => {
    expect(addMonthsClamped('2026-03-15', -6, '2026-01-01', '2026-12-31')).toBe('2026-01-01');
  });

  it('clamps to latest when target rises above the window', () => {
    expect(addMonthsClamped('2026-10-15', 6, '2026-01-01', '2026-12-31')).toBe('2026-12-31');
  });

  it('crosses the year boundary going forward', () => {
    expect(addMonthsClamped('2025-12-15', 1, '2024-01-01', '2026-12-31')).toBe('2026-01-15');
  });

  it('crosses the year boundary going backward', () => {
    expect(addMonthsClamped('2026-01-15', -1, '2024-01-01', '2026-12-31')).toBe('2025-12-15');
  });
});

describe('computeDayEntries', () => {
  const alice: ChoreMember = { id: 'alice', name: 'Alice', emoji: '', color: '#fff' };
  const bob: ChoreMember = { id: 'bob', name: 'Bob', emoji: '', color: '#fff' };

  it('returns one entry per day in the inclusive range', () => {
    const entries = computeDayEntries('2026-04-05', '2026-04-09', [], [], new Set());
    expect(entries).toHaveLength(5);
    expect(entries[0].date).toBe('2026-04-05');
    expect(entries[4].date).toBe('2026-04-09');
  });

  it('counts each member with assigned chores once toward total', () => {
    const chore = makeChore({ id: 'c1', assigneeIds: ['alice', 'bob'], rotation: 'fixed' });
    const entries = computeDayEntries('2026-04-09', '2026-04-09', [alice, bob], [chore], new Set());
    expect(entries[0].total).toBe(2);
    expect(entries[0].earned).toBe(0);
  });

  it('marks earned only when ALL the member\'s assigned chores are completed', () => {
    const c1 = makeChore({ id: 'c1', assigneeIds: ['alice'] });
    const c2 = makeChore({ id: 'c2', assigneeIds: ['alice'] });
    const set = new Set<string>();
    set.add(completionKey('c1', 'alice', '2026-04-09'));
    // c2 not completed
    const entries = computeDayEntries('2026-04-09', '2026-04-09', [alice], [c1, c2], set);
    expect(entries[0].total).toBe(1);
    expect(entries[0].earned).toBe(0);
  });

  it('marks earned when every assigned chore is in the completion set', () => {
    const c1 = makeChore({ id: 'c1', assigneeIds: ['alice'] });
    const c2 = makeChore({ id: 'c2', assigneeIds: ['alice'] });
    const set = new Set<string>();
    set.add(completionKey('c1', 'alice', '2026-04-09'));
    set.add(completionKey('c2', 'alice', '2026-04-09'));
    const entries = computeDayEntries('2026-04-09', '2026-04-09', [alice], [c1, c2], set);
    expect(entries[0].total).toBe(1);
    expect(entries[0].earned).toBe(1);
  });

  it('skips members with no assigned chores (vacation days are not punished)', () => {
    // Bob has no chores at all; total should not include him.
    const chore = makeChore({ id: 'c1', assigneeIds: ['alice'] });
    const entries = computeDayEntries('2026-04-09', '2026-04-09', [alice, bob], [chore], new Set());
    expect(entries[0].total).toBe(1); // only alice counts
  });

  it('skips a day entirely when no member has any assigned chores', () => {
    // No members assigned at all on this day -> total=0, earned=0
    const chore = makeChore({ id: 'c1', assigneeIds: ['alice'], daysOfWeek: [0] }); // Sunday only
    // 2026-04-09 is a Thursday — chore doesn't apply
    const entries = computeDayEntries('2026-04-09', '2026-04-09', [alice], [chore], new Set());
    expect(entries[0].total).toBe(0);
    expect(entries[0].earned).toBe(0);
  });

  it('populates dayOfWeek and dayOfMonth from the cursor date', () => {
    // 2026-04-09 is a Thursday (dow=4)
    const entries = computeDayEntries('2026-04-09', '2026-04-09', [], [], new Set());
    expect(entries[0].dayOfWeek).toBe(4);
    expect(entries[0].dayOfMonth).toBe(9);
  });

  it('walks month boundaries correctly', () => {
    const entries = computeDayEntries('2026-03-30', '2026-04-02', [], [], new Set());
    expect(entries.map((e) => e.date)).toEqual([
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
    ]);
  });
});
