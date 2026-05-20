'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ChoreMember, ChoreDefinition } from '@/types/config';
import {
  CHORE_HISTORY_DAYS,
  addDaysISO,
  addMonthsClamped,
  computeDayEntries,
  parseISO,
  type DayEntry,
} from '@/components/modules/chore-chart/types';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { getLocalizedDayNames } from '@/lib/meal-constants';

interface ChoreHistoryNavProps {
  /** Currently-viewed date as YYYY-MM-DD. */
  viewingDate: string;
  /** Real "today" as YYYY-MM-DD, flipped at midnight by the parent. */
  realToday: string;
  members: ChoreMember[];
  chores: ChoreDefinition[];
  completionSet: Set<string>;
  accentColor: string;
  onSelect: (date: string) => void;
}

export default function ChoreHistoryNav({
  viewingDate,
  realToday,
  members,
  chores,
  completionSet,
  accentColor,
  onSelect,
}: ChoreHistoryNavProps) {
  const locale = useFormattingLocale();
  const t = useTranslate('remote');

  // Single-letter day-of-week labels (0=Sunday … 6=Saturday) derived from
  // the formatting locale's short day names. Taking the first character of
  // `EEE` keeps the strip's narrow 52px tiles tight while still localizing
  // — German "Mo/Di/Mi" collapses to "M/D/M", matching calendar conventions.
  const dayLetters = useMemo(
    () => getLocalizedDayNames(locale, 'short').map((name) => name.charAt(0)),
    [locale],
  );

  // Locale-aware formatters — re-derived only when the locale changes.
  // Keeping them here (instead of module scope) is what makes the
  // surrounding tile/banner labels honor the household's
  // formattingLocale at runtime instead of freezing at import time.
  const monthLong = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
    [locale],
  );
  const dateLong = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    [locale],
  );

  // Earliest visible date = realToday − (CHORE_HISTORY_DAYS − 1)
  const earliestDate = useMemo(
    () => addDaysISO(realToday, -(CHORE_HISTORY_DAYS - 1)),
    [realToday],
  );

  const days = useMemo<DayEntry[]>(
    () => computeDayEntries(earliestDate, realToday, members, chores, completionSet),
    [earliestDate, realToday, members, chores, completionSet],
  );

  // Pre-compute presentation labels once per data change so the tile render loop
  // doesn't re-format 90 dates on every parent re-render.
  const dayLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const day of days) {
      map.set(day.date, dateLong.format(parseISO(day.date)));
    }
    return map;
  }, [days, dateLong]);

  // Month label derived from viewingDate (not realToday) so the header follows navigation.
  const monthLabel = useMemo(() => monthLong.format(parseISO(viewingDate)), [viewingDate, monthLong]);

  // Prev/next-month disabled state
  const prevDisabled = useMemo(() => {
    const viewing = parseISO(viewingDate);
    // Prev is disabled if the last day of the previous month is before `earliestDate`.
    const lastOfPrevMonth = new Date(viewing.getFullYear(), viewing.getMonth(), 0);
    const iso = `${lastOfPrevMonth.getFullYear()}-${String(lastOfPrevMonth.getMonth() + 1).padStart(2, '0')}-${String(lastOfPrevMonth.getDate()).padStart(2, '0')}`;
    return iso < earliestDate;
  }, [viewingDate, earliestDate]);

  const nextDisabled = useMemo(() => {
    const viewing = parseISO(viewingDate);
    const today = parseISO(realToday);
    // Next is disabled when we're already in the realToday month (no future month within window).
    return (
      viewing.getFullYear() === today.getFullYear() &&
      viewing.getMonth() === today.getMonth()
    );
  }, [viewingDate, realToday]);

  const isViewingToday = viewingDate === realToday;

  // Refs for scroll-into-view centering
  const stripRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const hasScrolledInitialRef = useRef(false);

  useEffect(() => {
    const strip = stripRef.current;
    const tile = tileRefs.current.get(viewingDate);
    if (!strip || !tile) return;

    // Compute the scrollLeft that puts `tile` horizontally centered inside `strip`,
    // working off bounding rects so we don't depend on offsetParent layout.
    const stripRect = strip.getBoundingClientRect();
    const tileRect = tile.getBoundingClientRect();
    const tileCenterRelativeToStripLeft =
      (tileRect.left - stripRect.left) + tile.clientWidth / 2;
    const target = strip.scrollLeft + tileCenterRelativeToStripLeft - strip.clientWidth / 2;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (!hasScrolledInitialRef.current || prefersReducedMotion) {
      strip.scrollLeft = target;
    } else {
      strip.scrollTo({ left: target, behavior: 'smooth' });
    }
    hasScrolledInitialRef.current = true;
  }, [viewingDate, days.length]);

  const handlePrevMonth = () => {
    if (prevDisabled) return;
    onSelect(addMonthsClamped(viewingDate, -1, earliestDate, realToday));
  };
  const handleNextMonth = () => {
    if (nextDisabled) return;
    onSelect(addMonthsClamped(viewingDate, 1, earliestDate, realToday));
  };

  return (
    <div>
      {/* Month row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '8px 0 6px',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--hs-text-primary)' }}>{monthLabel}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={handlePrevMonth}
            disabled={prevDisabled}
            aria-label={t('choreHistoryNav.prevMonthAriaLabel')}
            className="press-scale"
            style={{
              width: 44,
              height: 44,
              minWidth: 44,
              borderRadius: 12,
              border: 'none',
              cursor: prevDisabled ? 'default' : 'pointer',
              background: prevDisabled ? 'var(--hs-bg-card)' : 'var(--hs-bg-hover)',
              color: prevDisabled ? 'var(--hs-text-faint)' : 'var(--hs-text-body)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: prevDisabled ? 0.6 : 1,
            }}
          >
            <ChevronLeft size={20} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            disabled={nextDisabled}
            aria-label={t('choreHistoryNav.nextMonthAriaLabel')}
            className="press-scale"
            style={{
              width: 44,
              height: 44,
              minWidth: 44,
              borderRadius: 12,
              border: 'none',
              cursor: nextDisabled ? 'default' : 'pointer',
              background: nextDisabled ? 'var(--hs-bg-card)' : 'var(--hs-bg-hover)',
              color: nextDisabled ? 'var(--hs-text-faint)' : 'var(--hs-text-body)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: nextDisabled ? 0.6 : 1,
            }}
          >
            <ChevronRight size={20} strokeWidth={2.25} />
          </button>
          {!isViewingToday && (
            <button
              type="button"
              onClick={() => onSelect(realToday)}
              aria-label={t('choreHistoryNav.jumpToTodayAriaLabel')}
              className="press-scale"
              style={{
                padding: '0 14px',
                minHeight: 44,
                height: 44,
                borderRadius: 12,
                border: 'none',
                cursor: 'pointer',
                background: accentColor,
                color: 'var(--hs-bg-body)',
                fontSize: 13,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {t('choreHistoryNav.todayButton')}
            </button>
          )}
        </div>
      </div>

      {/* Day strip */}
      <div
        ref={stripRef}
        className="scrollbar-none"
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          padding: '4px 0 12px',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none' as const,
          WebkitOverflowScrolling: 'touch' as const,
        }}
      >
        {days.map((day) => {
          const isSelected = day.date === viewingDate;
          const isToday = day.date === realToday;
          const hasData = day.total > 0;
          const isPerfect = hasData && day.earned === day.total;
          const isPartialGood = hasData && day.total > 1 && day.earned === day.total - 1;

          const fracColor = isPerfect
            ? accentColor
            : isPartialGood
              ? '#fbbf24'
              : 'var(--hs-text-faint)';

          const numColor = isSelected ? accentColor : 'var(--hs-text-primary)';
          const longLabel = dayLabels.get(day.date) ?? '';
          const ariaLabel = hasData
            ? t('choreHistoryNav.tileAriaLabel', {
                date: longLabel,
                earned: day.earned,
                total: day.total,
              })
            : t('choreHistoryNav.tileAriaLabelEmpty', { date: longLabel });

          return (
            <button
              key={day.date}
              ref={(el) => {
                if (el) tileRefs.current.set(day.date, el);
                else tileRefs.current.delete(day.date);
              }}
              type="button"
              className="press-scale"
              onClick={() => onSelect(day.date)}
              aria-label={ariaLabel}
              aria-current={isSelected ? 'date' : undefined}
              style={{
                flex: '0 0 auto',
                width: 52,
                minHeight: 72,
                padding: '8px 0 6px',
                borderRadius: 12,
                background: isSelected ? 'color-mix(in srgb, var(--hs-warning) 18%, transparent)' : 'var(--hs-bg-card)',
                border: 'none',
                // Use boxShadow (not outline) for the selection ring so the browser's
                // focus-visible outline remains available for keyboard users.
                boxShadow: isSelected ? `inset 0 0 0 1.5px ${accentColor}` : 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                scrollSnapAlign: 'center',
                cursor: 'pointer',
                position: 'relative',
                color: 'inherit',
                fontFamily: 'inherit',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--hs-text-faint)',
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  lineHeight: 1,
                }}
              >
                {dayLetters[day.dayOfWeek]}
              </span>
              <span
                style={{
                  fontSize: 18,
                  color: numColor,
                  fontWeight: 700,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums' as const,
                }}
              >
                {day.dayOfMonth}
              </span>
              {hasData ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: fracColor,
                    fontVariantNumeric: 'tabular-nums' as const,
                    lineHeight: 1,
                    letterSpacing: '0.02em',
                  }}
                >
                  <span>{day.earned}</span>
                  <span style={{ opacity: 0.55, fontWeight: 600 }}>/{day.total}</span>
                </span>
              ) : (
                // Keep vertical rhythm so all tiles are the same height.
                <span style={{ fontSize: 10, lineHeight: 1, visibility: 'hidden' as const }}>0/0</span>
              )}
              {isToday && !isSelected && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 4,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 4,
                    height: 4,
                    borderRadius: 999,
                    background: accentColor,
                  }}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
