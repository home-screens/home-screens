import { describe, it, expect } from 'vitest';
import {
  getOrientation,
  getUniqueInitials,
  getCurrentTimeOfDay,
  buildChoreRows,
  fitRowHeight,
  TOD_ORDER,
} from '../helpers';
import type { ResolvedAssignment } from '@/components/modules/chore-chart/types';
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
  return { chore, memberId, isCompleted };
}

describe('getOrientation', () => {
  it('returns portrait when height > width', () => {
    expect(getOrientation(1080, 1920)).toBe('portrait');
  });

  it('returns landscape when width >= height', () => {
    expect(getOrientation(1920, 1080)).toBe('landscape');
  });

  it('returns landscape when width equals height', () => {
    expect(getOrientation(1080, 1080)).toBe('landscape');
  });
});

describe('getUniqueInitials', () => {
  it('uses single characters when all first letters are unique', () => {
    const members = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
    ];
    const result = getUniqueInitials(members);
    expect(result.get('1')).toBe('A');
    expect(result.get('2')).toBe('B');
    expect(result.get('3')).toBe('C');
  });

  it('extends to 2 characters to resolve collisions', () => {
    const members = [
      { id: '1', name: 'Sam' },
      { id: '2', name: 'Sarah' },
      { id: '3', name: 'Bob' },
    ];
    const result = getUniqueInitials(members);
    // B is unique → single char
    expect(result.get('3')).toBe('B');
    // Sam vs Sarah → 'Sa' vs 'Sa' → still collide → extend to 3: 'Sam' vs 'Sar'
    expect(result.get('1')).toBe('Sam');
    expect(result.get('2')).toBe('Sar');
  });

  it('handles single member', () => {
    const result = getUniqueInitials([{ id: '1', name: 'Zoe' }]);
    expect(result.get('1')).toBe('Z');
  });

  it('handles empty list', () => {
    const result = getUniqueInitials([]);
    expect(result.size).toBe(0);
  });

  it('extends to 2 chars only where needed', () => {
    const members = [
      { id: '1', name: 'Dan' },
      { id: '2', name: 'Dave' },
      { id: '3', name: 'Emily' },
    ];
    const result = getUniqueInitials(members);
    expect(result.get('3')).toBe('E'); // unique at 1
    // Dan vs Dave: 'Da' vs 'Da' → collide at 2, resolved at 3
    expect(result.get('1')).toBe('Dan');
    expect(result.get('2')).toBe('Dav');
  });

  it('caps at 3 characters for unresolvable collisions', () => {
    const members = [
      { id: '1', name: 'AAAAAA' },
      { id: '2', name: 'AAAAAB' },
    ];
    const result = getUniqueInitials(members);
    // Both are "AAA" at 3 chars — the remaining get truncated to 3
    expect(result.get('1')).toBe('AAA');
    expect(result.get('2')).toBe('AAA');
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

  it('returns null for hour >= 24', () => {
    expect(getCurrentTimeOfDay(24)).toBeNull();
  });
});

describe('TOD_ORDER', () => {
  it('defines the correct ordering', () => {
    expect(TOD_ORDER).toEqual(['morning', 'afternoon', 'evening', 'anytime']);
  });
});

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

  it('sorts assignees within a row (completed first)', () => {
    const chore = makeChore({ id: 'clean', name: 'Clean', timeOfDay: 'anytime' });
    const assignments: ResolvedAssignment[] = [
      makeAssignment(chore, 'alice', false),
      makeAssignment(chore, 'bob', true),
      makeAssignment(chore, 'charlie', false),
    ];

    const result = buildChoreRows(assignments);
    const row = result.get('anytime')![0];
    // Completed (bob) should be sorted first
    expect(row.assignees[0].memberId).toBe('bob');
    expect(row.assignees[0].isCompleted).toBe(true);
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

describe('fitRowHeight', () => {
  it('shares the list height equally between rows and header bands', () => {
    // 9 chores + 3 headers on a 1400px list: 1400 / (9 + 3 × 0.55) ≈ 131px,
    // under the extra-large cap of 120 × 1.35 = 162px.
    const r = fitRowHeight({ listHeight: 1400, chores: 9, headers: 3, k: 1, typoMul: 1.35 });
    expect(r).toBeCloseTo(1400 / 10.65, 3);
  });

  it('caps a light day at typographySize and floors a heavy one', () => {
    expect(fitRowHeight({ listHeight: 1400, chores: 2, headers: 1, k: 1, typoMul: 1.35 })).toBe(162);
    expect(fitRowHeight({ listHeight: 1400, chores: 40, headers: 4, k: 1, typoMul: 1.35 })).toBe(56);
  });

  it('scales floor and cap with the canvas but only the cap with typographySize', () => {
    expect(fitRowHeight({ listHeight: 10_000, chores: 1, headers: 0, k: 0.5, typoMul: 2 })).toBe(120);
    expect(fitRowHeight({ listHeight: 10, chores: 40, headers: 0, k: 0.5, typoMul: 2 })).toBe(28);
  });

  it('returns the cap before the list has been measured', () => {
    expect(fitRowHeight({ listHeight: 0, chores: 9, headers: 3, k: 1, typoMul: 1 })).toBe(120);
  });
});
