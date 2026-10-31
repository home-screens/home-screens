'use client';

import { useMemo } from 'react';
import { isSameDay } from 'date-fns';
import {
  parseEventWallTime, weekStartsOnFor, formatEventTime,
  bucketEventsForDay, eventStatusSlot, eventKindLabel, isWeekendDay,
  eventRowTimeLabel, withSavedSuffix,
  type EventDaySegment,
} from '@/lib/calendar-utils';
import { sanitizeEventDescription } from '@/lib/event-description';
import { useTranslate, useFormattingLocale, fullDateHeading } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import type { CalendarEvent, CalendarScale, CalendarWeather, CalendarViewProps, RowCtx } from './view-support';
import { DayWeatherBadge, EventWeatherLine } from './WeatherInline';
import { dayCellFill, dayDecorFor, resolveTodayHighlight, useWeekDays } from './view-support';
import { eventSurface } from '@/lib/calendar-event-surface';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';
import { eventGlyph, eventOpacity, mergeCellDecor } from '@/lib/calendar-rules';
import { DayBadges } from '../shared/DayBadges';
import { DayArtLayer } from '../shared/DayArtLayer';
import { CountdownPill, EventProgressBar, eventAriaLabel } from './list-view-bits';
import { formatMealTime, getMealSlotLabelKey, resolveMealTimeFormat, toISODate } from '@/lib/meal-constants';
import { EVERYONE_COLOR, eventOwner, initialsOf } from '@/lib/calendar-people';
import { EventMarker } from '../shared/EventMarker';
import { weekMealLabels, type DayExtras, type ExtrasIndex } from '@/lib/calendar-extras';
import type { MealSlotType, TimeFormat } from '@/types/config';
import Glyph from '@/components/ui/Glyph';
import MealPicture, { mealHasPicture } from '@/components/meals/MealPicture';
import { MealCourseLines } from '../shared/MealCourseLines';
import { DayNoteLines } from '../shared/DayNoteLine';
import { dayNotesFor } from '@/lib/day-notes';

