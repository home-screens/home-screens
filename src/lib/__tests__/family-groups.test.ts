import { describe, expect, it } from 'vitest';
import { groupDraftProblem, groupMembers, hasPeopleFilter, pruneGroupMembers, resolvePeopleFilterMembers } from '../family-groups';

const now = '2026-09-17T12:00:00.000Z';
const member = (id: string) => ({ id, name: id, color: '#60a5fa', createdAt: now, updatedAt: now });
const group = (id: string, memberIds: string[]) => ({ id, name: id, memberIds, createdAt: now, updatedAt: now });
const members = [member('ella'), member('noah'), member('mom')];

describe('family groups', () => {
  it('lists group members in family order and skips people no longer on the list', () => {
    expect(groupMembers(group('kids', ['noah', 'gone', 'ella']), members).map((m) => m.id)).toEqual(['ella', 'noah']);
  });
  it('prunes removed people and keeps the same object for untouched groups', () => {
    const kids = group('kids', ['ella', 'noah']);
    const parents = group('parents', ['mom']);
    const next = pruneGroupMembers([kids, parents], new Set(['noah']));
    expect(next[0]).toEqual({ ...kids, memberIds: ['ella'] });
    expect(next[1]).toBe(parents);
    expect(pruneGroupMembers(undefined, new Set(['x']))).toEqual([]);
  });
  it('refuses a blank name, an overlong name and unknown members', () => {
    expect(groupDraftProblem({ name: '  ', memberIds: [] }, members, [])).toBe('name');
    expect(groupDraftProblem({ name: 'x'.repeat(41), memberIds: [] }, members, [])).toBe('nameLength');
    expect(groupDraftProblem({ name: 'Kids', memberIds: ['ella', 'nobody'] }, members, [])).toBe('members');
    expect(groupDraftProblem({ name: 'Kids', memberIds: [] }, members, ['Parents'])).toBeNull();
    // Picked by name on the chore form, so two that read the same cannot be told apart.
    expect(groupDraftProblem({ name: ' kids ', memberIds: [] }, members, ['Parents', 'Kids'])).toBe('duplicate');
  });
  it('treats an empty people filter as no filter', () => {
    expect(hasPeopleFilter(undefined)).toBe(false);
    expect(hasPeopleFilter({ memberIds: [], groupIds: [], includeShared: true })).toBe(false);
    expect(hasPeopleFilter({ memberIds: [], groupIds: ['kids'], includeShared: true })).toBe(true);
  });
  it('expands groups to members and ignores a group that no longer exists', () => {
    const groups = [group('kids', ['ella', 'noah'])];
    const filter = { memberIds: ['mom'], groupIds: ['kids', 'gone'], includeShared: false };
    expect([...resolvePeopleFilterMembers(filter, groups)].sort()).toEqual(['ella', 'mom', 'noah']);
  });
});

describe('people selection', () => {
  const people = [{ id: 'ann', name: 'Ann', color: '#111111', sourceIds: ['ann-cal'] }, { id: 'ben', name: 'Ben', color: '#222222', sourceIds: ['ben-work'] }];
  const filter = { memberIds: ['ann'], groupIds: [], includeShared: true };
  it('narrows the roster a per-person view draws to the chosen people', async () => {
    const { peopleSelection, peopleForSelection } = await import('../calendar-people');
    const selection = peopleSelection(filter, people, [], undefined);
    expect(peopleForSelection(people, selection)?.map((p) => p.id)).toEqual(['ann']);
    expect(peopleForSelection(people, null)).toBe(people);
  });
  it('holds every event back while the roster is still loading or failed', async () => {
    const { peopleSelection, eventPassesPeople } = await import('../calendar-people');
    const shared = { sourceId: 'house' };
    for (const state of ['loading', 'failed'] as const) {
      const pending = peopleSelection(filter, undefined, [], state)!;
      expect(pending.pending).toBe(true);
      expect(eventPassesPeople(shared, pending)).toBe(false);
      expect(eventPassesPeople({ sourceId: 'ann-cal' }, pending)).toBe(false);
    }
    const settled = peopleSelection(filter, people, [], undefined)!;
    expect(settled.pending).toBe(false);
    expect(eventPassesPeople(shared, settled)).toBe(true);
    expect(eventPassesPeople({ sourceId: 'ben-work' }, settled)).toBe(false);
    // No owners anywhere and no roster state: every calendar really is shared.
    expect(peopleSelection(filter, undefined, [], undefined)!.pending).toBe(false);
  });
});
