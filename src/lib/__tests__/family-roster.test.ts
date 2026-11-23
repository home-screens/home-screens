import { describe, expect, it } from 'vitest';
import type { ChoreDefinition } from '@/types/config';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import {
  groupChoreCount,
  groupsAfterSave,
  memberChoreCounts,
  memberNameLimit,
  memberToSave,
  membersAfterMove,
  membersAfterSave,
} from '../family-roster';

const AT = '2026-11-01T12:00:00.000Z';
const person = (id: string, name = id): FamilyMember => ({ id, name, color: '#60a5fa', createdAt: AT, updatedAt: AT });
const group = (id: string, memberIds: string[], name = id): FamilyGroup => ({ id, name, memberIds, createdAt: AT, updatedAt: AT });
const chore = (id: string, extra: Partial<ChoreDefinition>): ChoreDefinition => ({
  id, name: id, emoji: '', points: 1, frequency: 'daily', daysOfWeek: [], timeOfDay: 'anytime', rotation: 'fixed', assigneeIds: [], ...extra,
});

describe('family roster rules', () => {
  it('counts each chore once per person, through groups and schedules, and never a bonus chore', () => {
    const members = [person('alex'), person('sam')];
    const groups = [group('kids', ['alex', 'sam'])];
    const counts = memberChoreCounts(members, groups, [
      chore('dishes', { assigneeIds: ['alex'], schedule: { alex: [1] } }),
      chore('laundry', { assigneeGroupIds: ['kids'] }),
      chore('bonus', { assigneeIds: ['sam'], bonus: { claim: 'first', comesBack: 'daily' } }),
    ]);
    expect(counts.get('alex')).toBe(2);
    expect(counts.get('sam')).toBe(1);
  });

  it('counts the chores given to a group as a group', () => {
    expect(groupChoreCount({ id: 'kids' }, [chore('a', { assigneeGroupIds: ['kids'] }), chore('b', {})])).toBe(1);
    expect(groupChoreCount({ id: 'kids' }, undefined)).toBe(0);
  });

  it('keeps an untouched older name exactly, trims a changed one, and drops a blank emoji', () => {
    const before = [person('legacy', '  Old long name  ')];
    expect(memberToSave({ ...before[0], color: '#fbbf24' }, before).name).toBe('  Old long name  ');
    expect(memberToSave({ ...before[0], name: '  New  ' }, before).name).toBe('New');
    expect(memberToSave({ ...person('n'), emoji: '  ' }, []).emoji).toBeUndefined();
  });

  it('puts a new person on the end and an edited one in place', () => {
    const before = [person('a'), person('b')];
    expect(membersAfterSave(before, person('c'), true).map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(membersAfterSave(before, person('a', 'Alex'), false).map((m) => m.name)).toEqual(['Alex', 'b']);
  });

  it('moves a person one place, and not past either end', () => {
    const before = [person('a'), person('b'), person('c')];
    expect(membersAfterMove(before, 1, -1).map((m) => m.id)).toEqual(['b', 'a', 'c']);
    expect(membersAfterMove(before, 0, -1).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('saves a group with its name trimmed', () => {
    expect(groupsAfterSave([], group('g', [], '  Kids '), true)[0].name).toBe('Kids');
  });

  it('lets an older, longer name keep its length', () => {
    expect(memberNameLimit(10, { id: 'x' }, [person('x', 'A very long older name')])).toBe(22);
    expect(memberNameLimit(10, { id: 'new' }, [])).toBe(10);
  });
});
