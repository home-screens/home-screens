'use client';

import { useMemo } from 'react';
import { useTZClock } from '@/hooks/useTZClock';
import { useTranslate, useFormattingLocale } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import type { GarbageDayConfig, GarbageFrequency, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { SectionHeader } from './shared/SectionHeader';
import { TEXT_OPACITY } from '@/lib/constants';
import { getLocalizedDayNames } from '@/lib/meal-constants';

interface GarbageDayModuleProps {
  config: GarbageDayConfig;
  style: ModuleStyle;
  timezone?: string;
}

/**
 * Determines if a given date falls on a collection week.
 * For biweekly: counts weeks since the anchor date; even weeks = collection week.
 */
function isCollectionWeek(now: Date, scheduleDay: number, frequency: GarbageFrequency, startDate: string): boolean {
  if (frequency === 'weekly') return true;
  if (!startDate) return true; // no anchor set, assume every week

  // Normalize both dates to the start of their respective weeks (by schedule day)
  // so we compare whole-week offsets.
  const anchor = new Date(startDate + 'T00:00:00');
  if (isNaN(anchor.getTime())) return true;

  // Get the most recent occurrence of scheduleDay for both dates
  const getWeekStart = (d: Date) => {
    const copy = new Date(d);
    const diff = (copy.getDay() - scheduleDay + 7) % 7;
    copy.setDate(copy.getDate() - diff);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  const anchorWeek = getWeekStart(anchor);
  const currentWeek = getWeekStart(now);

  const diffMs = currentWeek.getTime() - anchorWeek.getTime();
  const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));

  return diffWeeks % 2 === 0;
}

function isHighlighted(
  scheduleDay: number,
  today: number,
  mode: 'day-of' | 'day-before',
  now: Date,
  frequency: GarbageFrequency,
  startDate: string,
): boolean {
  if (scheduleDay < 0) return false;

  if (mode === 'day-of') {
    return today === scheduleDay && isCollectionWeek(now, scheduleDay, frequency, startDate);
  }

  // day-before: check if tomorrow is collection day on a collection week
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDay = tomorrow.getDay();
  return tomorrowDay === scheduleDay && isCollectionWeek(tomorrow, scheduleDay, frequency, startDate);
}

function getStatusText(
  scheduleDay: number,
  today: number,
  mode: 'day-of' | 'day-before',
  now: Date,
  frequency: GarbageFrequency,
  startDate: string,
  tCore: TranslateFn,
): string {
  if (scheduleDay < 0) return '';
  if (isHighlighted(scheduleDay, today, mode, now, frequency, startDate)) {
    return mode === 'day-of' ? tCore('today') : tCore('tomorrow');
  }
  return '';
}

function getNextCollectionText(
  scheduleDay: number,
  now: Date,
  frequency: GarbageFrequency,
  startDate: string,
  dayNames: string[],
  t: TranslateFn,
  tCore: TranslateFn,
): string {
  if (scheduleDay < 0) return '';
  // Walk forward up to 14 days to find the next collection
  for (let i = 1; i <= 14; i++) {
    const future = new Date(now);
    future.setDate(future.getDate() + i);
    if (future.getDay() === scheduleDay && isCollectionWeek(future, scheduleDay, frequency, startDate)) {
      if (i === 1) return tCore('tomorrow');
      if (i <= 6) return dayNames[future.getDay()];
      // `garbage-day.nextDay` assumes the weekday name can be slotted into
      // a single "Next {day}" template. That holds for English and German
      // (both have grammatically uniform weekday gender), but Romance
      // languages may need per-weekday phrasing — if you add such a locale,
      // reshape `nextDay` into a per-weekday key set rather than reusing
      // the shared template.
      return t('garbage-day.nextDay', { day: dayNames[future.getDay()] });
    }
  }
  return dayNames[scheduleDay];
}

function TrashIcon({ active, color }: { active: boolean; color: string }) {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? TEXT_OPACITY.primary : TEXT_OPACITY.tertiary }}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <rect x="5" y="6" width="14" height="15" rx="2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

// Recycling icon (Tabler Icons "recycle" – three chasing arrows)
function RecyclingIcon({ active, color }: { active: boolean; color: string }) {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? TEXT_OPACITY.primary : TEXT_OPACITY.tertiary }}>
      <path d="M12 17l-2 2 2 2" />
      <path d="M10 19h9a2 2 0 0 0 1.75-2.75l-.55-1" />
      <path d="M8.536 11l-.732-2.732-2.732.732" />
      <path d="M7.804 8.268l-4.5 7.794a2 2 0 0 0 1.506 2.89l1.141.048" />
      <path d="M15.464 11l2.732.732.732-2.732" />
      <path d="M18.196 11.732l-4.5-7.794a2 2 0 0 0-3.256-.14l-.591.976" />
    </svg>
  );
}

// Custom / compost / yard waste icon (leaf)
function CustomIcon({ active, color }: { active: boolean; color: string }) {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? TEXT_OPACITY.primary : TEXT_OPACITY.tertiary }}>
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75" />
    </svg>
  );
}

