// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import type { ChoreDefinition } from '@/types/config';
import { useChoreForm } from '../form-hooks';

const stamp = '2026-01-01T00:00:00.000Z';
const members: FamilyMember[] = ['ann', 'ben', 'cal'].map((id) => ({ id, name: id, emoji: '', color: '#000000', createdAt: stamp, updatedAt: stamp }));
const kids: FamilyGroup = { id: 'kids', name: 'Kids', memberIds: ['ann', 'ben', 'cal'], createdAt: stamp, updatedAt: stamp };
const solo: FamilyGroup = { id: 'solo', name: 'Just Ann', memberIds: ['ann'], createdAt: stamp, updatedAt: stamp };
/** The household's day, as the phone and the editor hand it in. */
const TODAY = '2026-09-28';

function saved(overrides: Partial<ChoreDefinition>): ChoreDefinition {
  return {
    id: 'c1', name: 'Dishes', emoji: '', points: 1, frequency: 'daily', daysOfWeek: [1, 2],
    timeOfDay: 'anytime', assigneeIds: [], rotation: 'fixed', ...overrides,
  };
}

/** What the form would save right now. */
function submitted(form: ReturnType<typeof useChoreForm>): Omit<ChoreDefinition, 'id'> {
  const onSubmit = vi.fn();
  form.submit(onSubmit);
  expect(onSubmit).toHaveBeenCalledTimes(1);
  return onSubmit.mock.calls[0][0];
}

