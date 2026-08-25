'use client';

import { useMemo } from 'react';
import { startOfDay } from 'date-fns';
import { useTZClock } from '@/hooks/useTZClock';
import { getThemeTokens } from '@/lib/fullscreen-themes';
import { EventDetailOverlay } from './shared/EventDetailOverlay';
import { CalendarLegend } from './shared/CalendarLegend';
import { rulesNeedNow, selectCalendarEvents } from '@/lib/calendar-rules';
import { isEventUpcoming, listViewCutoff, clampWeeksToShow, isGridView, weekStartsOnFor } from '@/lib/calendar-utils';
import { buildLegend, viewDayWindow, type LegendSource } from '@/lib/calendar-legend';
import { calendarStaleStatus, useFailingSources } from './shared/useFailingSources';
import { useEventTapDetail } from './shared/useEventTapDetail';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { DEFAULT_TIME_FORMAT, type CalendarFetchStatus, type CalendarSourceStatus, type CalendarConfig, type CalendarEvent, type CalendarViewMode, type ModuleStyle, type TimeFormat } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { TEXT_OPACITY } from '@/lib/constants';
import type { EventDisplayStyle } from './calendar/support';
import { DailyView } from './calendar/DailyView';
import { AgendaView } from './calendar/AgendaView';
import { WeekView } from './calendar/WeekView';
import { GridView } from './calendar/grid';

interface CalendarModuleProps {
  config: CalendarConfig;
  style: ModuleStyle;
  events?: CalendarEvent[];
  timezone?: string;
  timeFormat?: TimeFormat;
  calendarStatus?: CalendarFetchStatus;
  /** Attached only while at least one source is failing (see buildModuleProps). */
  sourceStatus?: CalendarSourceStatus[];
}

// Stable fallback so the memoized pipeline below doesn't see a fresh array
// (and re-run) on every render while the shared feed is still loading.
const EMPTY_EVENTS: CalendarEvent[] = [];

const VIEW_COMPONENTS: Record<CalendarViewMode, React.ComponentType<{
  events: CalendarEvent[];
  config: CalendarConfig;
  style: ModuleStyle;
  today: Date;
  now: Date;
  accentColor: string;
  eventStyle: EventDisplayStyle;
}>> = {
  daily: DailyView,
  agenda: AgendaView,
  week: WeekView,
  'multi-week': GridView,
  month: GridView,
};

