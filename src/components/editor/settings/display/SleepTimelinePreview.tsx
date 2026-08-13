'use client';

import { useMemo } from 'react';
import { computeTimelineSegments } from '@/lib/sleep-timeline';
import type { ScheduleWindow, TimelineState } from '@/lib/sleep-timeline';
import { useFormattingLocale, useTranslate } from '@/i18n';

interface SleepTimelinePreviewProps {
  dimWindow?: ScheduleWindow;
  sleepWindow?: ScheduleWindow;
  /** When true the legend notes that idle dimming can kick in at any hour. */
  idleDimEnabled: boolean;
  dimAfterMinutes: number;
}

/**
 * 24-hour preview bar for the sleep settings form: bright / dimmed / off
 * segments computed from the enabled schedule windows. Idle dimming has no
 * fixed clock position, so it appears as a legend note rather than a segment.
 * The colors are fixed (not theme tokens) because they depict the physical
 * display — an amber lit panel, a darkened one, and one that is off — and
 * must read identically in the editor's light and dark themes.
 */
const SEGMENT_CLASSES: Record<TimelineState, string> = {
  bright: 'bg-gradient-to-b from-[#fde68a] to-[#f59e0b]',
  dim: 'bg-[#6b5d3f]',
  off: 'bg-[#111827]',
};

const SWATCH_CLASSES: Record<TimelineState, string> = {
  bright: 'bg-[#f59e0b]',
  dim: 'bg-[#6b5d3f]',
  off: 'bg-[#111827] border border-hs-border-strong',
};

export default function SleepTimelinePreview({
  dimWindow,
  sleepWindow,
  idleDimEnabled,
  dimAfterMinutes,
}: SleepTimelinePreviewProps) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();

  // No memo: the window props are fresh object literals from the parent every
  // render, so a dep-array memo would never hit, and the computation is a
  // handful of comparisons over at most six boundaries.
  const segments = computeTimelineSegments(dimWindow, sleepWindow);

  // 12 AM / 6 AM / 12 PM / 6 PM / 12 AM in en-US; 24-hour locales vary by
  // Intl data — nl/pt/da give bare "00", de appends "Uhr", fr appends "h",
  // es drops the leading zero. All are short enough for the justify-between
  // row. The final tick reuses hour 0 — midnight of the next day.
  const hourLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(formattingLocale, { hour: 'numeric' });
    return [0, 6, 12, 18, 0].map((h) => fmt.format(new Date(2000, 0, 1, h)));
  }, [formattingLocale]);

  const legendStates: TimelineState[] = ['bright', 'dim', 'off'];

  return (
    <div data-testid="sleep-timeline-preview">
      <div className="flex h-6 rounded-md overflow-hidden border border-hs-border-strong">
        {segments.map((seg) => (
          <div
            key={seg.startMin}
            className={SEGMENT_CLASSES[seg.state]}
            style={{ width: `${((seg.endMin - seg.startMin) / 1440) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-hs-text-faint mt-1 px-px">
        {hourLabels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-1.5 text-xs text-hs-text-muted">
        {legendStates.map((state) => (
          <span key={state} className="inline-flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-[3px] ${SWATCH_CLASSES[state]}`} />
            {t(`settings.sleepFormFields.legend.${state}`)}
          </span>
        ))}
        {idleDimEnabled && (
          <span className="text-hs-text-faint">
            {t('settings.sleepFormFields.legend.idleNote', { minutes: dimAfterMinutes })}
          </span>
        )}
      </div>
    </div>
  );
}
