'use client';

import type { FamilyGroup, FamilyMember } from '@/types/family';

import { useMemo, useState } from 'react';
import type {
  ChoreBonusClaim,
  ChoreBonusComesBack,
  ChoreDefinition,
  ChoreResetFrequency,
  ChoreTimeOfDay,
  ChoreRotation,
} from '@/types/config';
import type { TranslateFn } from '@/i18n';
import { choreAssigneeIds, parseISO, todayStr } from './types';
import {
  canChoreRotate,
  defaultChoreDays,
  finalizeChoreAssignment,
  getChoreValidationHintKind,
  scheduleDaysCovered,
  type ChoreValidationHintKind,
} from './chore-form-presentation';
import { DEFAULT_CHORE_ICON } from '@/lib/chore-constants';

/**
 * Shared form state for chore forms.
 *
 * Two near-identical form overlays exist — one tailwind desktop modal in the
 * editor (`ChoreChartModal`) and one inline-styled mobile overlay in the
 * remote (`ChoresManageView`). They share every piece of validation, schedule
 * manipulation, and submit logic; only presentation differs. These hooks are
 * that shared logic so the two surfaces can never drift.
 */

/** Whether the chore is owed by the people on it, or a bonus that only earns tickets. */
export type ChoreKind = 'regular' | 'bonus';

export interface ChoreFormState {
  kind: ChoreKind;
  /** Bonus only: who gets the tickets. */
  bonusClaim: ChoreBonusClaim;
  /** Bonus only: when it is open again once done. */
  comesBack: ChoreBonusComesBack;
  name: string;
  emoji: string;
  points: string;
  frequency: ChoreResetFrequency;
  daysOfWeek: number[];
  specificDate: string;
  timeOfDay: ChoreTimeOfDay;
  assigneeIds: string[];
  /** The picked groups that still exist. */
  assigneeGroupIds: string[];
  rotation: ChoreRotation;
  schedule: Record<string, number[]>;
  /** The schedule's group rows that still exist: everyone in the group has the chore on those days. */
  groupSchedule: Record<string, number[]>;
  /** Who already has the chore through a picked group, with the names of those groups. */
  coveredByGroup: Map<string, string[]>;
  /** A group is picked, or has days on the schedule, but nobody is in it and nobody else is picked: the chore would go to no one. */
  goesToNobody: boolean;
  /** Whether the form asks how the chore is shared: two or more people, a group, or a schedule. */
  canRotate: boolean;

  setKind: (v: ChoreKind) => void;
  setBonusClaim: (v: ChoreBonusClaim) => void;
  setComesBack: (v: ChoreBonusComesBack) => void;
  setName: (v: string) => void;
  setEmoji: (v: string) => void;
  setPoints: (v: string) => void;
  setFrequency: (v: ChoreResetFrequency) => void;
  setSpecificDate: (v: string) => void;
  setTimeOfDay: (v: ChoreTimeOfDay) => void;

  switchToSchedule: () => void;
  switchFromSchedule: (newRotation: ChoreRotation) => void;
  setRotation: (v: ChoreRotation) => void;
  toggleDay: (d: number) => void;
  toggleAssignee: (id: string) => void;
  toggleGroup: (id: string) => void;
  toggleScheduleDay: (memberId: string, day: number) => void;
  addMemberToSchedule: (memberId: string) => void;
  toggleGroupScheduleDay: (groupId: string, day: number) => void;
  addGroupToSchedule: (groupId: string) => void;
  removeMemberFromSchedule: (memberId: string) => void;
  removeGroupFromSchedule: (groupId: string) => void;

  scheduleMembers: string[];
  scheduleGroups: FamilyGroup[];
  scheduleDays: number[];
  unscheduledMembers: FamilyMember[];
  unscheduledGroups: FamilyGroup[];

  canSave: boolean;
  validationHintKind: ChoreValidationHintKind | null;
  submit: (onSubmit: (data: Omit<ChoreDefinition, 'id'>) => void) => void;
}

