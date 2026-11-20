'use client';

import { useMemo } from 'react';
import PropertyGroup from './PropertyGroup';
import ScheduleWeekStrip from './ScheduleWeekStrip';
import HomeTimeHint from './HomeTimeHint';
import { INPUT_CLASS, SETTINGS_INPUT_CLASS } from '@/components/ui/input-classes';
import { useEditorStore } from '@/stores/editor-store';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import { useScheduleWindow } from '@/hooks/useScheduleWindow';
import type { ModuleSchedule } from '@/types/config';

/**
 * Where the fields sit, which decides only how they are dressed:
 * `groups` is a module's or screen's Schedule accordion (titled groups),
 * `condition` is a time condition inside the conditions editor (one tight
 * stack), `settings` is a card on a Settings page (roomier boxes).
 */
type Skin = 'groups' | 'condition' | 'settings';

const SKIN: Record<Skin, { input: string; hint: string; homeHint: string | undefined }> = {
  groups: { input: INPUT_CLASS, hint: 'mt-1.5 text-[10px] text-hs-text-faint leading-relaxed', homeHint: undefined },
  condition: { input: INPUT_CLASS, hint: 'text-[10px] text-hs-text-dim', homeHint: '' },
  settings: {
    input: `mt-1 block w-full ${SETTINGS_INPUT_CLASS}`,
    hint: 'text-[11px] text-hs-text-faint',
    homeHint: '-mt-1.5',
  },
};

interface ScheduleWindowFieldsProps {
  /** The days and hours being edited. `invert` is drawn by the strip, never changed here. */
  window: ModuleSchedule;
  onPatch: (next: Partial<ModuleSchedule>) => void;
  skin: Skin;
  labels: { from: string; until: string };
  testIds: { shape: string; endDay: string };
  /** `opened`: a screen that shows only when opened, whose schedule says when it can be opened. */
  wording?: 'show' | 'opened';
}

/**
 * The body of every day-and-time window in the editor: how it repeats, the
 * week strip, From and Until, and the day a stretch ends on. A module's
 * schedule, a screen's, a time condition and a profile's schedule all store
 * the same four fields and must agree about what they mean, so they draw
 * them from here; each keeps its own switch for turning the window on and
 * its own wording for hiding during it.
 */
export default function ScheduleWindowFields({
  window,
  onPatch,
  skin,
  labels,
  testIds,
  wording = 'show',
}: ScheduleWindowFieldsProps) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  const timeFormat = useEditorStore((s) => s.config?.settings.timeFormat);
  const dayNames = useMemo(
    () => getLocalizedDayNames(formattingLocale, 'full'),
    [formattingLocale],
  );
  const { shape, spanDays, startDay, toggleDay, setShape } = useScheduleWindow(window, onPatch);
  const look = SKIN[skin];
  const grouped = skin === 'groups';
  const labelGap = skin === 'settings' ? 'block' : 'flex flex-col gap-0.5';

  const shapeSelect = (
    <select
      aria-label={grouped ? t('scheduleEditor.repeatTitle') : undefined}
      data-testid={testIds.shape}
      value={shape}
      /* A narrow panel cuts a long option off mid-word with no ellipsis, so
         the full wording is only recoverable on hover.
         `shape-options.test.ts` keeps the strings inside the width that fits. */
      title={t(shape === 'span' ? 'scheduleEditor.shapeSpan' : 'scheduleEditor.shapeRepeat')}
      onChange={(e) => setShape(e.target.value as 'repeat' | 'span')}
      className={look.input}
    >
      <option value="repeat">{t('scheduleEditor.shapeRepeat')}</option>
      <option value="span">{t('scheduleEditor.shapeSpan')}</option>
    </select>
  );

  /* The strip shows the same facts a summary sentence and a row of day chips
     would and, unlike them, shows which day an overnight window ends on. */
  const strip = (
    <ScheduleWeekStrip
      wording={wording}
      schedule={window}
      timeFormat={timeFormat}
      shape={shape}
      onToggleDay={toggleDay}
      onDragEdge={onPatch}
    />
  );

  const times = (
    <div className="grid grid-cols-2 gap-2">
      <label className={labelGap}>
        <span className="text-xs text-hs-text-muted">{labels.from}</span>
        <input
          type="time"
          value={window.startTime ?? ''}
          aria-label={labels.from}
          onChange={(e) => onPatch({ startTime: e.target.value || undefined })}
          className={look.input}
        />
      </label>
      {/* The select is a sibling of the label, not inside it: a label
          wrapping two controls folds the selected option's text into the
          time input's accessible name. */}
      <div className={skin === 'settings' ? undefined : 'flex flex-col gap-0.5'}>
        <label className={labelGap}>
          <span className="text-xs text-hs-text-muted">{labels.until}</span>
          <input
            type="time"
            value={window.endTime ?? ''}
            aria-label={labels.until}
            onChange={(e) => onPatch({ endTime: e.target.value || undefined })}
            className={look.input}
          />
        </label>
        {/* A span has one start day, so its end can be named outright rather
            than counted in days. The keyboard path to the same thing
            dragging the strip's end does. */}
        {shape === 'span' && (
          <select
            aria-label={t('scheduleEditor.endsOnLabel')}
            data-testid={testIds.endDay}
            value={String(spanDays)}
            onChange={(e) => onPatch({ endDayOffset: Number(e.target.value) })}
            className={`${look.input} mt-1`}
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
  );

  /* A native time input ignores `placeholder`, so an empty window reads as
     "--:-- --" and nothing else says that empty means all day. */
  const hints = (
    <>
      <HomeTimeHint className={look.homeHint} />
      <p className={look.hint}>
        {t(wording === 'opened' ? 'scheduleEditor.opened.allDayHint' : 'scheduleEditor.allDayHint')}
      </p>
    </>
  );

  if (grouped) {
    return (
      <>
        <PropertyGroup title={t('scheduleEditor.repeatTitle')} accent={1}>
          {shapeSelect}
        </PropertyGroup>
        <PropertyGroup title={t('scheduleEditor.weekPreviewTitle')} accent={2}>
          {strip}
        </PropertyGroup>
        <PropertyGroup title={t('scheduleEditor.timeWindowTitle')} accent={3}>
          {times}
          {hints}
        </PropertyGroup>
      </>
    );
  }

  return (
    <>
      <label className={labelGap}>
        <span className="text-xs text-hs-text-muted">{t('scheduleEditor.repeatTitle')}</span>
        {shapeSelect}
      </label>
      {strip}
      {times}
      {hints}
    </>
  );
}
