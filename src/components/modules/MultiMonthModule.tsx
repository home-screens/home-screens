'use client';

import { useTZClock } from '@/hooks/useTZClock';
import { useFormattingLocale, formatDateSync } from '@/i18n';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { weekStartsOnFor } from '@/lib/calendar-utils';
import type { MultiMonthConfig, ModuleStyle, WeekStartDay } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';

interface MultiMonthModuleProps {
  config: MultiMonthConfig;
  style: ModuleStyle;
  timezone?: string;
}

// Reference week starting Sunday 2024-01-07 (a known Sunday). Index 0 = Sunday, ... 6 = Saturday.
// We derive the localized short day names ('EEE') from this seed week so the
// headers honour the user's formatting locale instead of being hardcoded English.
const DAY_HEADER_SEED_SUNDAY = new Date(2024, 0, 7);
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

function getMonthGrid(year: number, month: number, startDay: WeekStartDay) {
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
  const remainder = cells.length % 7;
  if (remainder > 0) {
    const fill = 7 - remainder;
    for (let d = 1; d <= fill; d++) {
      cells.push({ day: d, current: false });
    }
  }

  return cells;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function MonthGrid({
  year,
  month,
  today,
  startDay,
  showWeekNumbers,
  highlightWeekends,
  showAdjacentDays,
  locale,
}: {
  year: number;
  month: number;
  today: { year: number; month: number; day: number };
  startDay: WeekStartDay;
  showWeekNumbers: boolean;
  highlightWeekends: boolean;
  showAdjacentDays: boolean;
  locale: string;
}) {
  const cells = getMonthGrid(year, month, startDay);
  const headers = getDayHeaders(startDay, locale);
  const monthName = formatDateSync(new Date(year, month, 1), 'MMMM', { locale });
  const isCurrentMonth = year === today.year && month === today.month;
  const gridCols = showWeekNumbers ? '1.4em repeat(7, 1fr)' : 'repeat(7, 1fr)';

  // Week numbers for each row
  const weeks: number[] = [];
  if (showWeekNumbers) {
    for (let row = 0; row < cells.length / 7; row++) {
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

  const rows = cells.length / 7;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Month header */}
      <div className="shrink-0" style={{ paddingBottom: '0.3em' }}>
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

      {/* Thin separator line */}
      <div className="shrink-0" style={{ height: '1px', background: DIVIDER.visible, marginBottom: '0.35em' }} />

      {/* Day-of-week headers */}
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

      {/* Day rows */}
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '1px', flex: 1, minHeight: 0 }}
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
          {cells.slice(row * 7, row * 7 + 7).map((cell, col) => {
            const isToday =
              cell.current &&
              year === today.year &&
              month === today.month &&
              cell.day === today.day;

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
                  style={{
                    fontSize: '0.65em',
                    fontVariantNumeric: 'tabular-nums',
                    opacity: !visible ? 0 : !cell.current ? 0.15 : highlightWeekends && isWeekend ? TEXT_OPACITY.dim : TEXT_OPACITY.heading,
                    fontWeight: isToday ? 700 : 400,
                    background: isToday ? 'rgba(59,130,246,0.85)' : 'transparent',
                    color: isToday ? '#fff' : 'inherit',
                    borderRadius: '50%',
                    width: '1.75em',
                    height: '1.75em',
                  }}
                >
                  {visible ? cell.day : ''}
                </div>
              </div>
            );
          })}
        </div>
      ))}
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

  return (
    <ModuleWrapper style={style}>
      <div
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
            className="flex min-h-0 min-w-0"
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
              locale={locale}
            />
          </div>
        ))}
      </div>
    </ModuleWrapper>
  );
}
