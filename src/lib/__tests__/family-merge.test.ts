import { describe, expect, it } from 'vitest';
import { planFamilyMerge, validateFamilyData } from '../family-merge';
import type { FamilyData } from '@/types/family';
const now = '2026-09-09T12:00:00.000Z';
const person = (id: string, name = id) => ({ id, name, color: '#60a5fa', emoji: '🙂' });
const family = (id: string, name = id) => ({ ...person(id, name), createdAt: now, updatedAt: now });
const calendar = (id: string, name = id, sourceIds = [id]) => ({ ...person(id, name), sourceIds });

describe('planFamilyMerge', () => {
  it('preserves every chore identity, including identical names and renamed current members', () => {
    const existingFamily = { members: [family('first', 'New name')] };
    const result = planFamilyMerge({ existingFamily, choreMembers: [person('first', 'Old name'), person('second', 'Alex'), person('third', 'Alex')], now });
    expect(result.family.members).toEqual([family('first', 'New name'), family('second', 'Alex'), family('third', 'Alex')]);
  });
  it('matches calendar names only when unique, unions sources per member and keeps order', () => {
    const result = planFamilyMerge({ choreMembers: [person('one', 'Alice Smith')], calendarPeople: [calendar('cal1', ' alice  SMITH ', ['a']), calendar('cal2', 'Alice Smith', ['a', 'b']), calendar('cal3', 'Pat')], now });
    expect(result.family.members.map((m) => m.id)).toEqual(['one', 'cal3']);
    expect(result.family.aliasIds).toEqual({ cal1: 'one', cal2: 'one' });
    expect(result.personSources).toEqual({ one: ['a', 'b'], cal3: ['cal3'] });
  });
  it('preserves ambiguous calendar identities', () => {
    const result = planFamilyMerge({ choreMembers: [person('a', 'Alex'), person('b', 'Alex')], calendarPeople: [calendar('c', 'Alex')], now });
    expect(result.family.members.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(result.report).toContainEqual({ kind: 'ambiguous-name', source: 'calendar', sourceId: 'c', memberId: 'c' });
  });
  it('resolves calendar aliases and ids before names while preserving old mappings', () => {
    const existingFamily: FamilyData = { members: [family('a', 'Renamed'), family('b')], aliasIds: { old: 'a' }, migrated: true };
    const result = planFamilyMerge({ existingFamily, calendarPeople: [calendar('old', 'b', ['shared', 'new']), calendar('b', 'Renamed', ['shared'])], personSources: { a: ['old-source', 'shared'], b: ['other'] }, now });
    expect(result.family).toEqual(existingFamily);
    expect(result.personSources).toEqual({ a: ['old-source', 'shared', 'new'], b: ['other', 'shared'] });
  });
  it('rejects conflicting ids and aliases without changing inputs', () => {
    expect(() => planFamilyMerge({ choreMembers: [person('x', 'A'), person('x', 'B')], now })).toThrow('Conflicting');
    expect(() => planFamilyMerge({ choreMembers: [person('x', 'A')], calendarPeople: [calendar('x', 'B')], now })).toThrow('different chore');
    expect(() => planFamilyMerge({ existingFamily: { members: [family('a')], aliasIds: { old: 'a' } }, choreMembers: [person('old')], now })).toThrow('alias');
    expect(validateFamilyData({ members: [family('a')], aliasIds: { a: 'a' } })).toBe(false);
    expect(validateFamilyData({ members: [family('a')], aliasIds: { b: 'c', c: 'a' } })).toBe(false);
  });
  it('repairs blank names and colors deterministically and preserves long names and large rosters', () => {
    const longName = 'A'.repeat(80);
    const choreMembers = [person('existing', 'Someone'), { id: 'blank', name: ' ', color: 'invalid' }, { id: 'blank2', name: '' }, person('long', longName), ...Array.from({ length: 70 }, (_, i) => person(String(i)))];
    const input = { choreMembers, now };
    const result = planFamilyMerge(input);
    expect(result).toEqual(planFamilyMerge(input));
    expect(result.family.members).toHaveLength(74);
    expect(result.family.members[1]).toMatchObject({ name: 'Someone 2', color: '#60a5fa' });
    expect(result.family.members[2].name).toBe('Someone 3');
    expect(result.family.members[3].name).toBe(longName);
    expect(validateFamilyData(result.family)).toBe(true);
  });
  it('folding the same legacy inputs again keeps identities, timestamps and aliases', () => {
    const inputs = { choreMembers: [person('c', 'Chris')], calendarPeople: [calendar('cal', 'Chris')] };
    const first = planFamilyMerge({ ...inputs, now });
    const second = planFamilyMerge({ ...inputs, existingFamily: first.family, personSources: first.personSources, now: '2027-01-01T00:00:00.000Z' });
    expect(second.family).toEqual(first.family);
    expect(second.personSources).toEqual(first.personSources);
  });
});
