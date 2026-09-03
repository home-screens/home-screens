'use client';

import Toggle from '@/components/ui/Toggle';
import PropertyGroup from './PropertyGroup';
import ScheduleWeekStrip from './ScheduleWeekStrip';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import { useEditorStore } from '@/stores/editor-store';
import { useMemo } from 'react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import { resolveSpanDays, scheduleShape } from '@/lib/schedule';
import type { ModuleSchedule } from '@/types/config';

interface ScheduleEditorProps {
  schedule: ModuleSchedule | undefined;
  onChange: (next: ModuleSchedule | undefined) => void;
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

export function ScheduleEditor({ schedule, onChange }: ScheduleEditorProps) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  const timeFormat = useEditorStore((s) => s.config?.settings.timeFormat);
  const dayNames = useMemo(
    () => getLocalizedDayNames(formattingLocale, 'full'),
    [formattingLocale],
  );

  const enabled = !!schedule;

  const setSchedule = (updates: Partial<ModuleSchedule>) => {
    const next: ModuleSchedule = { ...schedule, ...updates };
    // Invert has nothing to invert without a full window. Dropping it here
    // (not just disabling the toggle) keeps the checkbox and the underlying
    // flag from disagreeing — otherwise clearing the window after Invert was
    // turned on leaves the module hidden forever with no control left to
    // uncheck it.
    if (!(next.startTime && next.endTime) && next.invert) {
      next.invert = undefined;
    }
    onChange(next);
  };

  const toggleEnabled = (on: boolean) => {
    if (on) {
      // Every day, all day — a no-op the user then narrows. Seeding Mon-Fri
      // silently hid weekend content for anyone who only wanted a time window.
      onChange({ daysOfWeek: [...EVERY_DAY] });
    } else {
      onChange(undefined);
    }
  };

  const toggleDay = (day: number) => {
    // A span runs from one day, so a chip picks that day outright.
    if (shape === 'span') {
      setSchedule({ daysOfWeek: [day] });
      return;
    }
    const current = schedule?.daysOfWeek ?? EVERY_DAY;
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
    // Prevent deselecting the last day — at least one must remain active
    if (next.length === 0) return;
    setSchedule({ daysOfWeek: next });
  };

  /**
   * Switching shape has to leave a schedule that means something. A span needs
   * exactly one start day and an offset of at least one, or it is just a plain
   * window wearing the wrong label; going back drops the offset so the overnight
   * rule takes over again.
   */
  const setShape = (next: 'repeat' | 'span') => {
    if (next === 'span') {
      const first = (schedule?.daysOfWeek ?? EVERY_DAY)[0] ?? 0;
      setSchedule({ daysOfWeek: [first], endDayOffset: Math.max(1, spanDays) });
    } else {
      setSchedule({ endDayOffset: undefined });
    }
  };

  // The invert toggle has nothing to invert without a window: with no times
  // set it would hide the module every day, forever.
  const hasWindow = !!schedule?.startTime && !!schedule?.endTime;

  // What the span selector shows while `endDayOffset` is unset: the implicit
  // rule the schedule is running under, so the control reads back the truth
  // rather than defaulting to "the same day" on an overnight window.
  const spanDays = resolveSpanDays(schedule);
  const shape = scheduleShape(schedule);
  const startDay = (schedule?.daysOfWeek ?? EVERY_DAY)[0] ?? 0;

  return (
    <div className="space-y-3">
      <PropertyGroup title={t('scheduleEditor.statusTitle')} accent={1}>
        <Toggle label={t('scheduleEditor.enableLabel')} checked={enabled} onChange={toggleEnabled} />
      </PropertyGroup>

      {schedule && (
        <>
          {/* The strip replaced a summary sentence and a separate row of day
              chips. It shows the same facts and, unlike the sentence, shows
              which day an overnight window ends on. */}
          <PropertyGroup title={t('scheduleEditor.repeatTitle')} accent={1}>
            <select
              aria-label={t('scheduleEditor.repeatTitle')}
              data-testid="schedule-shape"
              value={shape}
              onChange={(e) => setShape(e.target.value as 'repeat' | 'span')}
              className={INPUT_CLASS}
            >
              <option value="repeat">{t('scheduleEditor.shapeRepeat')}</option>
              <option value="span">{t('scheduleEditor.shapeSpan')}</option>
            </select>
          </PropertyGroup>

          <PropertyGroup title={t('scheduleEditor.weekPreviewTitle')} accent={2}>
            <ScheduleWeekStrip
              schedule={schedule}
              timeFormat={timeFormat}
              shape={shape}
              onToggleDay={toggleDay}
              onDragEdge={setSchedule}
            />
          </PropertyGroup>

          <PropertyGroup title={t('scheduleEditor.timeWindowTitle')} accent={3}>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-xs text-hs-text-muted">{t('scheduleEditor.fromLabel')}</span>
                <input
                  type="time"
                  value={schedule?.startTime ?? ''}
                  onChange={(e) => setSchedule({ startTime: e.target.value || undefined })}
                  className={INPUT_CLASS}
                />
              </label>
              {/* The select is a sibling of the label, not inside it: a label
                  wrapping two controls folds the selected option's text into
                  the time input's accessible name. */}
              <div className="flex flex-col gap-0.5">
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs text-hs-text-muted">{t('scheduleEditor.untilLabel')}</span>
                  <input
                    type="time"
                    value={schedule?.endTime ?? ''}
                    onChange={(e) => setSchedule({ endTime: e.target.value || undefined })}
                    className={INPUT_CLASS}
                  />
                </label>
                {/* A span has one start day, so its end can be named outright
                    rather than counted in days. The keyboard path to the same
                    thing dragging the strip's end does. */}
                {shape === 'span' && (
                  <select
                    aria-label={t('scheduleEditor.endsOnLabel')}
                    data-testid="schedule-end-day-offset"
                    value={String(spanDays)}
                    onChange={(e) => setSchedule({ endDayOffset: Number(e.target.value) })}
                    className={`${INPUT_CLASS} mt-1`}
                  >
                    {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {dayNames[(startDay + n) % 7]}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            {/* A native time input ignores `placeholder`, so an empty window
                reads as "--:-- --" and nothing says that empty means all day. */}
            <p className="mt-1.5 text-[10px] text-hs-text-faint leading-relaxed">
              {t('scheduleEditor.allDayHint')}
            </p>
          </PropertyGroup>

          <PropertyGroup title={t('scheduleEditor.behaviorTitle')} accent={4}>
            <Toggle
              label={t('scheduleEditor.invertLabel')}
              checked={!!schedule?.invert}
              disabled={!hasWindow}
              onChange={(v) => setSchedule({ invert: v || undefined })}
            />
            {!hasWindow && (
              <p className="mt-1.5 text-[10px] text-hs-text-faint leading-relaxed">
                {t('scheduleEditor.invertNeedsWindow')}
              </p>
            )}
          </PropertyGroup>
        </>
      )}
    </div>
  );
}
