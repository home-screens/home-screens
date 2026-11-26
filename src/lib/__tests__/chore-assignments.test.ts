import { describe, it, expect } from 'vitest';
import { choreAppliesToday, choreAssigneeIds, choreDoersFirst, choreGroupIdsOn, choresAssignedTo, resolveAssignee, resolveAssignmentsFor, type ChoreGroup } from '@/lib/chore-assignments';
import type { ChoreDefinition } from '@/types/config';
import type { FamilyMember } from '@/types/family';

const kids: ChoreGroup = { id: 'kids', memberIds: ['ann', 'ben', 'cal'] };
const teens: ChoreGroup = { id: 'teens', memberIds: ['cal', 'dee'] };

function groupChore(overrides: Partial<ChoreDefinition> = {}): ChoreDefinition {
  return {
    id: 'dishes', name: 'Dishes', emoji: '', points: 1, frequency: 'daily', daysOfWeek: [],
    timeOfDay: 'anytime', assigneeIds: [], assigneeGroupIds: ['kids'], rotation: 'fixed',
    ...overrides,
  };
}

describe('choreAssigneeIds', () => {
  it('expands a group to its members', () => {
    expect(choreAssigneeIds(groupChore(), [kids])).toEqual(['ann', 'ben', 'cal']);
  });

  it('lists someone once when they are named directly and through a group', () => {
    expect(choreAssigneeIds(groupChore({ assigneeIds: ['ben'] }), [kids])).toEqual(['ben', 'ann', 'cal']);
  });

  it('lists someone once when two groups hold them', () => {
    expect(choreAssigneeIds(groupChore({ assigneeGroupIds: ['kids', 'teens'] }), [kids, teens])).toEqual(['ann', 'ben', 'cal', 'dee']);
  });

  it('gives a group that no longer exists nobody', () => {
    expect(choreAssigneeIds(groupChore({ assigneeIds: ['dee'], assigneeGroupIds: ['gone'] }), [kids])).toEqual(['dee']);
    expect(choreAssigneeIds(groupChore({ assigneeGroupIds: ['gone'] }), [kids])).toEqual([]);
  });

  it('keeps the saved order of people named directly, so existing rotations do not shift', () => {
    const chore = groupChore({ assigneeIds: ['cal', 'ann'], assigneeGroupIds: undefined });
    expect(choreAssigneeIds(chore, [kids])).toEqual(['cal', 'ann']);
  });
});

