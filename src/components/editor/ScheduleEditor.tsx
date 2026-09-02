'use client';

import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import PropertyGroup from './PropertyGroup';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import { useEditorStore } from '@/stores/editor-store';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import { describeSchedule } from '@/lib/schedule-summary';
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
  // Day-of-week labels follow the formatting locale (date-fns conventions),
  // not the UI language — ['Sun', 'Mon', …] for en-US, ['So.', 'Mo.', …]
  // for de-DE. Memoized so the schedule editor doesn't re-run 7
  // formatDateSync calls on every parent re-render.
  const dayLabels = useMemo(
    () => getLocalizedDayNames(formattingLocale, 'short'),
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
    const current = schedule?.daysOfWeek ?? EVERY_DAY;
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
    // Prevent deselecting the last day — at least one must remain active
    if (next.length === 0) return;
    setSchedule({ daysOfWeek: next });
  };

  // The invert toggle has nothing to invert without a window: with no times
  // set it would hide the module every day, forever.
  const hasWindow = !!schedule?.startTime && !!schedule?.endTime;
  // date-fns-backed; re-deriving it on every unrelated parent re-render (not
  // just an actual schedule edit) is wasted work.
  const summary = useMemo(
    () => describeSchedule(schedule, t, formattingLocale, timeFormat),
    [schedule, t, formattingLocale, timeFormat],
  );

  return (
    <div className="space-y-3">
      <PropertyGroup title={t('scheduleEditor.statusTitle')} accent={1}>
        <Toggle label={t('scheduleEditor.enableLabel')} checked={enabled} onChange={toggleEnabled} />
      </PropertyGroup>

      {enabled && (
        <>
          <div
            className="flex gap-2 items-start rounded-md border border-hs-accent/30 bg-hs-accent-soft px-2.5 py-2 text-[11px] leading-relaxed text-hs-text-secondary"
            data-testid="schedule-summary"
          >
            <Clock className="w-3 h-3 shrink-0 mt-0.5 text-hs-accent-hover" aria-hidden="true" />
            <span>{summary.sentence}</span>
          </div>

          <PropertyGroup title={t('fields.days')} accent={2}>
            <div className="flex gap-1">
              {dayLabels.map((label, i) => {
                const days = schedule?.daysOfWeek ?? EVERY_DAY;
                const active = days.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`flex-1 text-[10px] py-1 rounded transition-colors ${
                      active
                        ? 'bg-hs-accent text-white'
                        : 'bg-hs-card text-hs-text-faint hover:bg-hs-hover'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
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
              <label className="flex flex-col gap-0.5">
                <span className="text-xs text-hs-text-muted">{t('scheduleEditor.untilLabel')}</span>
                <input
                  type="time"
                  value={schedule?.endTime ?? ''}
                  onChange={(e) => setSchedule({ endTime: e.target.value || undefined })}
                  className={INPUT_CLASS}
                />
              </label>
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
