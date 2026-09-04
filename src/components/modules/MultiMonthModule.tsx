'use client';

import type { CSSProperties } from 'react';
import { useTZClock } from '@/hooks/useTZClock';
import { useCallback } from 'react';
import { useFitFontSize } from '@/hooks/useFitFontSize';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { useFormattingLocale, formatDateSync } from '@/i18n';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { weekStartsOnFor } from '@/lib/calendar-utils';
import { pickPillTextColor, DEFAULT_CALENDAR_ACCENT } from '@/lib/calendar-color';
import { colorWithAlpha } from '@/lib/module-style';
import type { MultiMonthConfig, ModuleStyle, WeekStartDay, MultiMonthTodayStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';

/**
 * Starting point for the fit, as a fraction of card height. Deliberately above
 * what a card of that height can actually hold (measured: a 900px card fits
 * about 29px, a 1400px one about 46px), so the bisection lands on the real
 * maximum instead of stopping at the number it started from.
 */
const FIT_FACTOR = 0.04;

interface MultiMonthModuleProps {
  config: MultiMonthConfig;
  style: ModuleStyle;
  timezone?: string;
}

// Reference week starting Sunday 2024-01-07 (a known Sunday). Index 0 = Sunday, ... 6 = Saturday.
// We derive the localized short day names ('EEE') from this seed week so the
// headers honour the user's formatting locale instead of being hardcoded English.
const DAY_HEADER_SEED_SUNDAY = new Date(2024, 0, 7);

/**
 * Week rows drawn per month, always. A month naturally spans 4, 5 or 6 weeks,
 * so deriving the count from the date made the number of row elements depend
 * on the wall clock: a display hydrating across a month boundary sent N rows
 * from the server and rendered M on the client, and `suppressHydrationWarning`
 * forgives text and attributes on the element carrying it, never a differing
 * number of children. Pinning it at six also gives every month identical cell
 * heights, which a derived count did not.
 */
export const WEEKS_PER_GRID = 6;

function getDayHeaders(startDay: WeekStartDay, locale: string) {
  const headers: string[] = [];
  const offset = weekStartsOnFor(startDay);
  for (let i = 0; i < 7; i++) {
    const d = new Date(DAY_HEADER_SEED_SUNDAY);
    d.setDate(DAY_HEADER_SEED_SUNDAY.getDate() + i + offset);
    headers.push(formatDateSync(d, 'EEE', { locale }));
  }
  return headers;
}

export function getMonthGrid(year: number, month: number, startDay: WeekStartDay) {
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  let startOffset = firstOfMonth.getDay();
  if (startDay === 'monday') {
    startOffset = startOffset === 0 ? 6 : startOffset - 1;
  }

  const cells: { day: number; current: boolean }[] = [];

  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, current: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true });
  }
  // Pad with next-month days out to a constant 42 cells. Never more than 14
  // are needed, and every month has at least 28 days, so the padding always
  // falls inside the following month.
  for (let d = 1; cells.length < WEEKS_PER_GRID * 7; d++) {
    cells.push({ day: d, current: false });
  }

  return cells;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Opacity of a filled today marker, so the grid behind it still reads through. */
const TODAY_FILL_ALPHA = 0.85;

/**
 * The visual treatment layered onto today's cell. Returned as style overrides
 * spread over the shared day-cell styles, so 'none' is simply an empty patch
 * and today renders exactly like every other day.
 */
function todayMarkerStyle(todayStyle: MultiMonthTodayStyle, accent: string): CSSProperties {
  switch (todayStyle) {
    case 'none':
      return {};
    case 'filled':
    case 'square':
      return {
        background: colorWithAlpha(accent, TODAY_FILL_ALPHA),
        // A light accent (amber, lime) needs dark digits to stay readable —
        // the same auto-contrast pick the calendar modules' pills use.
        color: pickPillTextColor(accent),
        borderRadius: todayStyle === 'square' ? '0.3em' : '50%',
        fontWeight: 700,
      };
    case 'outline':
      return { border: `0.09em solid ${accent}`, color: accent, fontWeight: 700 };
    case 'underline':
      return { borderRadius: 0, borderBottom: `0.12em solid ${accent}`, color: accent, fontWeight: 700 };
    case 'text':
      return { color: accent, fontWeight: 700 };
  }
}

