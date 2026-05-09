'use client';

import { useMemo } from 'react';
import Toggle from '@/components/ui/Toggle';
import PropertyGroup from './PropertyGroup';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import type { ModuleSchedule } from '@/types/config';

interface ScheduleEditorProps {
  schedule: ModuleSchedule | undefined;
  onChange: (next: ModuleSchedule | undefined) => void;
}

export function ScheduleEditor({ schedule, onChange }: ScheduleEditorProps) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
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
    onChange({ ...schedule, ...updates });
  };

  const toggleEnabled = (on: boolean) => {
    if (on) {
      onChange({ daysOfWeek: [1, 2, 3, 4, 5] });
    } else {
      onChange(undefined);
    }
  };

  const toggleDay = (day: number) => {
    const current = schedule?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
    // Prevent deselecting the last day — at least one must remain active
    if (next.length === 0) return;
    setSchedule({ daysOfWeek: next });
  };

  return (
    <div className="space-y-3">
      <PropertyGroup title={t('scheduleEditor.statusTitle')} accent={1}>
        <Toggle label={t('scheduleEditor.enableLabel')} checked={enabled} onChange={toggleEnabled} />
      </PropertyGroup>

      {enabled && (
        <>
          <PropertyGroup title={t('scheduleEditor.daysTitle')} accent={2}>
            <div className="flex gap-1">
              {dayLabels.map((label, i) => {
                const days = schedule?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
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
          </PropertyGroup>

          <PropertyGroup title={t('scheduleEditor.behaviorTitle')} accent={4}>
            <Toggle
              label={t('scheduleEditor.invertLabel')}
              checked={!!schedule?.invert}
              onChange={(v) => setSchedule({ invert: v || undefined })}
            />
          </PropertyGroup>
        </>
      )}
    </div>
  );
}
