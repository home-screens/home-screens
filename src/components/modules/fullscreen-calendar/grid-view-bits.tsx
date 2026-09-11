'use client';

import { isSameDay } from 'date-fns';
import { formatDateSync, useFormattingLocale, useTranslate } from '@/i18n';
import { birthdayAge } from '@/lib/calendar-utils';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';
import { eventSurface } from '@/lib/calendar-event-surface';
import { eventGlyph, eventOpacity } from '@/lib/calendar-rules';
import type { DayDecor } from '@/lib/calendar-rules';
import { DayBadges } from '../shared/DayBadges';
import Glyph, { GlyphPrefix } from '@/components/ui/Glyph';
import { clampStyle, resolveTodayHighlight } from './view-support';
import type { CalendarScale, CalendarViewProps } from './view-support';
import type { FullscreenCalendarConfig } from '@/types/config';

/**
 * Shared cell content for the fullscreen day-grids (month, rolling weeks):
 * the day-number row, all-day span bars, birthday rows, timed pills and the
 * overflow count. The views keep their own wrappers — borders, fills,
 * opacity and aria belong to the grid that owns them. Extracted verbatim
 * from MonthGridView; the only parameterization is `maxEvents` (the cell's
 * pill budget, computed by each view) and `showMonthName` (rolling grids
 * cross months mid-row, so their 1sts render "MMM d").
 */
export interface GridCellBodyProps {
  day: Date;
  dayEvents: CalendarViewProps['events'];
  /** Total pill budget for the cell; all-day and birthday rows count against it. */
  maxEvents: number;
  /** Render "MMM d" on the 1st of a month (rolling grids only). */
  showMonthName?: boolean;
  fontSize: number;
  scale: CalendarScale;
  config: FullscreenCalendarConfig;
  today: Date;
  /** Per-day rules decor for this cell; the caller needs it for the wrapper too. */
  decor: DayDecor;
}

export function GridCellBody({ day, dayEvents, maxEvents, showMonthName = false, fontSize, scale, config, today, decor }: GridCellBodyProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const wrapTitles = config.wrapEventTitles === true;
  const { showTodayMarker } = resolveTodayHighlight(config);
  const isToday = isSameDay(day, today);
  const marksMonthStart = showMonthName && day.getDate() === 1;

  const allDayEvs = dayEvents.filter(ev => ev.allDay && ev.kind !== 'birthday');
  const birthdayEvs = dayEvents.filter(ev => ev.kind === 'birthday');
  const timedEvs = dayEvents.filter(ev => !ev.allDay);
  const hasBirthday = birthdayEvs.length > 0;
  const maxShow = Math.max(1, maxEvents - allDayEvs.length - birthdayEvs.length);
  const overflow = timedEvs.length > maxShow ? timedEvs.length - maxShow : 0;

  return (
    <>
      {/* Day number */}
      <div className="flex items-center" style={{ gap: scale.bu * 0.15, marginBottom: scale.bu * 0.15 }}>
        {isToday && showTodayMarker ? (
          <span className="fsc-today-pulse" style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: fontSize * 1.5,
            height: fontSize * 1.5,
            borderRadius: '50%',
            background: 'var(--cal-accent)',
            color: 'var(--cal-on-accent, #fff)',
            fontSize: fontSize * 0.8,
            fontWeight: 600,
          }}>
            {formatDateSync(day, 'd', { locale })}
          </span>
        ) : (
          <span style={{
            fontSize: fontSize * 0.85,
            fontWeight: 600,
            color: 'var(--cal-text-primary)',
          }}>
            {marksMonthStart ? formatDateSync(day, 'MMM d', { locale }) : formatDateSync(day, 'd', { locale })}
          </span>
        )}
        {hasBirthday && <span aria-hidden="true" style={{ fontSize: fontSize * 0.7 }}>🎂</span>}
        <DayBadges badges={decor.badges} style={{ fontSize: fontSize * 0.8 }} />
      </div>

      {/* All-day span bars */}
      {allDayEvs.map(ev => {
        const color = ev.calendarColor ?? DEFAULT_EVENT_COLOR;
        const glyph = eventGlyph(ev);
        return (
          <div key={ev.id} className="fsc-event-block" data-event-id={ev.id} style={{
            fontSize: fontSize * 0.55,
            fontWeight: 600,
            color: '#fff',
            padding: `${scale.bu * 0.05}px ${scale.bu * 0.3}px`,
            borderRadius: 2,
            background: color,
            marginBottom: 1,
            opacity: ev.opacity,
            ...clampStyle(wrapTitles),
          }}>
            <GlyphPrefix value={glyph} />{ev.title}
          </div>
        );
      })}

      {/* Birthdays — bold name-first text, no bar/dot */}
      {birthdayEvs.map(ev => {
        const color = ev.calendarColor ?? '#EC4899';
        const age = birthdayAge(ev.birthYear, day.getFullYear());
        const label = age != null
          ? t('fullscreen-calendar.birthdayAgeShort', { age })
          : t('fullscreen-calendar.birthdayShort');
        return (
          <div key={ev.id} className="fsc-event-block" data-event-id={ev.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: scale.bu * 0.2,
            padding: `${scale.bu * 0.05}px ${scale.bu * 0.2}px`,
            marginBottom: 1,
            overflow: 'hidden',
            opacity: eventOpacity(ev, 1),
          }}>
            <span aria-hidden="true" style={{ fontSize: fontSize * 0.55, flexShrink: 0 }}><Glyph value={eventGlyph(ev)} /></span>
            <span style={{
              fontSize: fontSize * 0.55,
              fontWeight: 700,
              color,
              ...clampStyle(wrapTitles),
            }}>
              {ev.title} {label}
            </span>
          </div>
        );
      })}

      {/* Event pills */}
      {timedEvs.slice(0, maxShow).map(ev => {
        const color = ev.calendarColor ?? DEFAULT_EVENT_COLOR;
        const glyph = eventGlyph(ev);
        return (
          <div key={ev.id} className="fsc-event-block" data-event-id={ev.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: scale.bu * 0.2,
            padding: `${scale.bu * 0.05}px ${scale.bu * 0.2}px`,
            marginBottom: 1,
            overflow: 'hidden',
            ...eventSurface(color, scale, 'pill', { radius: 3 }),
            opacity: eventOpacity(ev, 1),
          }}>
            {glyph ? (
              <span aria-hidden="true" style={{ fontSize: fontSize * 0.5, lineHeight: 1, flexShrink: 0 }}><Glyph value={glyph} /></span>
            ) : scale.eventStyle === 'wash' ? (
              // The source-color dot is the only calendar marker a bare
              // `wash` pill has. Under the other styles the surface itself
              // carries the color (a fill or a rule), and a dot would vanish
              // into it or double it up.
              <div style={{
                width: fontSize * 0.35,
                height: fontSize * 0.35,
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
              }} />
            ) : null}
            <span style={{
              fontSize: fontSize * 0.55,
              fontWeight: 500,
              color: 'var(--cal-text-primary)',
              ...clampStyle(wrapTitles),
            }}>
              {ev.title}
            </span>
          </div>
        );
      })}

      {/* Overflow */}
      {overflow > 0 && (
        <div style={{
          fontSize: fontSize * 0.5,
          fontWeight: 600,
          color: 'var(--cal-text-tertiary)',
          padding: `0 ${scale.bu * 0.2}px`,
        }}>
          {t('fullscreen-calendar.moreCount', { count: overflow })}
        </div>
      )}
    </>
  );
}