function MonthGrid({
  year,
  month,
  today,
  startDay,
  showWeekNumbers,
  highlightWeekends,
  showAdjacentDays,
  hideMonthLabel,
  reserveHiddenLabel,
  todayStyle,
  todayMarker,
  locale,
}: {
  year: number;
  month: number;
  today: { year: number; month: number; day: number };
  startDay: WeekStartDay;
  showWeekNumbers: boolean;
  highlightWeekends: boolean;
  showAdjacentDays: boolean;
  hideMonthLabel: boolean;
  reserveHiddenLabel: boolean;
  todayStyle: MultiMonthTodayStyle;
  todayMarker: CSSProperties;
  locale: string;
}) {
  const cells = getMonthGrid(year, month, startDay);
  const headers = getDayHeaders(startDay, locale);
  const monthName = formatDateSync(new Date(year, month, 1), 'MMMM', { locale });
  const isCurrentMonth = year === today.year && month === today.month;
  // Only the current month's heading answers to the toggle: the months after it
  // have nothing else naming them.
  //
  // How it disappears depends on the layout. Stacked, the space is reclaimed
  // (`display: none`), which is the point of the setting. Side by side, the
  // months share a row, so collapsing one heading alone lifts that month's
  // whole grid ~1.3em above its neighbours and the columns stop lining up —
  // there the heading only goes invisible and keeps its space.
  const labelStyle: CSSProperties | undefined = hideMonthLabel && isCurrentMonth
    ? (reserveHiddenLabel ? { visibility: 'hidden' } : { display: 'none' })
    : undefined;
  const gridCols = showWeekNumbers ? '1.4em repeat(7, 1fr)' : 'repeat(7, 1fr)';

  // Week numbers for each row
  const weeks: number[] = [];
  if (showWeekNumbers) {
    for (let row = 0; row < WEEKS_PER_GRID; row++) {
      const thursdayIdx = row * 7 + 3;
      const cell = cells[thursdayIdx];
      let cellMonth = month;
      let cellYear = year;
      if (!cell.current && thursdayIdx < 7) {
        cellMonth = month - 1;
        if (cellMonth < 0) { cellMonth = 11; cellYear = year - 1; }
      } else if (!cell.current && thursdayIdx >= 7) {
        cellMonth = month + 1;
        if (cellMonth > 11) { cellMonth = 0; cellYear = year + 1; }
      }
      weeks.push(getISOWeek(new Date(cellYear, cellMonth, cell.day)));
    }
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Month header. Styled out rather than dropped from the tree, so the
          side-by-side layout can still reserve its space (see `labelStyle`).
          The separator goes with it, since the rule reads as an underline for
          the heading and alone would float above the weekday row. */}
      <div className="shrink-0" data-month-label suppressHydrationWarning style={{ paddingBottom: '0.3em', ...labelStyle }}>
        {/* Which months are drawn, which day is "today", and every day number
            come from the wall clock, so the server and the client disagree
            across a midnight (or any pinned-clock) boundary. Suppression has to
            sit on each leaf that carries a clock-derived value: it covers only
            the element it is on, not its descendants. */}
        <span suppressHydrationWarning style={{ fontWeight: 600, fontSize: '0.85em', opacity: isCurrentMonth ? TEXT_OPACITY.primary : TEXT_OPACITY.secondary }}>
          {monthName}
        </span>
        <span suppressHydrationWarning style={{ fontWeight: 400, fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary, marginLeft: '0.4em' }}>
          {year}
        </span>
      </div>

      <div className="shrink-0" suppressHydrationWarning style={{ height: '1px', background: DIVIDER.visible, marginBottom: '0.35em', ...labelStyle }} />

      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '1px' }} className="shrink-0">
        {showWeekNumbers && <div />}
        {headers.map((d, i) => {
          const isWeekend = startDay === 'sunday' ? (i === 0 || i === 6) : (i === 5 || i === 6);
          return (
            <div
              key={i}
              className="text-center"
              style={{
                fontSize: '0.55em',
                lineHeight: '2',
                opacity: highlightWeekends && isWeekend ? 0.25 : TEXT_OPACITY.tertiary,
                fontWeight: 500,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              {d}
            </div>
          );
        })}
      </div>

      {Array.from({ length: WEEKS_PER_GRID }, (_, row) => {
        const rowCells = cells.slice(row * 7, row * 7 + 7);
        // With adjacent days hidden, a trailing row of nothing but next-month
        // days draws no ink, so collapse it to zero height instead of leaving
        // blank space at the bottom of a short month. The row and its seven
        // cells stay in the DOM — removing them would reintroduce the variable
        // child count. The date-dependent `flex` is an attribute on this one
        // element, which suppression does cover.
        const collapsed = !showAdjacentDays && rowCells.every((c) => !c.current);

        return (
          <div
            key={row}
            suppressHydrationWarning
            style={{
              display: 'grid',
              gridTemplateColumns: gridCols,
              gap: '1px',
              flex: collapsed ? '0 0 0px' : 1,
              minHeight: 0,
              overflow: collapsed ? 'hidden' : undefined,
            }}
          >
            {showWeekNumbers && (
              <div
                className="flex items-center justify-center"
                suppressHydrationWarning
                style={{ fontSize: '0.45em', opacity: 0.2, fontVariantNumeric: 'tabular-nums' }}
              >
                {weeks[row]}
              </div>
            )}
            {rowCells.map((cell, col) => {
              const isToday =
                cell.current &&
                year === today.year &&
                month === today.month &&
                cell.day === today.day;

              const isMarkedToday = isToday && todayStyle !== 'none';

              const isWeekend = startDay === 'sunday' ? (col === 0 || col === 6) : (col === 5 || col === 6);
              const visible = cell.current || showAdjacentDays;

              return (
                <div
                  key={col}
                  className="flex items-center justify-center"
                  style={{ minHeight: 0 }}
                >
                  <div
                    className="flex items-center justify-center"
                    suppressHydrationWarning
                    data-today={isToday ? 'true' : undefined}
                    style={{
                      fontSize: '0.65em',
                      fontVariantNumeric: 'tabular-nums',
                      // A marked today stays fully opaque: a weekend accent ring
                      // or colored number rendered at the dim weekend opacity
                      // washes out exactly the day the user wants to spot.
                      opacity: !visible ? 0 : !cell.current ? 0.15 : isMarkedToday ? TEXT_OPACITY.primary : highlightWeekends && isWeekend ? TEXT_OPACITY.dim : TEXT_OPACITY.heading,
                      fontWeight: 400,
                      background: 'transparent',
                      color: 'inherit',
                      borderRadius: '50%',
                      width: '1.75em',
                      // Clamped to the row: the circle is decoration around a
                      // 0.65em number, so letting its full 1.75em set the row's
                      // minimum would drive the fit above to shrink the font long
                      // before the digits were anywhere near colliding.
                      height: 'min(1.75em, 100%)',
                      ...(isToday ? todayMarker : null),
                    }}
                  >
                    {visible ? cell.day : ''}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function MultiMonthModule({ config, style, timezone }: MultiMonthModuleProps) {
  const now = useTZClock(timezone);
  const locale = useFormattingLocale();

  const view = config.view ?? 'vertical';
  const monthCount = config.monthCount ?? 3;
  const startDay = config.startDay ?? 'sunday';
  const showWeekNumbers = config.showWeekNumbers ?? false;
  const highlightWeekends = config.highlightWeekends ?? true;
  const showAdjacentDays = config.showAdjacentDays ?? true;
  const hideMonthLabel = config.showCurrentMonthLabel === false;
  const todayStyle = config.todayStyle ?? 'filled';
  const accentColor = config.accentColor ?? DEFAULT_CALENDAR_ACCENT;
  // Built once per render, not once per day cell — 42 cells per month grid.
  const todayMarker = todayMarkerStyle(todayStyle, accentColor);

  const today = {
    year: now.getFullYear(),
    month: now.getMonth(),
    day: now.getDate(),
  };

  const months: [number, number][] = [];
  for (let i = 0; i < monthCount; i++) {
    const d = new Date(today.year, today.month + i, 1);
    months.push([d.getFullYear(), d.getMonth()]);
  }

  const isHorizontal = view === 'horizontal';

  // Every measurement in a month grid is an em, so the footprint of the whole
  // module is monthCount x 6 rows of a font size that knows nothing about the
  // box it has to fit. Six months side by side at the default font ran each
  // grid's seven columns straight through its neighbour. Measure and scale down
  // instead: horizontal runs out of width first, vertical out of height, and
  // both are caught because the fit checks each axis.
  //
  // What the fit starts from is the `fitToBox` question. Off, it is the raw
  // text size, which the fit can only shrink — so past roughly 600px of card
  // the grid stops at that size and leaves the rest empty. On, it is derived
  // from the card like every other measured module, and the fit lands on the
  // largest size that actually fits. Below that 600px the two are the same
  // picture, because the fit is already the binding constraint there.
  const { containerRef: measureRef, scaledFontSize } = useScaledFontSize(style.fontSize, FIT_FACTOR);
  const desired = config.fitToBox ? scaledFontSize : style.fontSize;
  const { boxRef, contentRef, fontSize } = useFitFontSize(
    desired,
    [view, monthCount, startDay, showWeekNumbers, hideMonthLabel, today.year, today.month].join('|'),
  );
  // One element, measured by both: the fit needs it as its box, the scaler
  // needs its height.
  const setBox = useCallback((el: HTMLDivElement | null) => {
    boxRef.current = el;
    measureRef(el);
  }, [boxRef, measureRef]);

  return (
    <ModuleWrapper style={style}>
      <div ref={setBox} className="w-full h-full overflow-hidden" style={{ fontSize: `${fontSize}px` }}>
        <div
          ref={contentRef}
          className="h-full"
          style={{
            display: 'flex',
            flexDirection: isHorizontal ? 'row' : 'column',
            gap: isHorizontal ? '1.2em' : '0.6em',
          }}
        >
          {months.map(([y, m], idx) => (
            <div
              key={`${y}-${m}`}
              // The constraint is dropped on the stacking axis on purpose: a
              // month allowed to shrink below its own content silently swallows
              // the overflow (columns run through the next month, rows run off
              // the bottom) and the fit above measures only the last month's
              // spill instead of the whole layout's. Held on the other axis,
              // where the block still has to fit the box.
              className={`flex ${isHorizontal ? 'min-h-0' : 'min-w-0'}`}
              style={{
                flex: 1,
                borderLeft: isHorizontal && idx > 0 ? `1px solid ${DIVIDER.strong}` : undefined,
                paddingLeft: isHorizontal && idx > 0 ? '1.2em' : undefined,
                borderTop: !isHorizontal && idx > 0 ? `1px solid ${DIVIDER.default}` : undefined,
                paddingTop: !isHorizontal && idx > 0 ? '0.6em' : undefined,
              }}
            >
              <MonthGrid
                year={y}
                month={m}
                today={today}
                startDay={startDay}
                showWeekNumbers={showWeekNumbers}
                highlightWeekends={highlightWeekends}
                showAdjacentDays={showAdjacentDays}
                hideMonthLabel={hideMonthLabel}
                reserveHiddenLabel={isHorizontal}
                todayStyle={todayStyle}
                todayMarker={todayMarker}
                locale={locale}
              />
            </div>
          ))}
        </div>
      </div>
    </ModuleWrapper>
  );
}