export function useChoreForm(
  initial: ChoreDefinition | undefined,
  members: FamilyMember[],
  groups: FamilyGroup[],
  /**
   * Whether `members` and `groups` are the real family list. While it is
   * still loading, or never arrived, both are empty, and an empty group list
   * says nothing about which groups exist.
   */
  familyReady: boolean,
): ChoreFormState {
  const [kind, setKindState] = useState<ChoreKind>(initial?.bonus ? 'bonus' : 'regular');
  const [bonusClaim, setBonusClaim] = useState<ChoreBonusClaim>(initial?.bonus?.claim ?? 'first');
  const [comesBack, setComesBack] = useState<ChoreBonusComesBack>(initial?.bonus?.comesBack ?? 'daily');
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? DEFAULT_CHORE_ICON);
  const [points, setPoints] = useState(initial?.points?.toString() ?? '1');
  const [frequency, setFrequencyState] = useState<ChoreResetFrequency>(initial?.frequency ?? 'daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initial?.daysOfWeek ?? defaultChoreDays(initial?.frequency ?? 'daily'));
  // Whether the days on the row are somebody's choice rather than the row the
  // frequency filled in. A chore being edited arrives with its days already
  // chosen, so changing its frequency must never wipe them.
  const [daysPicked, setDaysPicked] = useState(initial !== undefined);
  const [specificDate, setSpecificDate] = useState<string>(initial?.specificDate ?? todayStr());
  const [timeOfDay, setTimeOfDay] = useState<ChoreTimeOfDay>(initial?.timeOfDay ?? 'anytime');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initial?.assigneeIds ?? []);
  const [pickedGroupIds, setPickedGroupIds] = useState<string[]>(initial?.assigneeGroupIds ?? []);
  const [rotation, setRotation] = useState<ChoreRotation>(initial?.rotation ?? 'fixed');
  const [schedule, setSchedule] = useState<Record<string, number[]>>(initial?.schedule ?? {});
  const [pickedGroupSchedule, setPickedGroupSchedule] = useState<Record<string, number[]>>(initial?.groupSchedule ?? {});

  // A group deleted since the chore was saved drops out here, so the form
  // never counts it and never saves it back. Only a loaded family list can
  // say a group is gone: until then every picked group is kept, and saving
  // waits, so a quick rename cannot quietly take a chore away from its group.
  // The same goes for a deleted group's row on the schedule.
  const groupLives = (id: string) => !familyReady || groups.some((group) => group.id === id);
  const assigneeGroupIds = pickedGroupIds.filter(groupLives);
  const groupSchedule = Object.fromEntries(Object.entries(pickedGroupSchedule).filter(([id]) => groupLives(id)));
  const assigneeCount = choreAssigneeIds({ assigneeIds, assigneeGroupIds }, groups).length;
  const coveredByGroup = new Map<string, string[]>();
  for (const group of groups) {
    if (!assigneeGroupIds.includes(group.id)) continue;
    for (const memberId of group.memberIds) coveredByGroup.set(memberId, [...(coveredByGroup.get(memberId) ?? []), group.name]);
  }
  // A bonus chore is open to everyone picked, every time: no turns, no grid.
  const isBonus = kind === 'bonus';
  const saved = finalizeChoreAssignment({ rotation: isBonus ? 'fixed' : rotation, schedule, groupSchedule, assigneeIds, assigneeGroupIds, groups });
  const goesToNobody = familyReady && (saved.assigneeGroupIds?.length ?? 0) > 0 && choreAssigneeIds(saved, groups).length === 0;
  const canRotate = !isBonus && canChoreRotate({ assigneeCount, assigneeGroupIdsLength: assigneeGroupIds.length, rotation });

  // Changing how often a chore comes around changes what its day row means:
  // daily is every day, weekly and every-other-week are "pick which days" and
  // start with none on. Days somebody actually picked are theirs and survive
  // the change.
  const setFrequency = (next: ChoreResetFrequency) => {
    setFrequencyState(next);
    if (!daysPicked) setDaysOfWeek(defaultChoreDays(next));
  };

  // Whoever is picked when the grid opens starts with a row on the chore's
  // days, people and groups alike. A grid that already has rows is left alone.
  const switchToSchedule = () => {
    setRotation('schedule');
    if (Object.keys(schedule).length === 0 && Object.keys(groupSchedule).length === 0) {
      setSchedule(Object.fromEntries(assigneeIds.map((id) => [id, [...daysOfWeek]])));
      setPickedGroupSchedule(Object.fromEntries(assigneeGroupIds.map((id) => [id, [...daysOfWeek]])));
    }
  };

  // The way back: every row with a day becomes a picked person or group.
  const switchFromSchedule = (newRotation: ChoreRotation) => {
    const left = finalizeChoreAssignment({ rotation: 'schedule', schedule, groupSchedule, assigneeIds, assigneeGroupIds, groups });
    const days = scheduleDaysCovered(schedule, groupSchedule);
    if (left.assigneeIds.length > 0 || left.assigneeGroupIds) {
      setAssigneeIds(left.assigneeIds);
      setPickedGroupIds(left.assigneeGroupIds ?? []);
    }
    if (days.length > 0) {
      setDaysOfWeek(days);
      setDaysPicked(true);
    }
    setRotation(newRotation);
  };

  // A row left with no days stays on the grid (it is not saved) so it does
  // not vanish from under a finger; taking a row off is its own button.
  const toggledRow = (rows: Record<string, number[]>, id: string, day: number) => {
    const current = rows[id] ?? [];
    return { ...rows, [id]: current.includes(day) ? current.filter((d) => d !== day) : [...current, day] };
  };
  const withoutRow = (rows: Record<string, number[]>, id: string) => {
    const { [id]: _row, ...rest } = rows;
    return rest;
  };

  const toggleScheduleDay = (memberId: string, day: number) => setSchedule((prev) => toggledRow(prev, memberId, day));
  const toggleGroupScheduleDay = (groupId: string, day: number) => setPickedGroupSchedule((prev) => toggledRow(prev, groupId, day));
  const removeMemberFromSchedule = (memberId: string) => setSchedule((prev) => withoutRow(prev, memberId));
  const removeGroupFromSchedule = (groupId: string) => setPickedGroupSchedule((prev) => withoutRow(prev, groupId));

  const addMemberToSchedule = (memberId: string) => {
    setSchedule((prev) => ({ ...prev, [memberId]: [] }));
  };
  const addGroupToSchedule = (groupId: string) => {
    setPickedGroupSchedule((prev) => ({ ...prev, [groupId]: [] }));
  };

  const scheduleMembers = Object.keys(schedule);
  const scheduleGroups = groups.filter((group) => Object.hasOwn(groupSchedule, group.id));
  const scheduleDays = scheduleDaysCovered(schedule, groupSchedule);
  const unscheduledMembers = members.filter((m) => !scheduleMembers.includes(m.id));
  const unscheduledGroups = groups.filter((group) => !Object.hasOwn(groupSchedule, group.id));

  // Turning a chore into a bonus one takes it off any schedule grid (its rows
  // become the picked people and groups) and off a one-time date: a bonus
  // chore shows up on its days until it is done, then comes back.
  // Flipping the kind changes nothing else: a bonus chore keeps its regular
  // setup (frequency, date, turns, schedule grid, time of day) untouched, and
  // the bonus rules ignore it, so flipping back gets all of it back.
  // Switching kinds keeps every regular field for a switch back. The one
  // exception is a one-time chore: a bonus chore shows on weekdays, not a
  // date, and its day row would start empty. It gets its date's weekday and
  // "when I put it back", which is what a one-off job becomes as a bonus chore.
  const setKind = (next: ChoreKind) => {
    setKindState(next);
    if (next !== 'bonus' || frequency !== 'once' || initial?.bonus) return;
    if (daysOfWeek.length === 0) setDaysOfWeek([parseISO(specificDate).getDay()]);
    setComesBack('manual');
  };

  const toggleDay = (d: number) => {
    setDaysPicked(true);
    setDaysOfWeek((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const toggleAssignee = (id: string) => {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleGroup = (id: string) => {
    setPickedGroupIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const scheduleHasAssignment = isBonus || rotation !== 'schedule' || scheduleDays.length > 0;
  const validationHintKind = getChoreValidationHintKind({
    name,
    rotation: isBonus ? 'fixed' : rotation,
    scheduleHasAssignment,
    assigneeIdsLength: assigneeIds.length,
    assigneeGroupIdsLength: assigneeGroupIds.length,
    hasGroups: groups.length > 0,
    familyReady,
    frequency: isBonus ? 'daily' : frequency,
    daysOfWeekLength: daysOfWeek.length,
  });
  const canSave = validationHintKind === null;

  const submit = (onSubmit: (data: Omit<ChoreDefinition, 'id'>) => void) => {
    if (!canSave) return;
    // A typed minus sign gets past the box's minimum: tickets never go below 0.
    const tickets = Number.isNaN(parseInt(points)) ? 1 : Math.max(0, parseInt(points));
    if (isBonus) {
      // Who can do it is the people and groups picked; the regular setup is
      // saved as it stands so switching back to regular restores it.
      onSubmit({
        name: name.trim(),
        emoji,
        points: tickets,
        frequency,
        daysOfWeek,
        timeOfDay,
        ...saved,
        rotation,
        ...(rotation === 'schedule' ? { schedule, groupSchedule } : {}),
        ...(frequency === 'once' ? { specificDate } : {}),
        // A chore that just became a bonus chore starts its count now; one that
        // already was keeps its stamp. The hub restamps with its own clock.
        bonus: {
          claim: bonusClaim,
          comesBack,
          ...(initial?.bonus
            ? (initial.bonus.since ? { since: initial.bonus.since } : {})
            : { since: new Date().toISOString() }),
        },
      });
      return;
    }
    onSubmit({
      name: name.trim(),
      emoji,
      points: tickets,
      frequency,
      daysOfWeek: rotation === 'schedule' ? scheduleDays : daysOfWeek,
      timeOfDay,
      ...saved,
      ...(frequency === 'once' ? { specificDate } : {}),
    });
  };

  return {
    kind, bonusClaim, comesBack, setKind, setBonusClaim, setComesBack,
    name, emoji, points, frequency, daysOfWeek, specificDate, timeOfDay,
    assigneeIds, assigneeGroupIds, rotation, schedule, groupSchedule, canRotate, coveredByGroup, goesToNobody,
    setName, setEmoji, setPoints, setFrequency, setSpecificDate, setTimeOfDay,
    switchToSchedule, switchFromSchedule, setRotation,
    toggleDay, toggleAssignee, toggleGroup, toggleScheduleDay, addMemberToSchedule, toggleGroupScheduleDay, addGroupToSchedule,
    removeMemberFromSchedule, removeGroupFromSchedule,
    scheduleMembers, scheduleGroups, scheduleDays, unscheduledMembers, unscheduledGroups,
    canSave, validationHintKind, submit,
  };
}

export interface ChoreLabelMaps {
  frequencyLabelMap: Record<ChoreResetFrequency, string>;
  rotationLabelMap: Record<ChoreRotation, string>;
}

/**
 * Frequency and rotation `<select>` option labels. Both the editor modal and
 * the /remote overlay read the SAME `chore-chart.frequency.*` and
 * `chore-chart.rotation.*` keys, which live in the `modules` namespace so
 * /remote and /chores never have to pull the 181 KB editor dictionary for a
 * handful of chore words. Callers pass a `t` bound to
 * `useTranslate('modules')`. Memoized on `t`, which is locale-stable per
 * provider.tsx, so the maps rebuild only when the active locale changes, not
 * on every keystroke.
 */
export function useChoreLabelMaps(t: TranslateFn): ChoreLabelMaps {
  const frequencyLabelMap = useMemo<Record<ChoreResetFrequency, string>>(
    () => ({
      daily: t('chore-chart.frequency.daily'),
      weekly: t('chore-chart.frequency.weekly'),
      biweekly: t('chore-chart.frequency.biweekly'),
      once: t('chore-chart.frequency.once'),
    }),
    [t],
  );
  const rotationLabelMap = useMemo<Record<ChoreRotation, string>>(
    () => ({
      fixed: t('chore-chart.rotation.fixed'),
      'rotate-daily': t('chore-chart.rotation.rotateDaily'),
      'rotate-weekly': t('chore-chart.rotation.rotateWeekly'),
      schedule: t('chore-chart.rotation.schedule'),
    }),
    [t],
  );
  return { frequencyLabelMap, rotationLabelMap };
}