export function WeekListView({ events, timezone, config, scale, today, now, timeFormat, weather, failingSourceIds, owners, extras, dayNotes }: CalendarViewProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;
  const isLandscape = scale.orientation === 'landscape';
  const showDescription = config.weekShowDescription === true;
  const { showTodayBg, showTodayMarker } = resolveTodayHighlight(config);
  const emptyDayText = config.emptyDayText?.trim();
  const rowCtx = useMemo<RowCtx>(
    () => ({ t, locale, timeFormat, timezone, scale, fontSize, config, owners }),
    [t, locale, timeFormat, timezone, scale, fontSize, config, owners],
  );

  const days = useWeekDays(today, weekStartsOnFor(config.startDay));
  // Meal rows: the labels and times the week's rows share a column for, and
  // the serving times in the meal settings' own format when they have one.
  const mealLabels = useMemo(() => (extras ? weekMealLabels(extras, days.map(toISODate)) : null), [extras, days]);
  const mealTimeFormat = resolveMealTimeFormat({ timeFormat: extras?.mealTimeFormat }, timeFormat);

  // Landscape: split the first four and last three days
  const leftDays = isLandscape ? days.slice(0, 4) : days;
  const rightDays = isLandscape ? days.slice(4) : [];

  function renderDay(day: Date) {
    const isToday = isSameDay(day, today);
    const isPast = day < today && !isToday;
    // Middle days of split multi-day events promote to the all-day group.
    const dayEvents = bucketEventsForDay(events, day, timezone);
    const allDayEvs = dayEvents.filter((e) => e.isAllDayRow);
    const timedEvs = dayEvents.filter((e) => !e.isAllDayRow);

    const shouldCollapse = isPast && config.weekCollapsePastDays;
    const dayExtras = extras?.byDate[toISODate(day)];
    const notes = dayNotesFor(dayNotes, day);
    const decor = dayDecorFor(config, day, dayEvents.map(({ ev }) => ev), { today, now, timezone, isDark: scale.isDark });
    const dayFill = dayCellFill(isToday, showTodayBg, isWeekendDay(day), config);

    return (
      <div
        key={day.toISOString()}

        style={mergeCellDecor({
          marginBottom: scale.bu * 0.4,
          opacity: isPast && config.dimPastEvents ? 0.5 : 1,
          background: dayFill,
          borderLeft: isToday && showTodayMarker ? `3px solid var(--cal-accent)` : undefined,
          // Today already insets itself for its accent bar; a weekend-only
          // fill gets its own breathing room instead. No negative margins —
          // the landscape layout puts these groups in columns.
          paddingLeft: isToday && showTodayMarker ? scale.bu * 1.2 : dayFill ? scale.bu * 0.8 : undefined,
          paddingRight: dayFill ? scale.bu * 0.8 : undefined,
          marginLeft: isToday && showTodayMarker ? -scale.bu * 1.5 : undefined,
          borderRadius: dayFill || decor.background || decor.backgroundImage || decor.borderColor ? scale.bu * 0.5 : undefined,
        }, decor)}
      >
        {decor.backgroundImage != null && <DayArtLayer decor={decor} />}
        {/* Day header */}
        <div style={{
          fontFamily: "var(--font-dm-serif), 'DM Serif Display', Georgia, serif",
          fontSize: fontSize * 1.6,
          color: 'var(--cal-text-primary)',
          padding: `${scale.bu * 1.2}px 0 ${scale.bu * 0.5}px`,
          borderBottom: '1px solid var(--cal-border-subtle)',
          marginBottom: scale.bu * 0.7,
          display: 'flex',
          alignItems: 'baseline',
          gap: scale.bu * 0.8,
        }}>
          {fullDateHeading(day, locale)}
          {isToday && showTodayMarker && (
            <span style={{
              fontFamily: "var(--font-inter), 'Inter', system-ui, sans-serif",
              fontSize: fontSize * 0.7,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--cal-accent)',
              background: 'var(--cal-accent-bg)',
              padding: `${scale.bu * 0.15}px ${scale.bu * 0.5}px`,
              borderRadius: 4,
            }}>
              {tCore('today')}
            </span>
          )}
          <DayBadges badges={decor.badges} style={{ fontFamily: "var(--font-inter), 'Inter', system-ui, sans-serif", fontSize: fontSize * 0.9 }} />
          {weather && <DayWeatherBadge weather={weather} day={day} fontSize={fontSize} />}
        </div>

        {!shouldCollapse && (<>
          {/* The family's notes for the day, before anything else on it */}
          {notes.length > 0 && (
            <DayNoteLines
              notes={notes}
              tone="fullscreen"
              lines={3}
              style={{ fontSize: fontSize * 1.235, padding: `${fontSize * 0.46}px ${fontSize * 0.77}px`, margin: `${scale.bu * 0.74}px 0 ${scale.bu * 0.55}px`, borderRadius: 6 }}
            />
          )}

          {/* All-day events (plus promoted middle days) */}
          {allDayEvs.map(({ ev, segment }) => (
            <EventRow key={ev.id} event={ev} segment={segment} rowDate={day} now={now} ctx={rowCtx} weather={weather} isAllDay showDescription={showDescription} failingSourceIds={failingSourceIds} />
          ))}

          {/* Timed events */}
          {timedEvs.map(({ ev, segment }) => (
            <EventRow key={ev.id} event={ev} segment={segment} rowDate={day} now={now} ctx={rowCtx} weather={weather} showDescription={showDescription} failingSourceIds={failingSourceIds} />
          ))}

          {/* Household rows: planned meals, then the day's chore progress */}
          {dayExtras && extras && (
            <DayExtrasRows day={dayExtras} members={extras.members} fontSize={fontSize} scale={scale} hasEvents={dayEvents.length > 0} band={decor.background ?? dayFill} mealLabels={mealLabels} mealTimeFormat={mealTimeFormat} t={t} />
          )}

          {/* Empty day: a note alone already says something */}
          {dayEvents.length === 0 && !dayExtras && notes.length === 0 && (
            <div style={{
              padding: `${scale.bu * 0.7}px 0`,
              fontSize: fontSize * 0.95,
              fontStyle: 'italic',
              color: 'var(--cal-text-tertiary)',
            }}>
              {emptyDayText || t('fullscreen-calendar.noEvents')}
            </div>
          )}
        </>)}
      </div>
    );
  }

  if (isLandscape) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1px 1fr',
        height: '100%',
        gap: 0,
      }}>
        <div style={{
          overflow: 'hidden',
          padding: `0 ${scale.bu * 1.5}px ${scale.bu * 2}px`,
        }}>
          {leftDays.map(renderDay)}
        </div>
        <div style={{ background: 'var(--cal-border)' }} />
        <div style={{
          overflow: 'hidden',
          padding: `0 ${scale.bu * 1.5}px ${scale.bu * 2}px`,
        }}>
          {rightDays.map(renderDay)}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        overflow: 'hidden',
        padding: `0 ${scale.bu * 1.5}px ${scale.bu * 2}px`,
      }}
    >
      {days.map(renderDay)}
    </div>
  );
}