export default function CalendarModule({ config, style, events, timezone, timeFormat, calendarStatus, sourceStatus }: CalendarModuleProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const rawEvents = events ?? EMPTY_EVENTS;
  const sourceFilter = config.sourceFilter;
  // Sub-minute ticking only while a slot actually needs it: a stalled
  // countdown ("in 1 minute") or progress bar is visible within a render
  // cycle, but the now-rule/dimming below tolerate the default cadence just
  // fine (matches the fullscreen calendar's own NowLine).
  const wantsFastTick = config.showCountdown === true || config.showProgressBar === true;
  const now = useTZClock(timezone, wantsFastTick ? 30_000 : 60_000);
  // Keyed on the ms value, not `now`: `today`'s identity holds until
  // midnight, so memos keyed on it survive the clock ticks.
  const todayMs = startOfDay(now).getTime();
  const today = useMemo(() => new Date(todayMs), [todayMs]);
  // Source filter -> keyword filter -> event rules (the shared
  // selectCalendarEvents pipeline). Memoized so the rule pass (which mints
  // new event objects) only re-runs on a real input change; the clock joins
  // the key only when a rule actually reads it.
  const eventRules = config.eventRules;
  const rulesNow = rulesNeedNow(eventRules) ? now : null;
  const sourcedEvents = useMemo(
    () => selectCalendarEvents(rawEvents, {
      sourceFilter, titleFilter: config.titleFilter, eventRules, timezone, now: rulesNow ?? new Date(0),
    }),
    [rawEvents, sourceFilter, config.titleFilter, eventRules, rulesNow, timezone],
  );
  const viewMode = config.viewMode ?? 'daily';
  // Grid views (week/month/multi-week) show their full visible range, past days
  // included; list views stay upcoming-only even when the shared fetch
  // window was widened for a grid view elsewhere on the display, unless the
  // view opts into keeping events that already ended today: daily's
  // dimPastEvents/showNowRule (dimmed rows, rule positioned after them) and
  // agenda's agendaShowFinishedToday (dimmed rows, ongoing multi-day events
  // re-homed under Today). Gated on the toggles so default rendering is
  // unchanged from before any of them existed.
  const keepFinishedToday =
    (viewMode === 'daily' && (config.dimPastEvents === true || config.showNowRule === true)) ||
    (viewMode === 'agenda' && config.agendaShowFinishedToday === true);
  const allEvents = useMemo(() => {
    if (isGridView(viewMode)) return sourcedEvents;
    const cutoff = listViewCutoff(now, keepFinishedToday);
    return sourcedEvents.filter((ev) => isEventUpcoming(ev, cutoff, timezone));
  }, [sourcedEvents, viewMode, now, keepFinishedToday, timezone]);
  const resolvedTimeFormat = timeFormat ?? DEFAULT_TIME_FORMAT;
  // Legend ring, named stale banner, and per-row "saved" suffixes all key
  // off this shared derivation (see useFailingSources).
  const { failingSources, failingSourceIds, soloFailingName, soloFailingSince } = useFailingSources({
    sourceStatus, sourceFilter, timezone, timeFormat: resolvedTimeFormat, locale, today, t,
  });
  // Legend rows come from the events the current view actually draws — the
  // shared fetch window is wider than any single view, so scope to the
  // view's day range first (agenda has no day bound beyond the upcoming
  // filter). Only the view→window mapping lives here; the date math and the
  // holidays-label remap are shared (calendar-legend).
  const legendPlacement = config.showLegend ?? 'off';
  const legend = useMemo<LegendSource[]>(() => {
    if (legendPlacement === 'off') return [];
    const weekStartsOn = weekStartsOnFor(config.startDay);
    const window =
      viewMode === 'daily' ? viewDayWindow({ kind: 'days', today, weekStartsOn, count: config.daysToShow ?? 3 })
      : viewMode === 'week' ? viewDayWindow({ kind: 'week', today, weekStartsOn })
      : viewMode === 'month' ? viewDayWindow({ kind: 'month-grid', today, weekStartsOn })
      : viewMode === 'multi-week' ? viewDayWindow({ kind: 'weeks', today, weekStartsOn, count: clampWeeksToShow(config.weeksToShow) })
      : null; // agenda
    return buildLegend(allEvents, window, timezone, t('calendar.publicHolidays'));
  }, [legendPlacement, viewMode, config.startDay, config.daysToShow, config.weeksToShow, today, allEvents, timezone, t]);
  const ViewComponent = VIEW_COMPONENTS[viewMode];
  const accentColor = config.accentColor ?? '#3b82f6';
  const gridEventStyle = config.gridEventStyle;
  const gridEventPillBackground = config.gridEventPillBackground;
  // Stable identity across clock ticks so the memoized EventCard's shallow
  // compare holds; only a real settings change produces a new object.
  const eventStyle = useMemo<EventDisplayStyle>(() => {
    const gridStyle = gridEventStyle === 'colored' ? 'colored' : 'classic';
    return {
      timeFormat: resolvedTimeFormat,
      gridStyle,
      pillBackground: gridStyle === 'colored' && gridEventPillBackground === true,
      timezone,
      failingSourceIds,
    };
  }, [resolvedTimeFormat, gridEventStyle, gridEventPillBackground, timezone, failingSourceIds]);

  // Tap-to-open detail: shared delegated-handler hook (see useEventTapDetail).
  // The module renders light-on-dark over a photo background with no theme
  // system, so the overlay uses the Charcoal tokens.
  const tapDetails = config.eventTapDetails === true;
  const { detailEvent, onRootClick, close: closeDetail } = useEventTapDetail(allEvents, tapDetails);

  // Failure ≠ empty: while the shared calendar fetch is failing, kept
  // events get a quiet "saved" line; per-source outages name the failing
  // source. Only a failure with NO successful fetch ever renders the
  // "can't load" message (see calendarStaleStatus).
  const { neverLoaded, statusText } = calendarStaleStatus({
    calendarStatus, failingSources, soloFailingName, soloFailingSince,
    timezone, timeFormat: resolvedTimeFormat, locale, today, t, ns: 'calendar',
  });

  if (neverLoaded) {
    return (
      <ModuleWrapper style={style}>
        <div className="flex items-center justify-center h-full">
          <p style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.tertiary }}>{t('calendar.cantLoadEvents')}</p>
        </div>
      </ModuleWrapper>
    );
  }

  return (
    <ModuleWrapper style={style}>
      <div
        className="h-full flex flex-col"
        data-tap-events={tapDetails ? '' : undefined}
        onClick={onRootClick}
      >
        {tapDetails && <style>{`[data-tap-events] [data-event-id] { cursor: pointer; }`}</style>}
        {statusText && (
          <div className="flex items-center gap-1.5 shrink-0" role="status" style={{ fontSize: '0.6em', marginBottom: 4 }}>
            <span className="rounded-full shrink-0" style={{ width: '0.7em', height: '0.7em', backgroundColor: '#d9a441' }} aria-hidden="true" />
            <span style={{ color: '#d9a441', fontWeight: 600 }}>{statusText}</span>
          </div>
        )}
        {legendPlacement === 'header' && (
          <CalendarLegend
            sources={legend}
            label={t('calendar.legendLabel')}
            failingIds={failingSourceIds}
            // maxHeight ≈ two wrapped rows: in a small module an unbounded
            // legend (8+ sources) could starve the flex-1 view area to zero.
            style={{ flexShrink: 0, fontSize: '0.6em', opacity: 0.85, marginBottom: 6, maxHeight: '3.4em', overflow: 'hidden' }}
          />
        )}
        <div className="flex-1 min-h-0">
          <ViewComponent events={allEvents} config={config} style={style} today={today} now={now} accentColor={accentColor} eventStyle={eventStyle} />
        </div>
        {legendPlacement === 'footer' && (
          <CalendarLegend
            sources={legend}
            label={t('calendar.legendLabel')}
            failingIds={failingSourceIds}
            // maxHeight ≈ two wrapped rows: in a small module an unbounded
            // legend (8+ sources) could starve the flex-1 view area to zero.
            style={{ flexShrink: 0, fontSize: '0.6em', opacity: 0.85, marginTop: 4, paddingTop: 6, borderTop: '1px solid rgba(128,128,128,0.35)', maxHeight: '3.4em', overflow: 'hidden' }}
          />
        )}
      </div>
      {tapDetails && detailEvent && (
        <EventDetailOverlay
          event={detailEvent}
          variant={config.eventTapStyle ?? 'sheet'}
          theme={getThemeTokens('charcoal')}
          accentColor={detailEvent.calendarColor ?? accentColor}
          timeFormat={resolvedTimeFormat}
          timezone={timezone}
          now={now}
          onClose={closeDetail}
        />
      )}
    </ModuleWrapper>
  );
}
