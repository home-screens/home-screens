'use client';

import { useMemo, useState } from 'react';
import type {
  ChoreMember,
  ChoreDefinition,
  ChoreResetFrequency,
  ChoreTimeOfDay,
  ChoreRotation,
} from '@/types/config';
import type { TranslateFn } from '@/i18n';
import { MEMBER_COLORS, todayStr } from './types';
import {
  getChoreValidationHintKind,
  type ChoreValidationHintKind,
} from './chore-form-presentation';
import { DEFAULT_CHORE_ICON } from '@/lib/chore-constants';

/**
 * Shared form state for chore and member forms.
 *
 * Two near-identical form overlays exist — one tailwind desktop modal in the
 * editor (`ChoreChartModal`) and one inline-styled mobile overlay in the
 * remote (`ChoresManageView`). They share every piece of validation, schedule
 * manipulation, and submit logic; only presentation differs. These hooks are
 * that shared logic so the two surfaces can never drift.
 */

export interface MemberFormState {
  name: string;
  emoji: string;
  color: string;
  setName: (v: string) => void;
  setEmoji: (v: string) => void;
  setColor: (v: string) => void;
  canSave: boolean;
  submit: (onSubmit: (data: Omit<ChoreMember, 'id'>) => void) => void;
}

export function useMemberForm(initial?: ChoreMember): MemberFormState {
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [color, setColor] = useState(initial?.color ?? MEMBER_COLORS[0]);

  const canSave = name.trim().length > 0;

  const submit = (onSubmit: (data: Omit<ChoreMember, 'id'>) => void) => {
    if (!canSave) return;
    onSubmit({ name: name.trim(), emoji, color });
  };

  return { name, emoji, color, setName, setEmoji, setColor, canSave, submit };
}

export interface ChoreFormState {
  name: string;
  emoji: string;
  points: string;
  frequency: ChoreResetFrequency;
  daysOfWeek: number[];
  specificDate: string;
  timeOfDay: ChoreTimeOfDay;
  assigneeIds: string[];
  rotation: ChoreRotation;
  schedule: Record<string, number[]>;

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
  toggleScheduleDay: (memberId: string, day: number) => void;
  addMemberToSchedule: (memberId: string) => void;

  scheduleMembers: string[];
  scheduleDays: number[];
  unscheduledMembers: ChoreMember[];

  canSave: boolean;
  validationHintKind: ChoreValidationHintKind | null;
  submit: (onSubmit: (data: Omit<ChoreDefinition, 'id'>) => void) => void;
}

export function useChoreForm(
  initial: ChoreDefinition | undefined,
  members: ChoreMember[],
): ChoreFormState {
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? DEFAULT_CHORE_ICON);
  const [points, setPoints] = useState(initial?.points?.toString() ?? '1');
  const [frequency, setFrequency] = useState<ChoreResetFrequency>(initial?.frequency ?? 'daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initial?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]);
  const [specificDate, setSpecificDate] = useState<string>(initial?.specificDate ?? todayStr());
  const [timeOfDay, setTimeOfDay] = useState<ChoreTimeOfDay>(initial?.timeOfDay ?? 'anytime');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initial?.assigneeIds ?? []);
  const [rotation, setRotation] = useState<ChoreRotation>(initial?.rotation ?? 'fixed');
  const [schedule, setSchedule] = useState<Record<string, number[]>>(initial?.schedule ?? {});

  const switchToSchedule = () => {
    setRotation('schedule');
    if (Object.keys(schedule).length === 0) {
      const seeded: Record<string, number[]> = {};
      for (const id of assigneeIds) {
        seeded[id] = [...daysOfWeek];
      }
      setSchedule(seeded);
    }
  };

  const switchFromSchedule = (newRotation: ChoreRotation) => {
    const ids = Object.entries(schedule).filter(([, d]) => d.length > 0).map(([id]) => id);
    const days = [...new Set(Object.values(schedule).flat())].sort((a, b) => a - b);
    if (ids.length > 0) setAssigneeIds(ids);
    if (days.length > 0) setDaysOfWeek(days);
    setRotation(newRotation);
  };

  const toggleScheduleDay = (memberId: string, day: number) => {
    setSchedule((prev) => {
      const current = prev[memberId] ?? [];
      const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
      if (next.length === 0) {
        const rest = { ...prev };
        delete rest[memberId];
        return rest;
      }
      return { ...prev, [memberId]: next };
    });
  };

  const addMemberToSchedule = (memberId: string) => {
    setSchedule((prev) => ({ ...prev, [memberId]: [] }));
  };

  const scheduleMembers = Object.keys(schedule);
  const scheduleDays = [...new Set(Object.values(schedule).flat())].sort((a, b) => a - b);
  const unscheduledMembers = members.filter((m) => !scheduleMembers.includes(m.id));

  const toggleDay = (d: number) => {
    setDaysOfWeek((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const toggleAssignee = (id: string) => {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const scheduleHasAssignment = rotation === 'schedule'
    ? Object.values(schedule).some((days) => days.length > 0)
    : true;
  const validationHintKind = getChoreValidationHintKind({
    name,
    rotation,
    scheduleHasAssignment,
    assigneeIdsLength: assigneeIds.length,
  });
  const canSave = validationHintKind === null;

  const submit = (onSubmit: (data: Omit<ChoreDefinition, 'id'>) => void) => {
    if (!canSave) return;
    const isSchedule = rotation === 'schedule';
    const finalAssigneeIds = isSchedule
      ? Object.entries(schedule).filter(([, d]) => d.length > 0).map(([id]) => id)
      : assigneeIds;
    const finalDaysOfWeek = isSchedule
      ? [...new Set(Object.values(schedule).flat())].sort((a, b) => a - b)
      : daysOfWeek;
    onSubmit({
      name: name.trim(),
      emoji,
      points: Number.isNaN(parseInt(points)) ? 1 : parseInt(points),
      frequency,
      daysOfWeek: finalDaysOfWeek,
      timeOfDay,
      assigneeIds: finalAssigneeIds,
      rotation: finalAssigneeIds.length <= 1 && !isSchedule ? 'fixed' : rotation,
      ...(isSchedule ? { schedule: Object.fromEntries(Object.entries(schedule).filter(([, d]) => d.length > 0)) } : {}),
      ...(frequency === 'once' ? { specificDate } : {}),
    });
  };

  return {
    name, emoji, points, frequency, daysOfWeek, specificDate, timeOfDay,
    assigneeIds, rotation, schedule,
    setName, setEmoji, setPoints, setFrequency, setSpecificDate, setTimeOfDay,
    switchToSchedule, switchFromSchedule, setRotation,
    toggleDay, toggleAssignee, toggleScheduleDay, addMemberToSchedule,
    scheduleMembers, scheduleDays, unscheduledMembers,
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