/**
 * Meals and chores under a day's events. The chore row is one aggregate
 * line (done/total, a bar, and stacked initials for everyone with a chore
 * that day): the household has five kids, and a per-kid line each would
 * crowd out the events.
 */
function DayExtrasRows({ day, members, fontSize, scale, hasEvents, band, mealLabels, mealTimeFormat, t }: {
  day: DayExtras;
  members: ExtrasIndex['members'];
  fontSize: number;
  scale: CalendarScale;
  hasEvents: boolean;
  /** The day's own fill (today's tint, a shaded weekend, a day rule's colour), if any. */
  band?: string;
  /** Every slot and serving time the week's meal rows name (see `weekMealLabels`). */
  mealLabels: { slots: MealSlotType[]; times: string[] } | null;
  mealTimeFormat: TimeFormat;
  t: TranslateFn;
}) {
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: scale.bu * 0.8,
    padding: `${scale.bu * 0.45}px ${scale.bu * 0.8}px`,
    borderRadius: 6,
    // The quieter surface with the day's fill laid over it again: a row on
    // today's band stands off the band in the band's own colour, as a row on
    // a plain day stands off the page, instead of a grey block over the tint.
    background: band ? `linear-gradient(${band}, ${band}), var(--cal-surface-alt)` : 'var(--cal-surface-alt)',
    marginTop: scale.bu * 0.35,
  };
  const chores = day.chores;
  const avatarSize = fontSize * 1.3;
  return (
    <div data-day-extras="" style={{ marginTop: hasEvents ? scale.bu * 0.5 : 0, borderTop: hasEvents ? '1px solid var(--cal-border-subtle)' : undefined, paddingTop: hasEvents ? scale.bu * 0.3 : 0 }}>
      {day.meals.map((meal) => {
        // Label, picture, name across; the meal's courses under the name.
        const pictured = mealHasPicture(meal.meal);
        return (
          <div
            key={meal.slot}
            data-day-meal=""
            style={{
              ...rowStyle,
              display: 'grid',
              gridTemplateColumns: pictured ? 'max-content auto minmax(0, 1fr)' : 'max-content minmax(0, 1fr)',
              columnGap: scale.bu * 0.8,
              border: '1px dashed var(--cal-border)',
            }}
          >
            <MealSlotLabel slot={meal.slot} time={meal.time} labels={mealLabels} timeFormat={mealTimeFormat} fontSize={fontSize} t={t} />
            {pictured && (
              <MealPicture meal={meal.meal} photoSize={`${fontSize * 1.75}px`} emojiStyle={{ fontSize, lineHeight: 1 }} />
            )}
            <span style={{ fontSize: fontSize * 1.0, fontWeight: 600, color: 'var(--cal-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {meal.name}
            </span>
            <MealCourseLines
              courses={meal.courses}
              labelSize={`${fontSize * 0.6}px`}
              nameSize={`${fontSize * 0.9}px`}
              gap={`${scale.bu * 0.7}px`}
              rowGap="1px"
              labelStyle={{ color: 'var(--cal-text-tertiary)', fontWeight: 700, letterSpacing: '0.08em' }}
              nameStyle={{ color: 'var(--cal-text-secondary)', fontWeight: 500, lineHeight: 1.3 }}
              style={{ gridColumn: pictured ? 3 : 2, marginTop: 1 }}
            />
          </div>
        );
      })}
      {chores && (
        <div data-day-chores="" style={rowStyle} aria-label={t('fullscreen-calendar.extras.choresDone', { done: chores.done, total: chores.total })}>
          <span style={{ display: 'flex', flexShrink: 0 }} aria-hidden="true">
            {chores.memberIds.map((id, i) => {
              const m = members[id];
              return (
                <span key={id} style={{
                  width: avatarSize, height: avatarSize, borderRadius: '50%',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: m?.color ?? EVERYONE_COLOR, color: '#fff', fontSize: fontSize * 0.55, fontWeight: 700,
                  border: '1.5px solid var(--cal-bg)', marginLeft: i === 0 ? 0 : -avatarSize * 0.3,
                }}>
                  {initialsOf(m?.name ?? '?')}
                </span>
              );
            })}
          </span>
          <span style={{ flex: 1, fontSize: fontSize * 0.95, color: 'var(--cal-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t('fullscreen-calendar.extras.chores')}
          </span>
          <span style={{ fontSize: fontSize * 0.85, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: chores.done === chores.total ? 'var(--cal-accent)' : 'var(--cal-text-primary)' }}>
            {chores.done}/{chores.total}
          </span>
          <span style={{ width: fontSize * 5, height: Math.max(3, fontSize * 0.4), borderRadius: 3, background: 'var(--cal-border)', overflow: 'hidden', flexShrink: 0 }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.round((chores.done / chores.total) * 100)}%`, background: 'var(--cal-accent)' }} />
          </span>
        </div>
      )}
    </div>
  );
}

/** Takes up width and nothing else: no height, nothing to see or read aloud. */
const WIDTH_ONLY: React.CSSProperties = { gridArea: '1 / 1', visibility: 'hidden', height: 0, overflow: 'hidden' };

/**
 * A meal row's first column: the slot's name, and its serving time under it.
 *
 * Each row is its own grid, so a fixed width cannot know how long the words
 * are ("Abendessen" ran into the dish in a column sized for "Dinner"). Every
 * row carries every label and time the week names, unseen and without
 * height, so the column is as wide as the longest in every row and the
 * pictures and names line up down the week.
 */
function MealSlotLabel({ slot, time, labels, timeFormat, fontSize, t }: {
  slot: MealSlotType;
  time?: string;
  labels: { slots: MealSlotType[]; times: string[] } | null;
  timeFormat: TimeFormat;
  fontSize: number;
  t: TranslateFn;
}) {
  const labelStyle: React.CSSProperties = { fontSize: fontSize * 0.65, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' };
  const timeStyle: React.CSSProperties = { fontSize: fontSize * 0.75, fontWeight: 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
  return (
    <span style={{ display: 'grid', alignContent: 'center', color: 'var(--cal-text-tertiary)' }}>
      <span style={{ display: 'grid' }}>
        <span style={{ ...labelStyle, gridArea: '1 / 1' }}>{t(getMealSlotLabelKey(slot))}</span>
        {labels?.slots.filter((s) => s !== slot).map((s) => (
          <span key={s} aria-hidden="true" style={{ ...labelStyle, ...WIDTH_ONLY }}>{t(getMealSlotLabelKey(s))}</span>
        ))}
      </span>
      {(time || (labels?.times.length ?? 0) > 0) && (
        <span style={{ display: 'grid' }}>
          {time && <span data-day-meal-time="" style={{ ...timeStyle, gridArea: '1 / 1' }}>{formatMealTime(time, timeFormat)}</span>}
          {labels?.times.filter((other) => other !== time).map((other) => (
            <span key={other} aria-hidden="true" style={{ ...timeStyle, ...WIDTH_ONLY }}>{formatMealTime(other, timeFormat)}</span>
          ))}
        </span>
      )}
    </span>
  );
}

function EventRow({ event, segment, rowDate, now, ctx, weather, isAllDay, showDescription, failingSourceIds }: {
  event: CalendarEvent;
  segment: EventDaySegment;
  rowDate: Date;
  now: Date;
  ctx: RowCtx;
  weather?: CalendarWeather;
  isAllDay?: boolean;
  showDescription?: boolean;
  failingSourceIds?: ReadonlySet<string>;
}) {
  const { t, locale, timeFormat, timezone, scale, fontSize, config } = ctx;
  const color = event.calendarColor ?? DEFAULT_EVENT_COLOR;
  const start = parseEventWallTime(event.start, timezone);
  const end = parseEventWallTime(event.end, timezone);
  const description = showDescription ? sanitizeEventDescription(event.description) : '';
  const startLabel = formatEventTime(start, timeFormat, locale);
  const endLabel = formatEventTime(end, timeFormat, locale);
  const status = eventStatusSlot({
    start, end, isAllDayRow: isAllDay === true, rowDate, now, locale, segment,
    showCountdown: config.showCountdown === true,
    showProgressBar: config.showProgressBar === true,
    countdownAllDay: config.countdownAllDay === true,
  });
  // Middle days of split multi-day events arrive here with isAllDay set
  // (they promote to the all-day group).
  const timeLabel = withSavedSuffix(
    eventRowTimeLabel({ segment, startLabel, endLabel, t, ns: 'fullscreen-calendar' }),
    event, failingSourceIds, t,
  );
  const glyph = eventGlyph(event);
  const owner = eventOwner(event, ctx.owners);
  const kindLabel = eventKindLabel(event, start.getFullYear(), t, 'fullscreen-calendar');
  // `wash` keeps the original bare row (the surface paints nothing for it);
  // every other style fills the row, which then needs inset padding and a
  // gap so rows stop touching each other. The only view whose original look
  // had no surface at all, hence the only one that adjusts its own layout.
  const filled = scale.eventStyle !== 'wash';

  const ariaLabel = eventAriaLabel(t, event, { startLabel, endLabel, allDay: isAllDay });

  return (
    <div
      className="fsc-event-block fsc-tap-row"
      data-event-id={event.id}
      role="article"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: scale.bu * 0.8,
        padding: filled ? `${scale.bu * 0.7}px ${scale.bu * 0.8}px` : `${scale.bu * 0.7}px 0`,
        marginBottom: filled ? scale.bu * 0.35 : undefined,
        ...eventSurface(color, scale, 'row', { radius: 8 }),
        opacity: eventOpacity(event, 1),
      }}
    >
      {glyph ? (
        <span aria-hidden="true" style={{ width: fontSize * 0.6, textAlign: 'center', flexShrink: 0, marginTop: fontSize * 0.3, fontSize: fontSize * 0.7 }}><Glyph value={glyph} /></span>
      ) : (
        <EventMarker owner={owner} color={color} size={fontSize * 0.6} tagSize={fontSize * 1.3} reserve={ctx.owners !== undefined} style={{ marginTop: ctx.owners ? fontSize * 0.05 : fontSize * 0.35 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: fontSize * 0.8,
          fontWeight: 500,
          color: 'var(--cal-text-tertiary)',
          display: 'flex',
          alignItems: 'center',
          gap: scale.bu * 0.6,
        }}>
          {isAllDay ? (
            <span style={{
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontSize: fontSize * 0.7,
            }}>
              {kindLabel ?? t('fullscreen-calendar.allDay')}
            </span>
          ) : (
            timeLabel
          )}
          {status.countdown && <CountdownPill label={status.countdown} fontSize={fontSize} />}
        </div>
        <div style={{
          fontSize: fontSize * 1.2,
          fontWeight: 500,
          color: 'var(--cal-text-primary)',
        }}>
          {event.title}
        </div>
        {event.location && (
          <div style={{
            fontSize: fontSize * 0.75,
            color: 'var(--cal-text-tertiary)',
            marginTop: 1,
          }}>
            {event.location}
          </div>
        )}
        {!isAllDay && weather && (
          <EventWeatherLine weather={weather} start={event.start} timezone={timezone} fontSize={fontSize} marginTop={2} />
        )}
        {description && (
          <div style={{
            fontSize: fontSize * 0.85,
            color: 'var(--cal-text-secondary)',
            marginTop: scale.bu * 0.25,
            whiteSpace: 'pre-line',
            wordBreak: 'break-word',
            lineHeight: 1.35,
          }}>
            {description}
          </div>
        )}
        {status.progress != null && (
          <EventProgressBar fraction={status.progress} fontSize={fontSize} />
        )}
      </div>
    </div>
  );
}
