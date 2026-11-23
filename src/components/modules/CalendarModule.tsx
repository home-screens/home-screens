'use client';

import { useCallback, useMemo, useState } from 'react';
import { addDays, startOfDay, startOfWeek } from 'date-fns';
import { useTZClock } from '@/hooks/useTZClock';
import { getThemeTokens } from '@/lib/fullscreen-themes';
import { DEFAULT_CALENDAR_ACCENT } from '@/lib/calendar-color';
import { CalendarLegend } from './shared/CalendarLegend';
import { rulesNeedNow, selectCalendarEvents } from '@/lib/calendar-rules';
import { isEventUpcoming, listViewCutoff, clampRollingWeeks, clampWeeksToShow, isGridView, weekStartsOnFor } from '@/lib/calendar-utils';
import { buildLegendRows, viewDayWindow, type LegendRow } from '@/lib/calendar-legend';
import { ownerBySource, peopleSelection } from '@/lib/calendar-people';
import type { FamilyGroup } from '@/types/family';
import { calendarStatusView, useFailingSources, type CalendarSetupNeed } from './shared/useFailingSources';
import { CalendarSetupCard } from './shared/CalendarSetupCard';
import { useEventTapDetail } from './shared/useEventTapDetail';
import { CalendarTapOverlays } from './shared/CalendarTapOverlays';
import { useWallCalendarAdding } from './shared/useWallCalendarAdding';
import { DaySheetContext, useDaySheet } from './shared/useDaySheet';
import { useTranslate, useFormattingLocale } from '@/i18n';
import type { CalendarFetchStatus, CalendarSourceStatus, CalendarConfig, CalendarEvent, CalendarPerson, CalendarViewMode, ModuleStyle, TimeFormat } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleLoadingState, ModuleNotUpdatingState } from './ModuleStates';
import type { EventDisplayStyle } from './calendar/support';
import { DailyView } from './calendar/DailyView';
import { AgendaView } from './calendar/AgendaView';
import { WeekView } from './calendar/WeekView';
import { GridView } from './calendar/grid';
import { householdTimeFormat } from '@/lib/clock-time';
import { useDayNotes } from '@/hooks/useDayNotes';
import { hasDayNoteInWindow, type DayNotes } from '@/lib/day-notes';
import { wallScrollOn } from '@/lib/wall-scroll-views';
import { calendarLookAhead, lookAheadReach } from '@/lib/look-ahead';
import { formatDayRange } from '@/i18n/formatters';
import { useLookAhead } from './shared/useLookAhead';
import { LookAheadBar, LookAheadContext } from './shared/LookAhead';
import { useElementBox } from '@/hooks/useElementBox';
import { CARD_VIEW_BUTTONS } from './calendar/view-buttons';
import { useWallCalendarSwitch } from './shared/useWallCalendarSwitch';
import { CalendarSwitchBar } from './shared/CalendarSwitchBar';
import { WallPersonSheet } from './shared/WallPersonSheet';
import {
  CALENDAR_CARD_VIEW_ORDER, CARD_SWITCH_MIN_HEIGHT, livePick, offersPersonPicker, personEventCounts, wallPeopleChoices, wallSwitchedConfig, wallViewChoices,
} from '@/lib/calendar-wall-switch';

interface CalendarModuleProps {
  config: CalendarConfig;
  style: ModuleStyle;
  events?: CalendarEvent[];
  timezone?: string;
  timeFormat?: TimeFormat;
  calendarStatus?: CalendarFetchStatus;
  /** Attached only while the display's first calendar fetch is still out (see buildModuleProps). */
  calendarLoading?: boolean;
  /** Attached only while at least one source is failing (see buildModuleProps). */
  sourceStatus?: CalendarSourceStatus[];
  /** Attached only while Settings > Calendar names nothing to fetch (see buildModuleProps). */
  calendarSetup?: CalendarSetupNeed;
  /** People with assigned calendars from Settings > Family (see buildModuleProps). */
  people?: CalendarPerson[];
  /** Family groups, for the color key and the people filter (see buildModuleProps). */
  groups?: FamilyGroup[];
  /** Roster fetch state while calendar owners exist; a filtered module holds its events until it settles. */
  peopleState?: 'loading' | 'failed';
  /** Only on a real display (see the registry's `needsInstanceAddress`); the editor preview has none. */
  screenId?: string;
  moduleId?: string;
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
  /** The day the view draws from: `today` at rest, another week (or month, or days) with the look-ahead arrows. */
  anchor: Date;
  /** Stepped to another period: someone chose to look, so nothing in it is dimmed as past. */
  stepped: boolean;
  accentColor: string;
  eventStyle: EventDisplayStyle;
  dayNotes: DayNotes;
  /** A finger scrolls the list views (Agenda, Daily); the grids ignore it. */
  scroll: boolean;
}>> = {
  daily: DailyView,
  agenda: AgendaView,
  week: WeekView,
  'multi-week': GridView,
  month: GridView,
  rolling: GridView,
};

