'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { ChoreMember, ChoreDefinition } from '@/types/config';
import {
  CHORE_HISTORY_DAYS,
  addDaysISO,
  computeDayEntries,
  parseISO,
  type DayEntry,
} from '@/components/modules/chore-chart/types';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { getLocalizedDayNames } from '@/lib/meal-constants';

/** Days shown before anyone asks for more. Two weeks covers "did she do it last Tuesday". */
export const DEFAULT_HISTORY_WINDOW_DAYS = 14;
/** How many more days each tap of "Earlier" reveals. */
const REVEAL_STEP_DAYS = 30;

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

/**
 * The grown-up's day strip on /remote: a scrollable row of day tiles for
 * looking back and backdating. Starts at two weeks and grows on request, so
 * the strip stops being the biggest thing on the page. A tile shows its
 * fraction only on days someone actually checked something off; a caption
 * under the strip spells the selected day's fraction out in words, because
 * "2/6" on its own reads as "two chores done" to everyone but the author.
 */
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

  const [windowDays, setWindowDays] = useState(DEFAULT_HISTORY_WINDOW_DAYS);
  const canRevealMore = windowDays < CHORE_HISTORY_DAYS;

  // Single-letter day-of-week labels (0=Sunday … 6=Saturday) derived from
  // the formatting locale's short day names. Taking the first character of
  // `EEE` keeps the strip's narrow 52px tiles tight while still localizing
  // — German "Mo/Di/Mi" collapses to "M/D/M", matching calendar conventions.
  const dayLetters = useMemo(
    () => getLocalizedDayNames(locale, 'short').map((name) => name.charAt(0)),
    [locale],
  );

  // Locale-aware formatters — re-derived only when the locale changes.
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
  const dateShort = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }),
    [locale],
  );

  // Earliest visible date = realToday − (windowDays − 1). A viewing date that
  // is older than the window (the parent can park on any day) pulls the
  // window out far enough to include it.
  const earliestDate = useMemo(() => {
    const byWindow = addDaysISO(realToday, -(windowDays - 1));
    return viewingDate < byWindow ? viewingDate : byWindow;
  }, [realToday, windowDays, viewingDate]);

  const days = useMemo<DayEntry[]>(
    () => computeDayEntries(earliestDate, realToday, members, chores, completionSet),
    [earliestDate, realToday, members, chores, completionSet],
  );

  // Pre-compute presentation labels once per data change so the tile render loop
  // doesn't re-format dates on every parent re-render.
  const dayLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const day of days) {
      map.set(day.date, dateLong.format(parseISO(day.date)));
    }
    return map;
  }, [days, dateLong]);

  // Month label derived from viewingDate (not realToday) so the header follows navigation.
  const monthLabel = useMemo(() => monthLong.format(parseISO(viewingDate)), [viewingDate, monthLong]);

  const isViewingToday = viewingDate === realToday;
  const selected = useMemo(() => days.find((d) => d.date === viewingDate), [days, viewingDate]);

  const caption = (() => {
    if (!selected || selected.total === 0) return null;
    if (isViewingToday) {
      return t('choreHistoryNav.captionToday', { earned: selected.earned, total: selected.total });
    }
    const date = dateShort.format(parseISO(selected.date));
    return selected.anyDone
      ? t('choreHistoryNav.captionPast', { date, earned: selected.earned, total: selected.total })
      : t('choreHistoryNav.captionPastNone', { date });
  })();

  // Refs for scroll-into-view centering
  const stripRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const hasScrolledInitialRef = useRef(false);
  // Set when "Earlier" was tapped: the date that used to be the first tile.
  // After the strip grows, scroll so that tile sits at the right edge, which
  // puts the newly revealed days on screen instead of snapping back to today.
  const revealAnchorRef = useRef<string | null>(null);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const anchor = revealAnchorRef.current;
    if (anchor) {
      revealAnchorRef.current = null;
      const anchorTile = tileRefs.current.get(anchor);
      if (anchorTile) {
        const stripRect = strip.getBoundingClientRect();
        const tileRect = anchorTile.getBoundingClientRect();
        const target = strip.scrollLeft + (tileRect.right - stripRect.left) - strip.clientWidth;
        strip.scrollLeft = Math.max(0, target);
      }
      return;
    }

    const tile = tileRefs.current.get(viewingDate);
    if (!tile) return;

    // Compute the scrollLeft that puts `tile` horizontally centered inside `strip`,
    // working off bounding rects so we don't depend on offsetParent layout.
    const stripRect = strip.getBoundingClientRect();
    const tileRect = tile.getBoundingClientRect();
    const tileCenterRelativeToStripLeft =
      (tileRect.left - stripRect.left) + tile.clientWidth / 2;
    const target = strip.scrollLeft + tileCenterRelativeToStripLeft - strip.clientWidth / 2;

    if (!hasScrolledInitialRef.current || prefersReducedMotion) {
      strip.scrollLeft = target;
    } else {
      strip.scrollTo({ left: target, behavior: 'smooth' });
    }
    hasScrolledInitialRef.current = true;
  }, [viewingDate, days.length]);

  const handleRevealMore = () => {
    if (!canRevealMore) return;
    revealAnchorRef.current = earliestDate;
    setWindowDays((d) => Math.min(CHORE_HISTORY_DAYS, d + REVEAL_STEP_DAYS));
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '8px 0 6px',
          gap: 8,
          minHeight: 44,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--hs-text-primary)' }}>{monthLabel}</div>
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

      <div
        ref={stripRef}
        className="scrollbar-none"
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          padding: '4px 0 8px',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none' as const,
          WebkitOverflowScrolling: 'touch' as const,
        }}
      >
        {canRevealMore && (
          <button
            type="button"
            className="press-scale"
            onClick={handleRevealMore}
            style={{
              flex: '0 0 auto',
              width: 52,
              minHeight: 72,
              padding: '8px 0 6px',
              borderRadius: 12,
              background: 'transparent',
              border: '1px dashed var(--hs-border-strong)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              scrollSnapAlign: 'start',
              cursor: 'pointer',
              color: 'var(--hs-text-faint)',
              fontFamily: 'inherit',
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase' as const,
              lineHeight: 1.2,
            }}
          >
            <ChevronLeft size={16} strokeWidth={2.25} aria-hidden="true" />
            {t('choreHistoryNav.earlierButton')}
          </button>
        )}

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
              {hasData && day.anyDone ? (
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

      {caption && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--hs-text-faint)',
            padding: '0 2px 8px',
            lineHeight: 1.4,
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