interface WasteRowProps {
  label: string;
  icon: React.ReactNode;
  scheduleDay: number;
  today: number;
  highlightMode: 'day-of' | 'day-before';
  now: Date;
  frequency: GarbageFrequency;
  startDate: string;
  dayNames: string[];
  t: TranslateFn;
  tCore: TranslateFn;
}

function WasteRow({ label, icon, scheduleDay, today, highlightMode, now, frequency, startDate, dayNames, t, tCore }: WasteRowProps) {
  if (scheduleDay < 0) return null;

  const active = isHighlighted(scheduleDay, today, highlightMode, now, frequency, startDate);
  const status = getStatusText(scheduleDay, today, highlightMode, now, frequency, startDate, tCore);
  const nextCollection = !active ? getNextCollectionText(scheduleDay, now, frequency, startDate, dayNames, t, tCore) : '';
  const frequencyKey = frequency === 'biweekly' ? 'garbage-day.frequency.biweekly' : 'garbage-day.frequency.weekly';
  const frequencyText = t(frequencyKey, { day: dayNames[scheduleDay] });

  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2.5"
      style={{
        background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
        border: active ? `1px solid rgba(255,255,255,0.15)` : '1px solid transparent',
      }}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate" style={{ fontSize: '0.95em', opacity: active ? TEXT_OPACITY.primary : TEXT_OPACITY.secondary }}>
          {label}
        </p>
        <p style={{ fontSize: '0.75em', opacity: active ? TEXT_OPACITY.secondary : TEXT_OPACITY.tertiary }}>
          {frequencyText}
        </p>
      </div>
      {active ? (
        <span
          className="px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider shrink-0"
          style={{
            fontSize: '0.6em',
            background: 'rgba(255,255,255,0.15)',
            letterSpacing: '0.05em',
          }}
        >
          {status}
        </span>
      ) : nextCollection ? (
        <span className="shrink-0" style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary }}>
          {nextCollection}
        </span>
      ) : null}
    </div>
  );
}

export default function GarbageDayModule({ config, style, timezone }: GarbageDayModuleProps) {
  const now = useTZClock(timezone, 60_000);
  const today = now.getDay(); // 0=Sun, 6=Sat
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const formattingLocale = useFormattingLocale();
  const dayNames = useMemo(() => getLocalizedDayNames(formattingLocale, 'full'), [formattingLocale]);

  const trashDay = config.trashDay ?? -1;
  const recyclingDay = config.recyclingDay ?? -1;
  const customDay = config.customDay ?? -1;
  const customLabel = config.customLabel || t('garbage-day.labels.yardWaste');
  const highlightMode = config.highlightMode ?? 'day-before';

  return (
    <ModuleWrapper style={style}>
      <div className="flex flex-col h-full">
        {config.showTitle !== false && (
          <SectionHeader className="mb-2">{t('garbage-day.header')}</SectionHeader>
        )}

        <div className="flex flex-col gap-1 flex-1 justify-center">
          <WasteRow
            label={t('garbage-day.labels.trash')}
            icon={<TrashIcon active={isHighlighted(trashDay, today, highlightMode, now, config.trashFrequency ?? 'weekly', config.trashStartDate ?? '')} color={config.trashColor || '#6ee7b7'} />}
            scheduleDay={trashDay}
            today={today}
            highlightMode={highlightMode}
            now={now}
            frequency={config.trashFrequency ?? 'weekly'}
            startDate={config.trashStartDate ?? ''}
            dayNames={dayNames}
            t={t}
            tCore={tCore}
          />
          <WasteRow
            label={t('garbage-day.labels.recycling')}
            icon={<RecyclingIcon active={isHighlighted(recyclingDay, today, highlightMode, now, config.recyclingFrequency ?? 'weekly', config.recyclingStartDate ?? '')} color={config.recyclingColor || '#93c5fd'} />}
            scheduleDay={recyclingDay}
            today={today}
            highlightMode={highlightMode}
            now={now}
            frequency={config.recyclingFrequency ?? 'weekly'}
            startDate={config.recyclingStartDate ?? ''}
            dayNames={dayNames}
            t={t}
            tCore={tCore}
          />
          <WasteRow
            label={customLabel}
            icon={<CustomIcon active={isHighlighted(customDay, today, highlightMode, now, config.customFrequency ?? 'weekly', config.customStartDate ?? '')} color={config.customColor || '#fbbf24'} />}
            scheduleDay={customDay}
            today={today}
            highlightMode={highlightMode}
            now={now}
            frequency={config.customFrequency ?? 'weekly'}
            startDate={config.customStartDate ?? ''}
            dayNames={dayNames}
            t={t}
            tCore={tCore}
          />
        </div>

        {trashDay < 0 && recyclingDay < 0 && customDay < 0 && (
          <p className="text-center" style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.tertiary }}>
            {t('garbage-day.emptyState')}
          </p>
        )}
      </div>
    </ModuleWrapper>
  );
}
