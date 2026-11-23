import { describe, it, expect } from 'vitest';
import { buildChoreRows, mergeChoreRows } from '@/lib/chore-rows';
import type { ResolvedAssignment } from '@/lib/chore-assignments';
import type { ChoreDefinition } from '@/types/config';

function makeChore(overrides: Partial<ChoreDefinition> & { id: string; name: string }): ChoreDefinition {
  return {
    emoji: '',
    frequency: 'daily',
    daysOfWeek: [],
    timeOfDay: 'morning',
    assigneeIds: [],
    rotation: 'fixed',
    points: 1,
    ...overrides,
  };
}

function makeAssignment(
  chore: ChoreDefinition,
  memberId: string,
  isCompleted = false,
): ResolvedAssignment {
  return { chore, memberId, isCompleted, isSkipped: false, groupIds: chore.assigneeGroupIds ?? [] };
}

describe('buildChoreRows', () => {
  it('deduplicates a chore assigned to multiple members into one row', () => {
    const chore = makeChore({ id: 'dishes', name: 'Dishes', timeOfDay: 'evening' });
    const assignments: ResolvedAssignment[] = [
      makeAssignment(chore, 'alice', false),
      makeAssignment(chore, 'bob', true),
    ];

    const result = buildChoreRows(assignments);
    const eveningRows = result.get('evening')!;
    expect(eveningRows).toHaveLength(1);
    expect(eveningRows[0].choreId).toBe('dishes');
    expect(eveningRows[0].assignees).toHaveLength(2);
  });

  it('groups chores by time of day', () => {
    const morning = makeChore({ id: 'beds', name: 'Make Beds', timeOfDay: 'morning' });
    const evening = makeChore({ id: 'teeth', name: 'Brush Teeth', timeOfDay: 'evening' });
    const assignments: ResolvedAssignment[] = [
      makeAssignment(morning, 'alice'),
      makeAssignment(evening, 'bob'),
    ];

    const result = buildChoreRows(assignments);
    expect(result.get('morning')).toHaveLength(1);
    expect(result.get('evening')).toHaveLength(1);
    expect(result.has('afternoon')).toBe(false);
  });

  it('keeps assignees in household order whatever their state', () => {
    const chore = makeChore({ id: 'clean', name: 'Clean', timeOfDay: 'anytime' });
    const assignments: ResolvedAssignment[] = [
      makeAssignment(chore, 'charlie', false),
      makeAssignment(chore, 'bob', true),
      makeAssignment(chore, 'alice', false),
    ];
    const order = new Map([['alice', 0], ['bob', 1], ['charlie', 2]]);

    const row = buildChoreRows(assignments, order).get('anytime')![0];
    // A kid's ring stays in the same column when someone else finishes.
    expect(row.assignees.map((a) => a.memberId)).toEqual(['alice', 'bob', 'charlie']);
    expect(row.assignees[1].isCompleted).toBe(true);
  });

  it('preserves chore metadata (emoji, points)', () => {
    const chore = makeChore({ id: 'feed', name: 'Feed Cat', emoji: '🐱', points: 5, timeOfDay: 'morning' });
    const result = buildChoreRows([makeAssignment(chore, 'alice')]);
    const row = result.get('morning')![0];
    expect(row.choreEmoji).toBe('🐱');
    expect(row.points).toBe(5);
    expect(row.choreName).toBe('Feed Cat');
  });

  it('handles empty assignments', () => {
    const result = buildChoreRows([]);
    expect(result.size).toBe(0);
  });

  it('keeps distinct chores in same time slot as separate rows', () => {
    const dishes = makeChore({ id: 'dishes', name: 'Dishes', timeOfDay: 'evening' });
    const trash = makeChore({ id: 'trash', name: 'Trash', timeOfDay: 'evening' });
    const assignments: ResolvedAssignment[] = [
      makeAssignment(dishes, 'alice'),
      makeAssignment(trash, 'bob'),
    ];

    const result = buildChoreRows(assignments);
    expect(result.get('evening')).toHaveLength(2);
  });
});