export default function CalendarModule({ config: savedConfig, style, events, timezone, timeFormat, calendarStatus, calendarLoading, sourceStatus, calendarSetup, people, groups, peopleState, screenId, moduleId }: CalendarModuleProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const rawEvents = events ?? EMPTY_EVENTS;

  // On a touch wall the family can borrow another of the views the editor
  // offered, and show one person, for a minute (useWallCalendarSwitch), on a
  // card tall enough for the buttons. From here on `config` is the calendar
  // as it is drawn right now; at rest it is the saved config itself.
  const [boxRef, box] = useElementBox<HTMLDivElement>();
  // Measured first: a short card never flashes the buttons before it knows.
  const tallEnough = box.height > 0 && box.height + 2 * style.padding >= CARD_SWITCH_MIN_HEIGHT;
  const switchOnWall = wallScrollOn(savedConfig.eventTapDetails === true, screenId, moduleId) && tallEnough;
  const homeView = savedConfig.viewMode ?? 'daily';
  const editorSelection = useMemo(
    () => peopleSelection(savedConfig.peopleFilter, people, groups, peopleState),
    [savedConfig.peopleFilter, people, groups, peopleState],
  );
  const peopleChoices = useMemo(() => wallPeopleChoices(people, groups, editorSelection), [people, groups, editorSelection]);
  const viewChoices = useMemo(() => wallViewChoices(homeView, savedConfig.wallViews, CALENDAR_CARD_VIEW_ORDER), [homeView, savedConfig.wallViews]);
  const personOffered = switchOnWall && savedConfig.showOnePerson === true && (offersPersonPicker(peopleChoices) || peopleState === 'loading');
  const switchShown = switchOnWall && (viewChoices.length > 1 || personOffered);
  const wall = useWallCalendarSwitch({
    enabled: switchShown,
    homeView,
    views: viewChoices,
    pick: (pick) => (personOffered ? livePick(pick, peopleChoices) : null),
  });
  const config = useMemo(() => wallSwitchedConfig(savedConfig, 'viewMode', wall.borrowed, wall.pick), [savedConfig, wall.borrowed, wall.pick]);
  const [peopleOpen, setPeopleOpen] = useState(false);

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
  // "Show only these people", resolved once per roster change (groups expand to members here).
  const selection = useMemo(
    () => (config.peopleFilter === savedConfig.peopleFilter ? editorSelection : peopleSelection(config.peopleFilter, people, groups, peopleState)),
    [config.peopleFilter, savedConfig.peopleFilter, editorSelection, people, groups, peopleState],
  );
  const sourcedEvents = useMemo(
    () => selectCalendarEvents(rawEvents, {
      sourceFilter, peopleSelection: selection, titleFilter: config.titleFilter, eventRules, timezone, now: rulesNow ?? new Date(0),
    }),
    [rawEvents, sourceFilter, selection, config.titleFilter, eventRules, rulesNow, timezone],
  );
  // Name tags: the owner drawn in place of each event's calendar dot.
  const owners = useMemo(() => (config.showNameTags === true ? ownerBySource(people) : undefined), [config.showNameTags, people]);
  const viewMode = config.viewMode ?? 'daily';
  const tapDetails = config.eventTapDetails === true;
  // The list views scroll with a finger where an event can be tapped: a real
  // display with taps on. The editor preview and a wall without taps clip as
  // they always have. The look-ahead arrows show there too.
  const scroll = wallScrollOn(tapDetails, screenId, moduleId);
  const weekStartsOn = weekStartsOnFor(config.startDay);
  // The days a view draws from an anchor day; the agenda, which lists events
  // rather than days, counts its anchor's week (for the heading and the fetch).
  const windowAt = useCallback((anchor: Date) => {
    if (viewMode === 'daily') return viewDayWindow({ kind: 'days', today: anchor, weekStartsOn, count: config.daysToShow ?? 3 });
    if (viewMode === 'week') return viewDayWindow({ kind: 'week', today: anchor, weekStartsOn });
    if (viewMode === 'month') return viewDayWindow({ kind: 'month-grid', today: anchor, weekStartsOn });
    if (viewMode === 'multi-week') return viewDayWindow({ kind: 'weeks', today: anchor, weekStartsOn, count: clampWeeksToShow(config.weeksToShow) });
    if (viewMode === 'rolling') return viewDayWindow({ kind: 'days', today: anchor, weekStartsOn, count: clampRollingWeeks(config.weeksToShow) * 7 });
    return viewDayWindow({ kind: 'week', today: anchor, weekStartsOn });
  }, [viewMode, weekStartsOn, config.daysToShow, config.weeksToShow]);
  const lookStep = useMemo(() => calendarLookAhead({ viewMode, daysToShow: config.daysToShow }), [viewMode, config.daysToShow]);
  const look = useLookAhead({ step: lookStep, enabled: scroll, today, moduleId, reach: (step) => lookAheadReach(today, step, windowAt) });
  const anchor = look.anchor;
  // A stepped list starts at its first day (the agenda: the first day of that
  // week), past or future, instead of at what is still upcoming now.
  const listFrom = look.offset === 0 ? null : viewMode === 'agenda' ? startOfWeek(anchor, { weekStartsOn }) : anchor;
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
    const cutoff = listFrom ?? listViewCutoff(now, keepFinishedToday);
    return sourcedEvents.filter((ev) => isEventUpcoming(ev, cutoff, timezone));
  }, [sourcedEvents, viewMode, now, keepFinishedToday, timezone, listFrom]);
  const resolvedTimeFormat = householdTimeFormat(timeFormat, locale);
  // The family's day notes, shared by every calendar; the switch is on unless set off.
  const dayNotes = useDayNotes(config.showDayNotes !== false);
  // Legend ring, not-updating badge, and per-row "saved" suffixes all key
  // off this shared derivation (see useFailingSources).
  const { failingSources, failingSourceIds, hasLiveSource } = useFailingSources({ sourceStatus, sourceFilter });
  // Legend rows come from the events the current view actually draws — the
  // shared fetch window is wider than any single view, so scope to the
  // view's day range first (agenda has no day bound beyond the upcoming
  // filter). Only the view→window mapping lives here; the date math and the
  // holidays-label remap are shared (calendar-legend).
  const legendPlacement = config.showLegend ?? 'off';
  // The days the view draws; the agenda has no day bound beyond the upcoming filter.
  const viewWindow = useMemo(() => (viewMode === 'agenda' ? null : windowAt(anchor)), [viewMode, windowAt, anchor]);
  const legend = useMemo<LegendRow[]>(() => {
    if (legendPlacement === 'off') return [];
    return buildLegendRows(allEvents, viewWindow, timezone, { holidays: t('calendar.publicHolidays'), everyone: t('fullscreen-calendar.everyone') }, config.legendMode, people, groups);
  }, [legendPlacement, viewWindow, allEvents, timezone, t, config.legendMode, people, groups]);
  // Whether a day the view draws has a note. The agenda lists note days from
  // today for at least a week (AgendaView), so that week is its range here.
  const notesInView = useMemo(() => {
    const from = listFrom ?? today;
    const { start, end } = viewWindow ?? { start: from, end: addDays(from, 7) };
    return hasDayNoteInWindow(dayNotes, start, end);
  }, [viewWindow, today, listFrom, dayNotes]);
  const ViewComponent = VIEW_COMPONENTS[viewMode];
  const accentColor = config.accentColor ?? DEFAULT_CALENDAR_ACCENT;
  const gridEventStyle = config.gridEventStyle;
  const gridEventPillBackground = config.gridEventPillBackground;
  const showEventBackground = config.showEventBackground !== false;
  // Stable identity across clock ticks so the memoized EventCard's shallow
  // compare holds; only a real settings change produces a new object.
  // Tap-to-open detail: shared delegated-handler hook (see useEventTapDetail).
  // The module renders light-on-dark over a photo background with no theme
  // system, so the overlay uses the Charcoal tokens.
  const eventStyle = useMemo<EventDisplayStyle>(() => {
    const gridStyle = gridEventStyle === 'colored' ? 'colored' : 'classic';
    return {
      timeFormat: resolvedTimeFormat,
      gridStyle,
      pillBackground: gridStyle === 'colored' && gridEventPillBackground === true,
      showBackground: showEventBackground,
      timezone,
      failingSourceIds,
      tapDetails,
      owners,
    };
  }, [resolvedTimeFormat, gridEventStyle, gridEventPillBackground, showEventBackground, timezone, failingSourceIds, tapDetails, owners]);
  const { detailEvent, onRootClick, open: openDetail, close: closeDetail } = useEventTapDetail(allEvents, tapDetails);
  // "+N more" and the grid day numbers open the whole day (the grid views only).
  // Add, Change and Remove from the wall, once the household turned adding on (S9: the module can say no).
  const adding = useWallCalendarAdding(tapDetails && config.addEvents !== false);
  const daySheet = useDaySheet(allEvents, tapDetails, dayNotes, adding !== null);
  // The picker's counts: each person's events in what the view shows, before
  // any one person is picked. Worked out only while the picker is open.
  const pickerCounts = useMemo(() => {
    if (!peopleOpen) return new Map<string, number>();
    const everyone = selectCalendarEvents(rawEvents, {
      sourceFilter, peopleSelection: editorSelection, titleFilter: config.titleFilter, eventRules, timezone, now: rulesNow ?? new Date(0),
    });
    return personEventCounts(everyone, peopleChoices.people, viewWindow ?? windowAt(listFrom ?? anchor), timezone);
  }, [peopleOpen, rawEvents, sourceFilter, editorSelection, config.titleFilter, eventRules, timezone, rulesNow, peopleChoices, viewWindow, windowAt, listFrom, anchor]);
  const detailTheme = getThemeTokens('charcoal');
  // A grid that draws its own title (every Month, and every grid in the
  // modern looks) puts the arrows in it; the other views get a heading row.
  const titledGrid = viewMode === 'month' || ((viewMode === 'multi-week' || viewMode === 'rolling') && (config.gridTheme ?? 'banner') !== 'banner');
  // Several weeks at a time step a week: the heading names them by their dates.
  const spansWeeks = (viewMode === 'multi-week' && clampWeeksToShow(config.weeksToShow) > 1)
    || (viewMode === 'rolling' && clampRollingWeeks(config.weeksToShow) > 1);
  const lookContext = useMemo(() => ({ look, accent: config.accentColor ?? DEFAULT_CALENDAR_ACCENT }), [look, config.accentColor]);
  const barWindow = viewWindow ?? windowAt(anchor);
  const lookDates = look.on ? formatDayRange(barWindow.start, addDays(barWindow.end, -1), locale, { year: false }) : '';
  const lookShortDates = look.on ? formatDayRange(barWindow.start, addDays(barWindow.end, -1), locale, { month: 'short', year: false }) : '';

  // Failure ≠ empty: while the shared calendar fetch is failing, kept
  // events get a "not updating since" badge (loud after a day); per-source
  // outages name the failing source; setup problems get the setup card.
  // Only a failure with NO successful fetch ever renders the "can't load"
  // message (see calendarStatusView).
  const status = calendarStatusView({
    calendarSetup, calendarLoading, calendarStatus, failingSources, hasLiveSource,
    timezone, timeFormat: resolvedTimeFormat, locale, now, today, t, tCore,
  });

  // No calendar picked yet replaces the view with the setup card, unless a
  // day in view has a note: day notes need no calendar account, so the view
  // draws them on their own rather than hiding what the phone just saved.
  if (status.kind === 'setup' && !(status.setup === 'noSources' && notesInView)) {
    return (
      <ModuleWrapper style={style}>
        <CalendarSetupCard
          title={status.title}
          hint={status.hint}
          setup={status.setup}
          titleSize="1em"
          hintSize="0.75em"
          iconSize="1.8em"
        />
      </ModuleWrapper>
    );
  }

  // Neither is a free day: the first fetch is still out, or it has only ever
  // failed. The shared loading state, and the words every card uses for data
  // that never arrived.
  if (status.kind === 'loading') return <ModuleLoadingState style={style} message={t('calendar.loadingEvents')} />;
  if (status.kind === 'cantLoad') return <ModuleNotUpdatingState style={style} />;

  return (
    <ModuleWrapper style={style}>
      <div
        ref={boxRef}
        className="h-full flex flex-col relative"
        data-tap-events={tapDetails ? '' : undefined}
        onClick={onRootClick}
        {...look.rootProps}
      >
        {tapDetails && <style>{`[data-tap-events] [data-event-id] { cursor: pointer; }`}</style>}
        {status.kind === 'badge' && status.loud && (
          // Tinted card edge for a day-old outage: drawn from the content
          // box out to the card's own edge so it follows the corner radius.
          <div
            aria-hidden="true"
            data-testid="calendar-stale-edge"
            className="absolute pointer-events-none"
            style={{ inset: -style.padding, borderRadius: style.borderRadius, boxShadow: 'inset 0 0 0 2px rgba(245,185,66,0.55)' }}
          />
        )}
        {status.kind === 'badge' && (
          <div
            className="flex items-center gap-1.5 shrink-0 self-start"
            role="status"
            data-loud={status.loud ? '' : undefined}
            style={status.loud
              ? { fontSize: '0.7em', marginBottom: 6, padding: '0.3em 0.7em', borderRadius: '0.5em', backgroundColor: 'rgba(245,185,66,0.14)' }
              : { fontSize: '0.6em', marginBottom: 4 }}
          >
            <span className="rounded-full shrink-0" style={{ width: '0.7em', height: '0.7em', backgroundColor: status.loud ? '#f5b942' : '#d9a441' }} aria-hidden="true" />
            <span style={{ color: status.loud ? '#f5b942' : '#d9a441', fontWeight: 600 }}>{status.text}</span>
          </div>
        )}
        {legendPlacement === 'header' && (
          <CalendarLegend
            rows={legend}
            label={t('calendar.legendLabel')}
            failingIds={failingSourceIds}
            // maxHeight ≈ two wrapped rows: in a small module an unbounded
            // legend (8+ sources) could starve the flex-1 view area to zero.
            style={{ flexShrink: 0, fontSize: '0.6em', opacity: 0.85, marginBottom: 6, maxHeight: '3.4em', overflow: 'hidden' }}
          />
        )}
        {!titledGrid && <LookAheadBar look={look} dates={lookDates} shortDates={lookShortDates} accent={accentColor} datesOnly={spansWeeks} />}
        {switchShown && (
          <CalendarSwitchBar
            look="card"
            views={viewChoices.map((view) => ({ value: view, label: t(CARD_VIEW_BUTTONS[view].labelKey), icon: CARD_VIEW_BUTTONS[view].icon }))}
            current={wall.view}
            onView={wall.showView}
            people={personOffered ? peopleChoices : null}
            pick={wall.pick}
            pending={peopleState === 'loading'}
            onOpenPeople={() => setPeopleOpen(true)}
            onClearPerson={() => wall.showPick(null)}
            style={{ marginBottom: '0.5em' }}
          />
        )}
        <div className="flex-1 min-h-0">
          <DaySheetContext.Provider value={daySheet.opener}>
            <LookAheadContext.Provider value={lookContext}>
              <ViewComponent events={allEvents} config={config} style={style} today={today} now={now} anchor={listFrom ?? anchor} stepped={look.away} accentColor={accentColor} eventStyle={eventStyle} dayNotes={dayNotes} scroll={scroll} />
            </LookAheadContext.Provider>
          </DaySheetContext.Provider>
        </div>
        {legendPlacement === 'footer' && (
          <CalendarLegend
            rows={legend}
            label={t('calendar.legendLabel')}
            failingIds={failingSourceIds}
            // maxHeight ≈ two wrapped rows: in a small module an unbounded
            // legend (8+ sources) could starve the flex-1 view area to zero.
            style={{ flexShrink: 0, fontSize: '0.6em', opacity: 0.85, marginTop: 4, paddingTop: 6, borderTop: '1px solid rgba(128,128,128,0.35)', maxHeight: '3.4em', overflow: 'hidden' }}
          />
        )}
      </div>
      <CalendarTapOverlays
        daySheet={daySheet}
        tapDetails={tapDetails}
        detailEvent={detailEvent}
        openDetail={openDetail}
        closeDetail={closeDetail}
        owners={owners}
        variant={config.eventTapStyle ?? 'sheet'}
        theme={detailTheme}
        accentColor={accentColor}
        colorFor={(ev) => ev.calendarColor ?? accentColor}
        detailAccentFor={(ev) => ev.calendarColor ?? accentColor}
        timeFormat={resolvedTimeFormat}
        timezone={timezone}
        now={now}
        adding={adding}
      />
      {peopleOpen && personOffered && (
        <WallPersonSheet
          choices={peopleChoices}
          current={wall.pick}
          counts={pickerCounts}
          theme={detailTheme}
          accentColor={accentColor}
          onPick={(pick) => {
            wall.showPick(pick);
            setPeopleOpen(false);
          }}
          onClose={() => setPeopleOpen(false)}
        />
      )}
    </ModuleWrapper>
  );
}
