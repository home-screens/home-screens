'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  parseEventDate, parseEventWallTime, formatEventTime, formatCountdown, eventProgress, eventKindLabel,
} from '@/lib/calendar-utils';
import { buildUpNextModel, UP_NEXT_LATER_MAX, type UpNextTimedEvent } from '@/lib/calendar-up-next';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { MapPin } from 'lucide-react';
import type { CalendarViewProps, CalendarWeather, RowCtx } from './view-support';
import { eventSurface, eventBorder } from '@/lib/calendar-event-surface';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';
import { eventGlyph, eventOpacity } from '@/lib/calendar-rules';
import { EventWeatherLine } from './WeatherInline';
import { EventProgressBar, eventAriaLabel } from './list-view-bits';
import { DEFAULT_TIME_FORMAT } from '@/types/config';
import Glyph, { GlyphPrefix } from '@/components/ui/Glyph';
import { sanitizeEventDescription } from '@/lib/event-description';

/**
 * The hallway view: one event rendered huge (what is next, or what is
 * running when nothing else is coming), then short lists for the rest of
 * that day, what already happened today, and tomorrow. The type size is
 * driven by the hero, not a grid, so it reads from across a room.
 */
export function UpNextView({ events, timezone, config, scale, today, now, timeFormat = DEFAULT_TIME_FORMAT, weather, failingSourceIds }: CalendarViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;
  const laterCount = Math.max(0, Math.min(UP_NEXT_LATER_MAX, Math.round(config.upNextLaterCount ?? 3)));
  const showEarlier = config.upNextShowEarlier !== false;
  const showTomorrow = config.upNextShowTomorrow !== false;
  const rowCtx = useMemo<RowCtx>(
    () => ({ t, locale, timeFormat, timezone, scale, fontSize, config }),
    [t, locale, timeFormat, timezone, scale, fontSize, config],
  );

  // The hero/later/earlier/tomorrow selection lives in the lib
  // (buildUpNextModel) so its exclusion edges are unit-tested.
  const model = useMemo(
    () => buildUpNextModel(events, now, today, { timezone, laterCount, showEarlier, showTomorrow }),
    [events, now, today, timezone, laterCount, showEarlier, showTomorrow],
  );
  const { hero, heroIsRunning, heroDay, heroToday, later, running: runningRows, earlier, allDayToday, tomorrowRows, remainingToday, tomorrow } = model;
  const pad = scale.bu * 3.5;
  const sectionGap = scale.bu * 3;
  const isLandscape = scale.orientation === 'landscape';

  // Descriptions make rows taller, and the board is a fixed box: with them
  // on, a full day pushed Tomorrow off the bottom edge with nothing to say
  // it was there. So they degrade by measurement, before paint: the listed
  // rows lose theirs first, then the big card, until the board fits. Level
  // 2 = card and rows, 1 = card only, 0 = none.
  //
  // The level is recorded together with the inputs it was measured under:
  // the events, and every layout input that moves the rows (box size, type
  // size from typography and density, orientation, the weather line, the
  // clock format, the toggle). Any change makes that record stale, and a
  // stale record reads as level 2, so the fresh attempt renders with
  // everything on and is measured from there. (A separate "reset" effect
  // would fire in the same commit as the measurement and net out one step
  // short, leaving a resized board clipped at level 1 for good.)
  const wantDescriptions = config.upNextShowDescription === true;
  const layoutKey = [scale.width, scale.height, fontSize, scale.orientation, weather?.placement ?? 'none', timeFormat, wantDescriptions].join('|');
  const rootRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState({ model, layoutKey, level: 2 });
  const stale = attempt.model !== model || attempt.layoutKey !== layoutKey;
  const descriptionLevel = stale ? 2 : attempt.level;
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!wantDescriptions || descriptionLevel === 0 || !el) return;
    if (el.scrollHeight > el.clientHeight + 1) {
      setAttempt({ model, layoutKey, level: descriptionLevel - 1 });
    }
  }, [wantDescriptions, descriptionLevel, model, layoutKey]);
  const heroDescription = wantDescriptions && descriptionLevel >= 1;
  const rowDescription = wantDescriptions && descriptionLevel >= 2;

  return (
    <div
      ref={rootRef}
      aria-label={t('fullscreen-calendar.viewLabels.upNext')}
      style={{
        height: '100%', overflow: 'hidden', padding: `${scale.bu * 2.5}px ${pad}px 0`,
        // Landscape has barely half the vertical room of portrait at the same
        // base unit, so one column pushed Tomorrow off the bottom edge with
        // nothing to say it had been dropped. Two columns fit the whole board.
        ...(isLandscape
          ? { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: scale.bu * 4, alignItems: 'start' }
          : { display: 'flex', flexDirection: 'column' }),
      }}
    >
      <div style={{ minWidth: 0 }}>
      {/* Date line */}
      <div style={{ flexShrink: 0 }}>
        <div style={{
          fontFamily: "var(--font-dm-serif), 'DM Serif Display', Georgia, serif",
          fontSize: fontSize * 3.6, lineHeight: 1.05, color: 'var(--cal-text-primary)',
        }}>
          {formatDateSync(today, 'EEEE, MMMM d', { locale })}
        </div>
        <div style={{ fontSize: fontSize * 1.9, color: 'var(--cal-text-secondary)', marginTop: scale.bu * 0.6, fontVariantNumeric: 'tabular-nums' }}>
          {formatEventTime(now, timeFormat, locale)}
          {' · '}
          {t('fullscreen-calendar.upNext.moreToday', { count: remainingToday })}
        </div>
      </div>

      {/* All-day banner */}
      {allDayToday.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: scale.bu * 0.8, marginTop: scale.bu * 2, flexShrink: 0 }}>
          {allDayToday.map((ev) => {
            const color = ev.calendarColor ?? DEFAULT_EVENT_COLOR;
            const glyph = eventGlyph(ev);
            const kind = eventKindLabel(ev, today.getFullYear(), t, 'fullscreen-calendar');
            return (
              <div
                key={ev.id}
                className="fsc-event-block"
                data-event-id={ev.id}
                aria-label={eventAriaLabel(t, ev, { allDay: true })}
                style={{
                  ...eventSurface(color, scale, 'chip', { radius: 999 }),
                  padding: `${scale.bu * 0.5}px ${scale.bu * 1.4}px`,
                  fontSize: fontSize * 1.35, fontWeight: 600, color: 'var(--cal-text-primary)',
                  display: 'inline-flex', alignItems: 'center', gap: scale.bu * 0.6,
                  opacity: eventOpacity(ev, 1),
                }}
              >
                {glyph && <span aria-hidden="true"><Glyph value={glyph} /></span>}
                <span>{ev.title}</span>
                <span style={{ fontSize: fontSize * 0.9, color: 'var(--cal-text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {kind ?? t('fullscreen-calendar.allDay')}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Hero */}
      <div style={{ marginTop: scale.bu * 4, flexShrink: 0 }}>
        {hero ? (
          <HeroCard item={hero} running={heroIsRunning} heroToday={heroToday} heroDay={heroDay} now={now} ctx={rowCtx} showDescription={heroDescription} weather={weather} failingSourceIds={failingSourceIds} />
        ) : (
          <div style={{
            borderRadius: scale.bu * 2, padding: `${scale.bu * 3.5}px ${scale.bu * 4}px`,
            background: 'var(--cal-surface)', border: '1px solid var(--cal-border-subtle)', boxShadow: 'var(--cal-card-shadow)',
          }}>
            <div style={{ fontSize: fontSize * 1.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--cal-text-tertiary)' }}>
              {t('fullscreen-calendar.upNext.next')}
            </div>
            <div style={{ fontSize: fontSize * 4.5, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em', marginTop: scale.bu * 1.5, color: 'var(--cal-text-primary)' }}>
              {t('fullscreen-calendar.upNext.nothingElseToday')}
            </div>
          </div>
        )}
      </div>
      </div>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: sectionGap, marginTop: isLandscape ? 0 : sectionGap }}>
      {/* Later on the hero's day */}
      {later.length > 0 && (
        <Section title={heroToday ? t('fullscreen-calendar.upNext.laterToday') : t('fullscreen-calendar.upNext.alsoOn', { day: formatDateSync(heroDay, 'EEEE', { locale }) })} fontSize={fontSize}>
          {later.map((x) => (
            <ListRow key={x.ev.id} item={x} ctx={rowCtx} showDescription={rowDescription} trailing={formatCountdown(x.start, now, locale)} />
          ))}
        </Section>
      )}

      {/* Happening now. Its own heading: a row reading "13 min left" under
          "Earlier today" says it has already finished. */}
      {runningRows.length > 0 && (
        <Section title={t('fullscreen-calendar.upNext.now')} fontSize={fontSize}>
          {runningRows.map((x) => (
            <ListRow key={x.ev.id} item={x} ctx={rowCtx} showDescription={rowDescription}
              trailing={t('fullscreen-calendar.upNext.minutesLeft', { count: Math.max(1, Math.ceil((x.end.getTime() - now.getTime()) / 60_000)) })}
              progress={eventProgress(x.start, x.end, now)} />
          ))}
        </Section>
      )}

      {/* Already finished today */}
      {earlier.length > 0 && (
        <Section title={t('fullscreen-calendar.upNext.earlier')} fontSize={fontSize}>
          {earlier.map((x) => (
            <ListRow key={x.ev.id} item={x} ctx={rowCtx} showDescription={rowDescription} dim trailing={t('fullscreen-calendar.upNext.done')} />
          ))}
        </Section>
      )}

      {/* Tomorrow */}
      {tomorrowRows.length > 0 && (
        <Section title={t('fullscreen-calendar.upNext.tomorrow', { day: formatDateSync(tomorrow, 'EEEE', { locale }) })} fontSize={fontSize}>
          {tomorrowRows.map((ev) => (
            <ListRow
              key={ev.id}
              item={{ ev, start: parseEventWallTime(ev.start, timezone), end: parseEventWallTime(ev.end, timezone) }}
              allDay={ev.allDay}
              ctx={rowCtx} showDescription={rowDescription}
              trailing={ev.sourceName ?? ''}
            />
          ))}
        </Section>
      )}
      </div>
    </div>
  );
}

function Section({ title, fontSize, children }: { title: string; fontSize: number; children: React.ReactNode }) {
  return (
    <div style={{ flexShrink: 0, minHeight: 0 }}>
      <div style={{ fontSize: fontSize * 1.05, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--cal-text-tertiary)', marginBottom: fontSize * 0.9 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: fontSize * 0.7 }}>
        {children}
      </div>
    </div>
  );
}

function HeroCard({ item, running, heroToday, heroDay, now, ctx, showDescription, weather, failingSourceIds }: {
  item: UpNextTimedEvent;
  running: boolean;
  heroToday: boolean;
  heroDay: Date;
  now: Date;
  ctx: RowCtx;
  showDescription: boolean;
  weather?: CalendarWeather;
  failingSourceIds?: ReadonlySet<string>;
}) {
  const { t, locale, timeFormat, scale, fontSize } = ctx;
  const { ev, start, end } = item;
  const color = ev.calendarColor ?? DEFAULT_EVENT_COLOR;
  const bar = eventBorder(color, scale.isDark);
  const progress = running ? eventProgress(start, end, now) : null;
  const countdown = running ? '' : formatCountdown(start, now, locale);
  const startLabel = formatEventTime(start, timeFormat, locale);
  const endLabel = formatEventTime(end, timeFormat, locale);
  const glyph = eventGlyph(ev);
  const saved = ev.sourceId != null && failingSourceIds?.has(ev.sourceId);
  const description = showDescription ? sanitizeEventDescription(ev.description) : '';
  return (
    <div
      className="fsc-event-block fsc-tap-row"
      data-event-id={ev.id}
      role="article"
      aria-label={eventAriaLabel(t, ev, { startLabel, endLabel })}
      style={{
        position: 'relative', overflow: 'hidden',
        ...eventSurface(color, scale, 'block', { radius: scale.bu * 2, washAlpha: 0.14 }),
        padding: `${scale.bu * 3.2}px ${scale.bu * 3.6}px ${scale.bu * 3.6}px ${scale.bu * 4.4}px`,
        boxShadow: 'var(--cal-card-shadow)',
        opacity: eventOpacity(ev, 1),
      }}
    >
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: scale.bu * 0.9, background: bar }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: scale.bu * 1.2, flexWrap: 'wrap' }}>
        <span style={{ fontSize: fontSize * 1.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: bar }}>
          {running ? t('fullscreen-calendar.upNext.now') : heroToday ? t('fullscreen-calendar.upNext.next') : formatDateSync(heroDay, 'EEEE', { locale })}
        </span>
        {countdown && (
          <span style={{
            fontSize: fontSize * 1.6, fontWeight: 600, color: 'var(--cal-on-accent, #fff)', background: 'var(--cal-accent)',
            borderRadius: 999, padding: `${scale.bu * 0.3}px ${scale.bu * 1.4}px`, whiteSpace: 'nowrap',
          }}>
            {countdown}
          </span>
        )}
        {saved && (
          <span style={{ fontSize: fontSize * 1.1, color: 'var(--cal-text-tertiary)' }}>{t('calendar.savedShort')}</span>
        )}
      </div>
      <div style={{
        fontSize: fontSize * 7, fontWeight: 700, lineHeight: 1.02, letterSpacing: '-0.025em', marginTop: scale.bu * 1.8,
        color: 'var(--cal-text-primary)',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word',
      }}>
        <GlyphPrefix value={glyph} />{ev.title}
      </div>
      <div style={{ marginTop: scale.bu * 2.2, fontSize: fontSize * 2.6, lineHeight: 1.35, color: 'var(--cal-text-secondary)' }}>
        <span style={{ color: 'var(--cal-text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{startLabel} {'–'} {endLabel}</span>
        {ev.location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: scale.bu * 0.6 }}>
            <MapPin size={fontSize * 2} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.location}</span>
          </div>
        )}
        {weather && <EventWeatherLine weather={weather} start={parseEventDate(ev.start)} fontSize={fontSize * 2.2} marginTop={scale.bu * 0.4} />}
      </div>
      {description && (
        <div style={{
          marginTop: scale.bu * 1.6, fontSize: fontSize * 2.2, lineHeight: 1.35, color: 'var(--cal-text-secondary)',
          whiteSpace: 'pre-line', wordBreak: 'break-word',
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {description}
        </div>
      )}
      {ev.sourceName && (
        <div style={{ marginTop: scale.bu * 2, display: 'flex', alignItems: 'center', gap: scale.bu * 0.8, fontSize: fontSize * 1.8, color: 'var(--cal-text-secondary)' }}>
          <span aria-hidden="true" style={{ width: fontSize * 1.2, height: fontSize * 1.2, borderRadius: '50%', background: bar, flexShrink: 0 }} />
          {ev.sourceName}
        </div>
      )}
      {progress != null && (
        <div style={{ marginTop: scale.bu * 2.4 }}>
          <EventProgressBar fraction={progress} fontSize={fontSize * 2.6} />
        </div>
      )}
    </div>
  );
}

function ListRow({ item, allDay, ctx, showDescription, trailing, dim, progress }: {
  item: UpNextTimedEvent;
  allDay?: boolean;
  ctx: RowCtx;
  showDescription: boolean;
  trailing?: string;
  dim?: boolean;
  progress?: number | null;
}) {
  const { t, locale, timeFormat, scale, fontSize } = ctx;
  const { ev, start, end } = item;
  const color = ev.calendarColor ?? DEFAULT_EVENT_COLOR;
  const glyph = eventGlyph(ev);
  const startLabel = formatEventTime(start, timeFormat, locale);
  const endLabel = formatEventTime(end, timeFormat, locale);
  const ariaLabel = eventAriaLabel(t, ev, { startLabel, endLabel, allDay });
  // Two clamped lines cannot spare one for a paragraph gap, so blank lines
  // fold into single breaks here (the hero keeps them: it has three lines).
  const description = showDescription ? sanitizeEventDescription(ev.description).replace(/\n+/g, '\n') : '';
  // The time column's width plus the row gap, so the description lines up
  // under the title rather than under the clock.
  const timeColW = fontSize * 9 + scale.bu * 2;
  return (
    <div
      className="fsc-event-block fsc-tap-row"
      data-event-id={ev.id}
      role="article"
      aria-label={ariaLabel}
      style={{
        ...eventSurface(color, scale, 'row', { radius: scale.bu * 1.1 }),
        display: 'flex', flexDirection: 'column',
        padding: `${scale.bu * 1.3}px ${scale.bu * 1.6}px ${scale.bu * 1.3}px ${scale.bu * 2.2}px`,
        borderLeft: `${scale.bu * 0.55}px solid ${eventBorder(color, scale.isDark)}`,
        opacity: eventOpacity(ev, dim ? 'var(--cal-past-opacity)' : 1),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: scale.bu * 2, minWidth: 0 }}>
        <span style={{ fontSize: fontSize * 2, color: 'var(--cal-text-secondary)', fontVariantNumeric: 'tabular-nums', width: fontSize * 9, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {allDay ? t('fullscreen-calendar.allDay') : startLabel}
        </span>
        <span style={{ fontSize: fontSize * 2.5, fontWeight: 600, color: 'var(--cal-text-primary)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <GlyphPrefix value={glyph} />{ev.title}
        </span>
        {ev.location && (
          <span style={{ fontSize: fontSize * 1.6, color: 'var(--cal-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '28%' }}>
            {ev.location}
          </span>
        )}
        {trailing && (
          <span style={{ fontSize: fontSize * 1.5, color: 'var(--cal-text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {trailing}
          </span>
        )}
      </div>
      {description && (
        <div style={{
          marginLeft: timeColW, marginTop: scale.bu * 0.4,
          fontSize: fontSize * 1.6, lineHeight: 1.35, color: 'var(--cal-text-secondary)',
          whiteSpace: 'pre-line', wordBreak: 'break-word',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {description}
        </div>
      )}
      {progress != null && <EventProgressBar fraction={progress} fontSize={fontSize * 1.6} />}
    </div>
  );
}
