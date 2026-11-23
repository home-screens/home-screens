'use client';

import Toggle from '@/components/ui/Toggle';
import PropertyGroup from './PropertyGroup';
import ScheduleWindowFields from './ScheduleWindowFields';
import { useMemo } from 'react';
import { useTranslate } from '@/i18n';
import { EVERY_DAY } from '@/lib/schedule';
import { computeWeekSegments } from '@/lib/schedule-timeline';
import type { ModuleSchedule } from '@/types/config';

interface ScheduleEditorProps {
  schedule: ModuleSchedule | undefined;
  onChange: (next: ModuleSchedule | undefined) => void;
  /**
   * Title of the first group. Defaults to "Status", which is right inside a
   * module's Schedule accordion; the screen panel stacks this editor above
   * the conditions editor and names each after what it gates.
   */
  statusTitle?: string;
  /** `opened`: a screen that shows only when opened, whose schedule says when it can be opened. */
  wording?: 'show' | 'opened';
}

export function ScheduleEditor({ schedule, onChange, statusTitle, wording = 'show' }: ScheduleEditorProps) {
  const t = useTranslate('editor');
  const enabled = !!schedule;

  // Every field is kept as set. `invert` in particular is never rewritten on
  // the user's behalf: "hide before 09:00" (an end with no start) and "hide on
  // weekends" (days with no times) are real schedules, and an earlier version
  // that dropped the flag whenever a time was empty turned them into their
  // opposites the moment any other field was edited.
  const setSchedule = (updates: Partial<ModuleSchedule>) => {
    onChange({ ...schedule, ...updates });
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

  // Invert with nothing narrowing the week hides the module always. The toggle
  // stays usable so the user can undo it; this only says what has happened.
  const neverShows = useMemo(
    () => !!schedule && computeWeekSegments(schedule).length === 0,
    [schedule],
  );

  return (
    <div className="space-y-3">
      <PropertyGroup title={statusTitle ?? t('scheduleEditor.statusTitle')} accent={1}>
        <Toggle label={t(wording === 'opened' ? 'scheduleEditor.opened.enableLabel' : 'scheduleEditor.enableLabel')} checked={enabled} onChange={toggleEnabled} />
      </PropertyGroup>

      {schedule && (
        <>
          <ScheduleWindowFields
            window={schedule}
            onPatch={setSchedule}
            skin="groups"
            wording={wording}
            labels={{ from: t('scheduleEditor.fromLabel'), until: t('scheduleEditor.untilLabel') }}
            testIds={{ shape: 'schedule-shape', endDay: 'schedule-end-day-offset' }}
          />

          <PropertyGroup title={t('scheduleEditor.behaviorTitle')} accent={4}>
            <Toggle
              label={t(wording === 'opened' ? 'scheduleEditor.opened.invertLabel' : 'scheduleEditor.invertLabel')}
              checked={!!schedule?.invert}
              onChange={(v) => setSchedule({ invert: v || undefined })}
            />
            {neverShows && (
              <p
                data-testid="schedule-never-shows"
                className="mt-1.5 text-[10px] text-hs-warning-ink leading-relaxed"
              >
                {t(wording === 'opened' ? 'scheduleEditor.opened.neverShows' : 'scheduleEditor.neverShows')}
              </p>
            )}
          </PropertyGroup>
        </>
      )}
    </div>
  );
}