describe('useChoreForm day picking', () => {
  // 10:30 pm Sunday on a UTC browser, 5:30 pm Sunday in Chicago, and already
  // Monday for a Berlin household. A one-time chore made now is for Monday.
  it('dates a new one-time chore on the household day it is handed, not the browser\'s', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-27T22:30:00Z'));
    try {
      const { result } = renderHook(() => useChoreForm(undefined, members, [], true, TODAY));
      act(() => result.current.setFrequency('once'));
      act(() => result.current.setName('Clean out the car'));
      act(() => result.current.toggleAssignee('ann'));
      expect(result.current.specificDate).toBe(TODAY);
      expect(submitted(result.current)).toMatchObject({ frequency: 'once', specificDate: TODAY });
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts a new chore on every day, because a new chore is daily', () => {
    const { result } = renderHook(() => useChoreForm(undefined, members, [], true, TODAY));
    expect(result.current.frequency).toBe('daily');
    expect(result.current.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  // The whole point of item: tapping T and F on a fresh weekly chore used to
  // save every OTHER day, because all seven arrived already on.
  it('empties the days row when a new chore turns weekly, so the days tapped are the days saved', () => {
    const { result } = renderHook(() => useChoreForm(undefined, members, [], true, TODAY));
    act(() => result.current.setName('Vacuum'));
    act(() => result.current.setFrequency('weekly'));
    expect(result.current.daysOfWeek).toEqual([]);

    act(() => result.current.toggleDay(2));
    act(() => result.current.toggleDay(5));
    act(() => result.current.toggleAssignee('ann'));
    expect(submitted(result.current).daysOfWeek).toEqual([2, 5]);
  });

  it('empties the days row for every other week too', () => {
    const { result } = renderHook(() => useChoreForm(undefined, members, [], true, TODAY));
    act(() => result.current.setFrequency('biweekly'));
    expect(result.current.daysOfWeek).toEqual([]);
  });

  it('keeps the days someone picked when they change their mind about the frequency', () => {
    const { result } = renderHook(() => useChoreForm(undefined, members, [], true, TODAY));
    act(() => result.current.setFrequency('weekly'));
    act(() => result.current.toggleDay(3));
    act(() => result.current.setFrequency('biweekly'));
    expect(result.current.daysOfWeek).toEqual([3]);
    act(() => result.current.setFrequency('daily'));
    expect(result.current.daysOfWeek).toEqual([3]);
  });

  it('never wipes the days of a chore being edited', () => {
    const { result } = renderHook(() => useChoreForm(saved({ frequency: 'weekly', daysOfWeek: [1, 2], assigneeIds: ['ann'] }), members, [], true, TODAY));
    act(() => result.current.setFrequency('biweekly'));
    expect(result.current.daysOfWeek).toEqual([1, 2]);
    expect(submitted(result.current).daysOfWeek).toEqual([1, 2]);
  });

  it('refuses to save a recurring chore with no days, and says which row needs a tap', () => {
    const { result } = renderHook(() => useChoreForm(undefined, members, [], true, TODAY));
    act(() => result.current.setName('Vacuum'));
    act(() => result.current.toggleAssignee('ann'));
    act(() => result.current.setFrequency('weekly'));
    expect(result.current.validationHintKind).toBe('selectAtLeastOneDay');
    expect(result.current.canSave).toBe(false);
    const onSubmit = vi.fn();
    result.current.submit(onSubmit);
    expect(onSubmit).not.toHaveBeenCalled();

    act(() => result.current.toggleDay(4));
    expect(result.current.canSave).toBe(true);
  });

  it('still saves a one-time chore, which picks a date instead of days', () => {
    const { result } = renderHook(() => useChoreForm(undefined, members, [], true, TODAY));
    act(() => result.current.setName('Rake leaves'));
    act(() => result.current.toggleAssignee('ann'));
    act(() => result.current.setFrequency('once'));
    act(() => result.current.setSpecificDate('2026-10-31'));
    expect(result.current.canSave).toBe(true);
    expect(submitted(result.current)).toMatchObject({ frequency: 'once', specificDate: '2026-10-31' });
  });

  it('seeds a schedule from the days that are actually on', () => {
    const { result } = renderHook(() => useChoreForm(undefined, members, [], true, TODAY));
    act(() => result.current.setFrequency('weekly'));
    act(() => result.current.toggleDay(1));
    act(() => result.current.toggleAssignee('ann'));
    act(() => result.current.toggleAssignee('ben'));
    act(() => result.current.switchToSchedule());
    expect(result.current.schedule).toEqual({ ann: [1], ben: [1] });
  });

  it('treats days brought back from a schedule as picked, so a frequency change leaves them alone', () => {
    const chore = saved({ frequency: 'weekly', rotation: 'schedule', assigneeIds: ['ann'], schedule: { ann: [1, 3] } });
    const { result } = renderHook(() => useChoreForm(chore, members, [], true, TODAY));
    act(() => result.current.switchFromSchedule('fixed'));
    act(() => result.current.setFrequency('biweekly'));
    expect(result.current.daysOfWeek).toEqual([1, 3]);
  });
});

describe('useChoreForm with family groups', () => {
  it('offers rotation for a group', () => {
    const { result } = renderHook(() => useChoreForm(saved({}), members, [kids], true, TODAY));
    expect(result.current.canRotate).toBe(false);
    act(() => result.current.toggleGroup('kids'));
    expect(result.current.assigneeGroupIds).toEqual(['kids']);
    expect(result.current.canRotate).toBe(true);
  });

  it('opens a schedule with a row for the picked group and the picked people, on the chore days', () => {
    const { result } = renderHook(() => useChoreForm(saved({ assigneeIds: ['cal'], assigneeGroupIds: ['kids'] }), members, [kids, solo], true, TODAY));
    act(() => result.current.switchToSchedule());
    expect(result.current.rotation).toBe('schedule');
    expect(result.current.groupSchedule).toEqual({ kids: [1, 2] });
    expect(result.current.schedule).toEqual({ cal: [1, 2] });
    expect(result.current.scheduleGroups).toEqual([kids]);
    expect(result.current.unscheduledGroups).toEqual([solo]);
  });

  it('saves a group row as the group with its days, and the days it adds to the week', () => {
    const chore = saved({ rotation: 'schedule', assigneeIds: ['ann'], schedule: { ann: [1] } });
    const { result } = renderHook(() => useChoreForm(chore, members, [kids], true, TODAY));
    act(() => result.current.addGroupToSchedule('kids'));
    act(() => result.current.toggleGroupScheduleDay('kids', 5));
    act(() => result.current.toggleGroupScheduleDay('kids', 3));
    expect(result.current.scheduleDays).toEqual([1, 3, 5]);
    expect(submitted(result.current)).toMatchObject({
      rotation: 'schedule', assigneeIds: ['ann'], assigneeGroupIds: ['kids'],
      schedule: { ann: [1] }, groupSchedule: { kids: [5, 3] }, daysOfWeek: [1, 3, 5],
    });
  });

  it('keeps a row whose last day was unticked, saves nothing for it, and takes it off only when asked', () => {
    const chore = saved({ rotation: 'schedule', assigneeIds: ['ann'], assigneeGroupIds: ['kids'], schedule: { ann: [1] }, groupSchedule: { kids: [2] } });
    const { result } = renderHook(() => useChoreForm(chore, members, [kids], true, TODAY));
    act(() => result.current.toggleGroupScheduleDay('kids', 2));
    act(() => result.current.toggleScheduleDay('ann', 1));
    expect(result.current.scheduleGroups).toEqual([kids]);
    expect(result.current.scheduleMembers).toEqual(['ann']);
    expect(result.current.validationHintKind).toBe('addPersonOrGroupToSchedule');

    act(() => result.current.removeGroupFromSchedule('kids'));
    act(() => result.current.removeMemberFromSchedule('ann'));
    expect(result.current.scheduleGroups).toEqual([]);
    expect(result.current.scheduleMembers).toEqual([]);
    expect(result.current.unscheduledGroups).toEqual([kids]);

    act(() => result.current.addMemberToSchedule('ben'));
    act(() => result.current.toggleScheduleDay('ben', 4));
    const out = submitted(result.current);
    expect(out).toMatchObject({ assigneeIds: ['ben'], schedule: { ben: [4] }, daysOfWeek: [4] });
    expect(out).not.toHaveProperty('groupSchedule');
  });

  it('leaving a schedule keeps its groups and people picked, on the days the rows covered', () => {
    const chore = saved({ rotation: 'schedule', assigneeIds: ['ann'], assigneeGroupIds: ['kids'], schedule: { ann: [1] }, groupSchedule: { kids: [3] } });
    const { result } = renderHook(() => useChoreForm(chore, members, [kids], true, TODAY));
    act(() => result.current.switchFromSchedule('rotate-weekly'));
    expect(result.current.daysOfWeek).toEqual([1, 3]);
    const out = submitted(result.current);
    expect(out).toMatchObject({ assigneeIds: ['ann'], assigneeGroupIds: ['kids'], rotation: 'rotate-weekly' });
    expect(out).not.toHaveProperty('schedule');
    expect(out).not.toHaveProperty('groupSchedule');
  });

  it('warns when the only row is a group nobody is in', () => {
    const empty: FamilyGroup = { ...solo, id: 'empty', memberIds: [] };
    const chore = saved({ rotation: 'schedule', assigneeGroupIds: ['empty'], groupSchedule: { empty: [1] } });
    const { result } = renderHook(() => useChoreForm(chore, members, [empty], true, TODAY));
    expect(result.current.goesToNobody).toBe(true);
    expect(result.current.canSave).toBe(true);
    act(() => result.current.addMemberToSchedule('ann'));
    act(() => result.current.toggleScheduleDay('ann', 4));
    expect(result.current.goesToNobody).toBe(false);
  });

  it('drops the row of a group that no longer exists', () => {
    const chore = saved({ rotation: 'schedule', assigneeIds: ['ann'], assigneeGroupIds: ['gone'], schedule: { ann: [1] }, groupSchedule: { gone: [2] } });
    const { result } = renderHook(() => useChoreForm(chore, members, [kids], true, TODAY));
    const out = submitted(result.current);
    expect(out).toMatchObject({ assigneeIds: ['ann'], daysOfWeek: [1] });
    expect(out).not.toHaveProperty('groupSchedule');
    expect(out).not.toHaveProperty('assigneeGroupIds');
  });

  it('saves the group and not the people in it', () => {
    const { result } = renderHook(() => useChoreForm(saved({}), members, [kids], true, TODAY));
    act(() => result.current.toggleGroup('kids'));
    act(() => result.current.setRotation('rotate-weekly'));
    expect(submitted(result.current)).toMatchObject({ assigneeIds: [], assigneeGroupIds: ['kids'], rotation: 'rotate-weekly' });
  });

  it('keeps a chosen rotation for a group of one', () => {
    const { result } = renderHook(() => useChoreForm(saved({ assigneeGroupIds: ['solo'], rotation: 'rotate-daily' }), members, [solo], true, TODAY));
    expect(result.current.canRotate).toBe(true);
    expect(submitted(result.current).rotation).toBe('rotate-daily');
  });

  it('drops a group that no longer exists, and then asks for a person or group', () => {
    const { result } = renderHook(() => useChoreForm(saved({ assigneeGroupIds: ['gone'] }), members, [kids], true, TODAY));
    expect(result.current.assigneeGroupIds).toEqual([]);
    expect(result.current.canSave).toBe(false);
    expect(result.current.validationHintKind).toBe('selectAtLeastOnePersonOrGroup');
  });

  it('unticking the group takes it back off the chore', () => {
    const { result } = renderHook(() => useChoreForm(saved({ assigneeIds: ['ann'], assigneeGroupIds: ['kids'] }), members, [kids], true, TODAY));
    act(() => result.current.toggleGroup('kids'));
    expect(submitted(result.current)).not.toHaveProperty('assigneeGroupIds');
  });

  // The family list is empty while it loads and after a failed first fetch;
  // an empty list must never read as "this group was removed".
  it('keeps a picked group and holds the save until the family list has loaded', () => {
    const chore = saved({ assigneeIds: ['ann'], assigneeGroupIds: ['kids'] });
    const { result, rerender } = renderHook(({ ready }) => useChoreForm(chore, ready ? members : [], ready ? [kids] : [], ready, TODAY), { initialProps: { ready: false } });
    act(() => result.current.setName('Dishes, renamed'));
    expect(result.current.assigneeGroupIds).toEqual(['kids']);
    expect(result.current.canSave).toBe(false);
    expect(result.current.validationHintKind).toBe('familyNotReady');
    const onSubmit = vi.fn();
    result.current.submit(onSubmit);
    expect(onSubmit).not.toHaveBeenCalled();

    rerender({ ready: true });
    expect(result.current.canSave).toBe(true);
    expect(submitted(result.current)).toMatchObject({ name: 'Dishes, renamed', assigneeIds: ['ann'], assigneeGroupIds: ['kids'] });
  });
});

describe('useChoreForm Regular and Bonus', () => {
  const scheduled = saved({
    assigneeIds: ['ann', 'ben'], rotation: 'schedule', schedule: { ann: [1, 3], ben: [2, 4] },
    daysOfWeek: [1, 2, 3, 4], timeOfDay: 'evening',
  });

  it('flipping to Bonus and back changes nothing about the regular setup', () => {
    const { result } = renderHook(() => useChoreForm(scheduled, members, [kids], true, TODAY));
    act(() => result.current.setKind('bonus'));
    act(() => result.current.setKind('regular'));
    const back = submitted(result.current);
    expect(back).toMatchObject({ rotation: 'schedule', schedule: { ann: [1, 3], ben: [2, 4] }, timeOfDay: 'evening' });
    expect(back.bonus).toBeUndefined();
  });

  it('saves a bonus chore with its regular setup kept, and gets it back when it turns regular again', () => {
    const once = saved({ frequency: 'once', specificDate: '2026-10-01', rotation: 'rotate-weekly', assigneeIds: ['ann', 'ben'], timeOfDay: 'morning' });
    const { result } = renderHook(() => useChoreForm(once, members, [kids], true, TODAY));
    act(() => result.current.setKind('bonus'));
    const asBonus = submitted(result.current);
    expect(asBonus).toMatchObject({ frequency: 'once', specificDate: '2026-10-01', rotation: 'rotate-weekly', timeOfDay: 'morning' });
    // A one-off job as a bonus chore: done until put back.
    expect(asBonus.bonus).toMatchObject({ claim: 'first', comesBack: 'manual' });
    expect(asBonus.bonus?.since).toBeTruthy();

    const { result: again } = renderHook(() => useChoreForm({ ...once, ...asBonus }, members, [kids], true, TODAY));
    act(() => again.current.setKind('regular'));
    expect(submitted(again.current)).toMatchObject({ frequency: 'once', specificDate: '2026-10-01', rotation: 'rotate-weekly', timeOfDay: 'morning' });
  });

  it('gives a one-time chore with no days its date\'s weekday when it turns bonus', () => {
    const once = saved({ frequency: 'once', specificDate: '2026-10-01', daysOfWeek: [], assigneeIds: ['ann'] });
    const { result } = renderHook(() => useChoreForm(once, members, [kids], true, TODAY));
    act(() => result.current.setKind('bonus'));
    expect(result.current.canSave).toBe(true);
    expect(submitted(result.current)).toMatchObject({ daysOfWeek: [4], bonus: { comesBack: 'manual' } });
  });

  it('never saves fewer than 0 tickets', () => {
    const { result } = renderHook(() => useChoreForm(saved({ assigneeIds: ['ann'] }), members, [kids], true, TODAY));
    act(() => result.current.setPoints('-5'));
    expect(submitted(result.current).points).toBe(0);
  });

  it('keeps a bonus chore\'s stamp when its kind or comes back changes', () => {
    const bonusChore = saved({ assigneeIds: ['ann'], bonus: { claim: 'first', comesBack: 'daily', since: 'stamp' } });
    const { result } = renderHook(() => useChoreForm(bonusChore, members, [kids], true, TODAY));
    act(() => result.current.setComesBack('weekly'));
    expect(submitted(result.current).bonus).toEqual({ claim: 'first', comesBack: 'weekly', since: 'stamp' });
  });
});
