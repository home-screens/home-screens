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
  cascadeDeleteMember,
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