describe('buildChoreRows with a family group', () => {
  const stamp = '2026-01-01T00:00:00.000Z';
  const kids = { id: 'kids', name: 'Kids', memberIds: ['ann', 'ben'], createdAt: stamp, updatedAt: stamp };
  const order = new Map([['mom', 0], ['ann', 1], ['ben', 2]]);

  it('labels the row and puts the group first, in household order, with anyone extra after it', () => {
    const chore = makeChore({ id: 'teeth', name: 'Brush teeth', timeOfDay: 'evening', assigneeIds: ['mom'], assigneeGroupIds: ['kids'] });
    const rows = buildChoreRows(['mom', 'ben', 'ann'].map((id) => makeAssignment(chore, id, false)), order, [kids]);
    const row = rows.get('evening')![0];
    expect(row.groupLabel).toBe('Kids');
    expect(row.assignees.map((a) => [a.memberId, !!a.viaGroup])).toEqual([['ann', true], ['ben', true], ['mom', false]]);
  });

  it('leaves a row alone when the chore names people only, or its group is gone', () => {
    const plain = makeChore({ id: 'plain', name: 'Beds', timeOfDay: 'evening', assigneeIds: ['ann', 'mom'] });
    const orphan = makeChore({ id: 'orphan', name: 'Bins', timeOfDay: 'evening', assigneeIds: ['ann'], assigneeGroupIds: ['gone'] });
    const rows = buildChoreRows([makeAssignment(plain, 'ann', false), makeAssignment(plain, 'mom', false), makeAssignment(orphan, 'ann', false)], order, [kids]).get('evening')!;
    expect(rows.map((row) => row.groupLabel)).toEqual([undefined, undefined]);
    expect(rows[0].assignees.map((a) => a.memberId)).toEqual(['mom', 'ann']);
  });

  it('on a schedule, draws the pill only on the days the group has the chore', () => {
    const chore = makeChore({ id: 'dishes', name: 'Dishes', timeOfDay: 'evening', assigneeIds: ['ann'], assigneeGroupIds: ['kids'], rotation: 'schedule', schedule: { ann: [2] }, groupSchedule: { kids: [1] } });
    const ownDay = buildChoreRows([{ ...makeAssignment(chore, 'ann'), groupIds: [] }], order, [kids]).get('evening')![0];
    expect([ownDay.groupLabel, ownDay.assignees[0].viaGroup]).toEqual([undefined, false]);
    const groupDay = buildChoreRows(['ann', 'ben'].map((id) => makeAssignment(chore, id)), order, [kids]).get('evening')![0];
    expect(groupDay.groupLabel).toBe('Kids');
  });

  it('names the first group and counts the rest, so two groups do not make a pill twice as wide', () => {
    const adults = { id: 'adults', name: 'Grown-ups', memberIds: ['mom'], createdAt: stamp, updatedAt: stamp };
    const chore = makeChore({ id: 'tidy', name: 'Tidy up', timeOfDay: 'evening', assigneeIds: [], assigneeGroupIds: ['kids', 'adults'] });
    const row = buildChoreRows(['mom', 'ann'].map((id) => makeAssignment(chore, id, false)), order, [kids, adults]).get('evening')![0];
    expect([row.groupLabel, row.groupExtra]).toEqual(['Kids', 1]);
    expect(row.assignees.every((a) => a.viaGroup)).toBe(true);
  });

});

describe('mergeChoreRows', () => {
  it('lists every band as one run, morning first, whatever order the chores were saved in', () => {
    const chores = [
      makeChore({ id: 'tidy', name: 'Tidy', timeOfDay: 'anytime' }),
      makeChore({ id: 'dog', name: 'Dog', timeOfDay: 'evening' }),
      makeChore({ id: 'bed', name: 'Bed', timeOfDay: 'morning' }),
      makeChore({ id: 'teeth', name: 'Teeth', timeOfDay: 'morning' }),
      makeChore({ id: 'homework', name: 'Homework', timeOfDay: 'afternoon' }),
    ];
    const rows = mergeChoreRows(buildChoreRows(chores.map((c) => makeAssignment(c, 'ann'))));
    expect(rows.map((row) => row.choreId)).toEqual(['bed', 'teeth', 'homework', 'dog', 'tidy']);
  });

  it('is empty for a day with no chores', () => {
    expect(mergeChoreRows(new Map())).toEqual([]);
  });
});