describe('resolveAssignee with a group', () => {
  it('gives a fixed chore to everyone in the group', () => {
    expect(resolveAssignee(groupChore(), '2024-01-01', [kids])).toEqual(['ann', 'ben', 'cal']);
  });

  it('takes daily turns through the group in its order', () => {
    const chore = groupChore({ rotation: 'rotate-daily' });
    expect(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'].map((date) => resolveAssignee(chore, date, [kids])))
      .toEqual([['ann'], ['ben'], ['cal'], ['ann']]);
  });

  it('takes weekly turns through the group in its order', () => {
    const chore = groupChore({ rotation: 'rotate-weekly' });
    expect(['2024-01-01', '2024-01-08', '2024-01-15'].map((date) => resolveAssignee(chore, date, [kids])))
      .toEqual([['ann'], ['ben'], ['cal']]);
  });

  it('rotates a group-only chore rather than treating its empty direct list as nobody', () => {
    expect(resolveAssignee(groupChore({ rotation: 'rotate-daily' }), '2024-01-02', [kids])).not.toEqual([]);
  });

  it('follows the group when someone joins it', () => {
    const grown: ChoreGroup = { ...kids, memberIds: [...kids.memberIds, 'eve'] };
    expect(choresAssignedTo([groupChore()], 'eve', '2024-01-01', [kids])).toEqual([]);
    expect(choresAssignedTo([groupChore()], 'eve', '2024-01-01', [grown])).toHaveLength(1);
  });

  it('gives each member of the group their own row and their own tick', () => {
    const member = (id: string): FamilyMember => ({ id, name: id, color: '#000000', createdAt: '', updatedAt: '' });
    const rows = resolveAssignmentsFor([groupChore()], ['ann', 'ben', 'cal'].map(member), '2024-01-01', new Set(['dishes-ben-2024-01-01']), [kids]);
    expect(rows.map((row) => [row.memberId, row.isCompleted])).toEqual([['ann', false], ['ben', true], ['cal', false]]);
  });
});

// 2024-01-01 is a Monday, so the 2nd is a Tuesday and the 3rd a Wednesday.
describe('a schedule with a group row', () => {
  const scheduled = groupChore({
    rotation: 'schedule', assigneeIds: ['dee'], daysOfWeek: [1, 2],
    schedule: { dee: [2] }, groupSchedule: { kids: [1] },
  });

  it('gives the chore to everyone in the group on the group row days only', () => {
    expect(resolveAssignee(scheduled, '2024-01-01', [kids])).toEqual(['ann', 'ben', 'cal']);
    expect(resolveAssignee(scheduled, '2024-01-02', [kids])).toEqual(['dee']);
    expect(resolveAssignee(scheduled, '2024-01-03', [kids])).toEqual([]);
  });

  it('follows the group when someone joins it', () => {
    const grown: ChoreGroup = { ...kids, memberIds: [...kids.memberIds, 'eve'] };
    expect(choresAssignedTo([scheduled], 'eve', '2024-01-01', [kids])).toEqual([]);
    expect(choresAssignedTo([scheduled], 'eve', '2024-01-01', [grown])).toHaveLength(1);
    expect(choresAssignedTo([scheduled], 'eve', '2024-01-02', [grown])).toEqual([]);
  });

  it('counts someone once when their own row and their group share a day', () => {
    const both = groupChore({ rotation: 'schedule', assigneeIds: ['cal'], schedule: { cal: [1] }, groupSchedule: { kids: [1] } });
    expect(resolveAssignee(both, '2024-01-01', [kids])).toEqual(['cal', 'ann', 'ben']);
  });

  it('gives a removed group row to nobody', () => {
    expect(resolveAssignee(scheduled, '2024-01-01', [])).toEqual([]);
  });

  it('says which groups the chore goes to on the day, which is what the wall pill reads', () => {
    expect(choreGroupIdsOn(scheduled, '2024-01-01')).toEqual(['kids']);
    expect(choreGroupIdsOn(scheduled, '2024-01-02')).toEqual([]);
    expect(choreGroupIdsOn(groupChore(), '2024-01-02')).toEqual(['kids']);
    const member = (id: string): FamilyMember => ({ id, name: id, color: '#000000', createdAt: '', updatedAt: '' });
    const rows = resolveAssignmentsFor([scheduled], ['ann', 'dee'].map(member), '2024-01-02', new Set(), [kids]);
    expect(rows.map((row) => [row.memberId, row.groupIds])).toEqual([['dee', []]]);
  });
});

// 2024-01-01, the epoch the week count starts from, is a Monday.
describe('week boundaries', () => {
  const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];
  const pair: ChoreDefinition = {
    id: 'bins', name: 'Bins', emoji: '', points: 1, frequency: 'weekly', daysOfWeek: [],
    timeOfDay: 'anytime', assigneeIds: ['ann', 'ben'], rotation: 'rotate-weekly',
  };

  it('keeps a weekly turn with one person from Monday through Sunday', () => {
    const turns = week.map((date) => resolveAssignee(pair, date, [])[0]);
    expect(new Set(turns).size).toBe(1);
  });

  it('hands over on Monday', () => {
    expect(resolveAssignee(pair, '2026-09-20', [])).not.toEqual(resolveAssignee(pair, '2026-09-21', []));
  });

  it('keeps an every-other-week chore on or off for the whole week', () => {
    const on = week.map((date) => choreAppliesToday({ ...pair, frequency: 'biweekly' }, new Date(`${date}T00:00:00`).getDay(), date));
    expect(new Set(on).size).toBe(1);
    const next = choreAppliesToday({ ...pair, frequency: 'biweekly' }, 1, '2026-09-21');
    expect(next).toBe(!on[0]);
  });
});

describe('choreDoersFirst', () => {
  const people = ['dana', 'alex', 'noah', 'mia'].map((id) => ({ id }));

  it('puts everyone with a chore, by name or through a group, ahead of the rest', () => {
    const groups: ChoreGroup[] = [{ id: 'kids', name: 'Kids', memberIds: ['mia'] } as ChoreGroup];
    const chores = [
      { assigneeIds: ['noah'], assigneeGroupIds: [] },
      { assigneeIds: [], assigneeGroupIds: ['kids'] },
    ];
    expect(choreDoersFirst(people, chores, groups).map((m) => m.id)).toEqual(['noah', 'mia', 'dana', 'alex']);
  });

  it('keeps family order when nobody has a chore', () => {
    expect(choreDoersFirst(people, [], [])).toEqual(people);
  });
});
