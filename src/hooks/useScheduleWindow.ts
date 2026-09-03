'use client';

import { resolveSpanDays, scheduleShape } from '@/lib/schedule';
import type { ModuleSchedule } from '@/types/config';

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

export interface ScheduleWindowControls {
  /** 'repeat' gives every picked day its own window; 'span' is one stretch. */
  shape: 'repeat' | 'span';
  /** Days after the start day that the window closes, 0-6. */
  spanDays: number;
  /** The day a span runs from, and the day its end select counts up from. */
  startDay: number;
  /** Pick a day: a toggle for a repeating window, a choice for a span. */
  toggleDay: (day: number) => void;
  setShape: (next: 'repeat' | 'span') => void;
}

/**
 * The behaviour behind a day/time window, shared by the module Schedule
 * accordion and the `time` visibility condition. Both edit the same four
 * fields and must agree about what they mean; only their layout differs, so
 * the logic lives here and each renders its own controls.
 */
export function useScheduleWindow(
  value: ModuleSchedule | undefined,
  onChange: (patch: Partial<ModuleSchedule>) => void,
): ScheduleWindowControls {
  const shape = scheduleShape(value);
  const spanDays = resolveSpanDays(value);
  const startDay = (value?.daysOfWeek ?? EVERY_DAY)[0] ?? 0;

  const toggleDay = (day: number) => {
    // A span runs from one day, so a chip picks that day outright.
    if (shape === 'span') {
      onChange({ daysOfWeek: [day] });
      return;
    }
    const current = value?.daysOfWeek ?? EVERY_DAY;
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    // At least one day must stay picked, or the window matches nothing and
    // there is no control left to bring it back.
    if (next.length === 0) return;
    onChange({ daysOfWeek: next });
  };

  /**
   * Switching shape has to leave something that means what its label says. A
   * span needs exactly one start day and an offset of at least one, or it is a
   * plain window wearing the wrong name; going back drops the offset so the
   * overnight rule takes over again.
   */
  const setShape = (next: 'repeat' | 'span') => {
    if (next === 'span') {
      onChange({ daysOfWeek: [startDay], endDayOffset: Math.max(1, spanDays) });
    } else {
      onChange({ endDayOffset: undefined });
    }
  };

  return { shape, spanDays, startDay, toggleDay, setShape };
}
