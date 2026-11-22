'use client';

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { startOfWeek, addDays, startOfDay } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarX } from 'lucide-react';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import { useTZClock } from '@/hooks/useTZClock';
import { getOrientation } from '@/lib/orientation';
import { rulesNeedNow, selectCalendarEvents } from '@/lib/calendar-rules';
import { clampRollingWeeks, listViewCutoff, weekStartsOnFor } from '@/lib/calendar-utils';
import { householdTimeFormat } from '@/lib/clock-time';
import { buildLegendRows } from '@/lib/calendar-legend';
import { useModuleSurface } from '../module-surface';
import { useMutedCalendarSources } from '../shared/useMutedCalendarSources';
import { useLegendColorPicker } from '../shared/useLegendColorPicker';
import { ownerBySource, peopleForSelection, peopleSelection, type PeopleSelection } from '@/lib/calendar-people';
import type { FamilyGroup } from '@/types/family';
import { effectiveWeatherPlacement, viewTraits, VIEW_TRAITS } from './view-traits';
import { scheduleColumnCount, type CalendarScale, type CalendarViewProps, type CalendarWeather } from './view-support';
import { buildHourlyIndex } from './event-weather';
import { getWeatherIcon } from '@/lib/weather-icons';
import { useTranslate, useFormattingLocale } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import type { CalendarFetchStatus, CalendarPerson, CalendarSourceStatus, CalendarTitleFilter, CalendarEventRule, FullscreenCalendarConfig, ModuleStyle, CalendarEvent, TimeFormat } from '@/types/config';
import { hasExtras } from '@/lib/calendar-extras';
import { toISODate } from '@/lib/meal-constants';
import { useCalendarExtras } from './useCalendarExtras';
import { useDayNotes } from '@/hooks/useDayNotes';
import { dayNotesFor, hasDayNoteInWindow } from '@/lib/day-notes';
import { DayNoteLine, dayNoteColors } from '../shared/DayNoteLine';
import type { ForecastDay, HourlyWeather } from '@/lib/weather/types';
import { getThemeTokens, getTypoMultiplier, getDensityMultiplier, surfaceBackdrop, barBackdrop } from '@/lib/fullscreen-themes';
import { resolveFullscreenTheme } from '@/lib/module-registry';
import { brightenForDark, eventBg, eventBorder, resolveCalendarAccent } from '@/lib/calendar-event-surface';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';
import { heldPulseKeyframes } from '@/lib/held-pulse';
import { ScheduleView } from './ScheduleView';
import { WeekListView } from './WeekListView';
import { MonthGridView } from './MonthGridView';
import { DayTimelineView } from './DayTimelineView';
import { AgendaView } from './AgendaView';
import { FamilyGridView } from './FamilyGridView';
import { UpNextView } from './UpNextView';
import { FreeTimeView } from './FreeTimeView';
import { RollingWeeksView } from './RollingWeeksView';
import { CalendarTapOverlays } from '../shared/CalendarTapOverlays';
import { useWallCalendarAdding } from '../shared/useWallCalendarAdding';
import { CalendarLegend } from '../shared/CalendarLegend';
import { calendarStatusView, useFailingSources, type CalendarSetupNeed } from '../shared/useFailingSources';
import { CalendarSetupCard } from '../shared/CalendarSetupCard';
import { useEventTapDetail } from '../shared/useEventTapDetail';
import { DaySheetContext, useDaySheet } from '../shared/useDaySheet';
import { wallScrollOn } from '@/lib/wall-scroll-views';
import { fullscreenCalendarLookAhead, lookAheadReach } from '@/lib/look-ahead';
import { borrowedViewReach } from '@/lib/calendar-window';
import { useLookAhead, type LookAhead } from '../shared/useLookAhead';
import { useWallCalendarSwitch } from '../shared/useWallCalendarSwitch';
import { CalendarSwitchBar } from '../shared/CalendarSwitchBar';
import { WallPersonSheet } from '../shared/WallPersonSheet';
import {
  FULLSCREEN_CALENDAR_VIEW_ORDER, livePick, offersPersonPicker, personEventCounts, wallPeopleChoices, wallSwitchedConfig, wallViewChoices,
} from '@/lib/calendar-wall-switch';
import { LookAheadButtons, useLookAheadLimitWords, useLookAheadWords } from '../shared/LookAhead';
import { ModuleLoadingState, ModuleNotUpdatingState } from '../ModuleStates';
import { fullscreenStateStyle } from '../shared/FullscreenStateShell';
import { FullscreenStateContext } from '../shared/fullscreen-state-context';

// Opening/closing the detail overlay re-renders this module; memo keeps the
// (potentially hundreds of) event blocks from reconciling on those frames —
// and on 60s clock ticks for the views whose props didn't change.
const MemoScheduleView = memo(ScheduleView);
const MemoWeekListView = memo(WeekListView);
const MemoMonthGridView = memo(MonthGridView);
const MemoDayTimelineView = memo(DayTimelineView);
const MemoAgendaView = memo(AgendaView);
const MemoFamilyGridView = memo(FamilyGridView);
const MemoUpNextView = memo(UpNextView);
const MemoFreeTimeView = memo(FreeTimeView);
const MemoRollingWeeksView = memo(RollingWeeksView);

// Shared view types/helpers live in view-support (the views import from
// there, never from this module, so there is no parent↔view import cycle).
export type { CalendarEvent } from '@/types/config';

// ─── Helpers ───

/** Shared chrome for the header/footer legend strips; the caller adds the one differing border. */
function legendStripStyle(scale: CalendarScale): React.CSSProperties {
  return {
    flexShrink: 0,
    fontSize: `${scale.bu * 1.1 * scale.typoMul}px`,
    color: 'var(--cal-text-secondary)',
    background: 'var(--cal-header-bg)',
    padding: `${scale.bu * 0.6}px 1.5%`,
    position: 'relative',
    zIndex: 20,
  };
}

/**
 * Events a fullscreen-calendar view should render: source-filtered, then
 * title-filtered, then rule-filtered, then — for the agenda view only —
 * narrowed to upcoming events, or to events ending today or later when
 * `showFinishedToday` is on (the agenda iterates days from today, so
 * finished rows land under today and dim via `dimPastEvents`). Every other
 * view takes the shared feed as-is: the fixed-range views (schedule,
 * week-list, month-grid, day-timeline, family-grid) intentionally show
 * past events, and up-next / free-time narrow to their own upcoming /
 * today-and-tomorrow shapes inside the view. An agenda stepped to other days
 * with the look-ahead arrows (`from`) starts at its first day instead, past
 * or future. Exported for unit testing this branch without rendering the
 * component.
 */
export function selectVisibleEvents(
  events: CalendarEvent[],
  view: FullscreenCalendarConfig['view'],
  sourceFilter: string[] | undefined,
  now: Date,
  opts: {
    timezone?: string; titleFilter?: CalendarTitleFilter; showFinishedToday?: boolean; eventRules?: CalendarEventRule[]; peopleSelection?: PeopleSelection | null;
    /** The first day of a stepped agenda; absent or null at rest. */
    from?: Date | null;
  } = {},
): CalendarEvent[] {
  return selectCalendarEvents(events, {
    sourceFilter,
    peopleSelection: opts.peopleSelection,
    titleFilter: opts.titleFilter,
    eventRules: opts.eventRules,
    timezone: opts.timezone,
    now,
    upcomingCutoff: view === 'agenda' ? opts.from ?? listViewCutoff(now, opts.showFinishedToday === true) : undefined,
  });
}

// ─── Empty state ───

/** A window with nothing in it: an ordinary quiet week, never an outage (that is the not-updating state). */
function EmptyState({ scale, emptyKey, t }: { scale: CalendarScale; emptyKey: string; t: TranslateFn }) {
  const label = t(emptyKey);
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: scale.bu * 1.5,
      color: 'var(--cal-text-tertiary)',
    }}>
      <CalendarX size={scale.bu * 6} strokeWidth={1.2} aria-hidden="true" />
      <span style={{
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        fontSize: scale.bu * 1.5 * scale.typoMul,
        fontWeight: 400,
      }}>
        {label}
      </span>
    </div>
  );
}

// ─── Main Component ───

interface FullscreenCalendarModuleProps {
  config: FullscreenCalendarConfig;
  style: ModuleStyle;
  events?: CalendarEvent[];
  timezone?: string;
  timeFormat?: TimeFormat;
  hourly?: HourlyWeather[];
  forecast?: ForecastDay[];
  units?: string;
  loading?: boolean;
  fullscreenTheme?: string;
  calendarStatus?: CalendarFetchStatus;
  /** Attached only while the display's first calendar fetch is still out (see buildModuleProps). */
  calendarLoading?: boolean;
  /** Attached only while at least one source is failing (see buildModuleProps). */
  sourceStatus?: CalendarSourceStatus[];
  /** Attached only while Settings > Calendar names nothing to fetch (see buildModuleProps). */
  calendarSetup?: CalendarSetupNeed;
  /** Calendar priority order, most wanted first; absent means plain time order. */
  calendarOrder?: string[];
  /** People with assigned calendars from Settings > Family (see buildModuleProps). */
  people?: CalendarPerson[];
  /** Avoid rendering source fallback rows before the configured people arrive. */
  peopleState?: 'loading' | 'failed';
  /** Family groups, for the color key and the people filter (see buildModuleProps). */
  groups?: FamilyGroup[];
  /** Only on a real display (see the registry's `needsInstanceAddress`); the editor preview has none. */
  screenId?: string;
  moduleId?: string;
}

export default function FullscreenCalendarModule({
  config: savedConfig,
  style,
  events: rawEventsRaw,
  timezone,
  timeFormat: savedTimeFormat,
  hourly,
  forecast,
  units,
  loading,
  fullscreenTheme,
  calendarStatus,
  calendarLoading,
  sourceStatus,
  calendarSetup,
  calendarOrder,
  people,
  peopleState,
  groups,
  screenId,
  moduleId,
}: FullscreenCalendarModuleProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const timeFormat = householdTimeFormat(savedTimeFormat, locale);
  const rawEvents = useMemo(() => rawEventsRaw ?? [], [rawEventsRaw]);
  const { containerRef, dims } = useFullscreenDims();

  // Updates every 60s — drives now-line movement and midnight rollover
  const now = useTZClock(timezone);
  // Keyed on the ms value, not `now`: `today`'s identity holds until
  // midnight, so memos and view props keyed on it survive the 60s ticks.
  const todayMs = startOfDay(now).getTime();
  const today = useMemo(() => new Date(todayMs), [todayMs]);

  // Legend ring, named header pill, and per-row "saved" suffix all key off
  // this shared derivation (see useFailingSources).
  const { failingSources, failingSourceIds, hasLiveSource } = useFailingSources({
    sourceStatus, sourceFilter: savedConfig.sourceFilter,
  });

  // On a touch wall the family can borrow another of the views the editor
  // offered, and show one person, for a minute (useWallCalendarSwitch). From
  // here on `config` is the calendar as it is drawn right now; at rest it is
  // the saved config itself.
  const switchOnWall = wallScrollOn(savedConfig.eventTapDetails === true, screenId, moduleId);
  const editorSelection = useMemo(
    () => peopleSelection(savedConfig.peopleFilter, people, groups, peopleState),
    [savedConfig.peopleFilter, people, groups, peopleState],
  );
  const peopleChoices = useMemo(() => wallPeopleChoices(people, groups, editorSelection), [people, groups, editorSelection]);
  const viewChoices = useMemo(
    () => wallViewChoices(savedConfig.view, savedConfig.wallViews, FULLSCREEN_CALENDAR_VIEW_ORDER),
    [savedConfig.view, savedConfig.wallViews],
  );
  const personOffered = switchOnWall && savedConfig.showOnePerson === true && (offersPersonPicker(peopleChoices) || peopleState === 'loading');
  const switchShown = switchOnWall && (viewChoices.length > 1 || personOffered);
  const wall = useWallCalendarSwitch({
    enabled: switchShown,
    homeView: savedConfig.view,
    views: viewChoices,
    pick: (pick) => (personOffered ? livePick(pick, peopleChoices) : null),
  });
  const config = useMemo(() => wallSwitchedConfig(savedConfig, 'view', wall.borrowed, wall.pick), [savedConfig, wall.borrowed, wall.pick]);
  const [peopleOpen, setPeopleOpen] = useState(false);

  // "Show only these people", resolved once per roster change: groups expand
  // to members here, so a screen pointed at "Kids" follows the family list.
  const selection = useMemo(
    () => (config.peopleFilter === savedConfig.peopleFilter ? editorSelection : peopleSelection(config.peopleFilter, people, groups, peopleState)),
    [config.peopleFilter, savedConfig.peopleFilter, editorSelection, people, groups, peopleState],
  );
  // The per-person views draw only the chosen people, like the events.
  const visiblePeople = useMemo(() => peopleForSelection(people, selection), [people, selection]);
  // Name tags: the owner drawn in place of each event's calendar dot.
  const owners = useMemo(() => (config.showNameTags === true ? ownerBySource(people) : undefined), [config.showNameTags, people]);
  // A filtered screen whose roster has not arrived shows nothing rather than
  // everyone's events; while the roster is loading that reads as loading.
  const rosterPending = selection?.pending === true;

  const themeId = resolveFullscreenTheme('fullscreen-calendar', config.theme, fullscreenTheme);
  const theme = getThemeTokens(themeId);

  // Today-highlight fill derived from the resolved accent color so the
  // highlight follows accentColor (the fill was previously hardcoded orange).
  const highlightStyle = config.todayHighlightStyle ?? 'full';
  const resolvedAccent = resolveCalendarAccent(config.accentColor, theme);
  // The accent as drawn (--cal-accent): a user color still gets the dark-theme
  // lift; a theme's own accent is already tuned for its background and is used
  // verbatim. The day sheet portals out of the root, so it takes the value.
  const drawnAccent = config.accentColor && theme.isDark ? brightenForDark(config.accentColor) : resolvedAccent;
  // Themes with an atmosphere layer dial the today wash down so the
  // background survives; 'subtle' stays proportionally fainter than 'full'.
  const fullAlpha = theme.todayFill ?? (theme.isDark ? 0.16 : 0.10);
  const subtleAlpha = theme.todayFill != null ? theme.todayFill * 0.55 : (theme.isDark ? 0.07 : 0.05);
  const todayFill =
    highlightStyle === 'full' ? eventBg(resolvedAccent, fullAlpha, theme.isDark)
    : highlightStyle === 'subtle' ? eventBg(resolvedAccent, subtleAlpha, theme.isDark)
    : 'transparent';

  const scale: CalendarScale = useMemo(() => ({
    bu: Math.min(dims.w, dims.h) / 100,
    width: dims.w,
    height: dims.h,
    orientation: getOrientation(dims.w, dims.h),
    densityMul: getDensityMultiplier(config.density),
    typoMul: getTypoMultiplier(config.typographySize),
    isDark: theme.isDark,
    eventStyle: theme.eventStyle ?? 'wash',
  }), [dims, config.density, config.typographySize, theme.isDark, theme.eventStyle]);

  // Everything view-shaped (title, icon, empty wording, legend window,
  // weather surfaces) comes from the shared registry.
  const traits = viewTraits(config.view);
  const weekStartsOn = weekStartsOnFor(config.startDay);

  // The list views scroll with a finger where an event can be tapped: a real
  // display with taps on. The editor preview and a wall without taps clip as
  // they always have. The look-ahead arrows show there too.
  const scroll = wallScrollOn(config.eventTapDetails === true, screenId, moduleId);
  // A step is the view's span; the schedule's depends on the columns it fits.
  const scheduleColumns = scheduleColumnCount(config, scale.width);
  const lookStep = useMemo(
    () => fullscreenCalendarLookAhead({ view: config.view }, scheduleColumns),
    [config.view, scheduleColumns],
  );
  // A view borrowed from the wall's buttons is fetched like a saved one for as long as it shows.
  const borrowedReach = useMemo(
    () => (wall.borrowed === null ? null : borrowedViewReach('fullscreen-calendar', config, today)),
    [wall.borrowed, config, today],
  );
  const look = useLookAhead({
    step: lookStep, enabled: scroll, today, moduleId,
    reach: (step) => lookAheadReach(today, step, (at) => traits.legendWindow({ today, anchor: at, weekStartsOn, config, scaleWidth: scale.width })),
    reachNow: borrowedReach,
  });
  // The first day the view draws: `today` at rest, so taps off and the
  // editor preview draw exactly what they always have.
  const anchor = look.anchor;

  // The 60s tick only changes the selection when the agenda cutoff applies
  // or a rule actually reads the clock; otherwise keep the memo stable
  // across ticks: the rules pass mints new event objects, which would
  // thrash every event-keyed memo in the views for nothing on a Pi.
  const selectionNow = config.view === 'agenda' || rulesNeedNow(config.eventRules) ? now : null;
  // An agenda stepped to other days lists them from their first day.
  const listFrom = look.away ? anchor : null;
  const events = useMemo(
    () => selectVisibleEvents(rawEvents, config.view, config.sourceFilter, selectionNow ?? today, {
      timezone, titleFilter: config.titleFilter, showFinishedToday: config.agendaShowFinishedToday === true,
      eventRules: config.eventRules, peopleSelection: selection, from: listFrom,
    }),
    [rawEvents, config.view, config.sourceFilter, selectionNow, today, timezone, config.titleFilter, config.agendaShowFinishedToday, config.eventRules, selection, listFrom],
  );

  const headerTitle = traits.headerTitle({ today, anchor, t, locale, config, scaleWidth: scale.width });

  // Legend rows come from the events the current view actually draws — the
  // shared fetch window is wider than any single view, so scope to the
  // view's day range first (the registry knows each view's range).
  const surface = useModuleSurface();
  const mutedSources = useMutedCalendarSources();
  const legendToggle = surface === 'display' ? mutedSources.toggle : undefined;
  // Tap the dot rather than the row to recolour that calendar. Repaints the
  // events the legend is derived from, so dot and bars move together.
  const colourFor = useCallback((name: string) => t('calendar.colourFor', { name }), [t]);
  const legendColor = useLegendColorPicker({
    enabled: surface === 'display',
    events,
    label: colourFor,
  });
  // Filtered AFTER `legend` is derived: a hidden calendar keeps its row
  // (dimmed) and stays restorable. Filtering first would delete the way back.
  const visibleEvents = useMemo(() => mutedSources.filter(legendColor.events), [mutedSources, legendColor.events]);
  const legendPlacement = config.showLegend ?? 'off';
  const legend = useMemo(() => {
    if (legendPlacement === 'off') return [];
    const window = traits.legendWindow({ today, anchor, weekStartsOn, config, scaleWidth: scale.width });
    return buildLegendRows(legendColor.events, window, timezone, { holidays: t('calendar.publicHolidays'), everyone: t('fullscreen-calendar.everyone') }, config.legendMode, people, groups);
  }, [legendPlacement, legendColor.events, timezone, today, anchor, weekStartsOn, t, traits, config, scale.width, people, groups]);

  const currentTemp = hourly?.[0]?.temp;
  const weatherIconId = hourly?.[0]?.icon;
  const tempUnit = units === 'metric' ? '\u00B0C' : '\u00B0F';

  const WeatherIcon = weatherIconId ? getWeatherIcon(weatherIconId, 'outline') : null;

  const ViewIcon = traits.icon;
  const viewLabel = t(traits.labelKey);

  const weatherPlacement = effectiveWeatherPlacement(config.view, config);
  const weather = useMemo<CalendarWeather>(
    () => ({ hourlyIndex: buildHourlyIndex(hourly), forecast, placement: weatherPlacement }),
    [hourly, forecast, weatherPlacement],
  );

  // Household rows for the week list, for the week it draws. Only fetched
  // while a toggle is on and the week list is the active view; the hook is a
  // no-op otherwise.
  const weekDates = useMemo(() => {
    const weekStart = startOfWeek(anchor, { weekStartsOn });
    return Array.from({ length: 7 }, (_, i) => toISODate(addDays(weekStart, i)));
  }, [anchor, weekStartsOn]);
  const wantsExtras = config.view === 'week-list';
  const extras = useCalendarExtras(
    { meals: wantsExtras && config.showMeals === true, chores: wantsExtras && config.showChores === true },
    weekDates,
  );

  // The family's day notes, shared by every calendar; the switch is on unless set off.
  const dayNotes = useDayNotes(config.showDayNotes !== false);
  // Whether a day this view draws has a note: such a view is drawn even with
  // no events in the feed. Up Next only ever shows today's and tomorrow's.
  const notesInView = useMemo(() => {
    const window = traits.legendWindow({ today, anchor, weekStartsOn, config, scaleWidth: scale.width });
    const end = config.view === 'up-next' ? addDays(today, 2) : window.end;
    return hasDayNoteInWindow(dayNotes, window.start, end);
  }, [dayNotes, traits, today, anchor, weekStartsOn, config, scale.width]);

  // The one-day views carry their day's notes beside the title, since the
  // title is their day heading; the header has room for one line, so they
  // share it. A stepped Day timeline names another day, and takes its notes.
  const titleNote = config.view === 'day-timeline' || config.view === 'free-time' ? dayNotesFor(dayNotes, anchor).join(' · ') : '';

  const viewProps = useMemo<CalendarViewProps>(
    () => ({ events: visibleEvents, calendarOrder, config, scale, today, anchor, stepped: look.away, now, timeFormat, weather, timezone, failingSourceIds, people: visiblePeople, owners, extras, dayNotes, scroll }),
    [visibleEvents, calendarOrder, config, scale, today, anchor, look.away, now, timeFormat, weather, timezone, failingSourceIds, visiblePeople, owners, extras, dayNotes, scroll],
  );
  const hasEvents = visibleEvents.length > 0;
  // Views with something to say on an empty feed: a day note in view, the
  // family grid and free time still draw every configured person, a week
  // list can be all meals and chores, and day rules mark days that need no
  // event (a badge every other Tuesday, weekend art). Up next and Free time
  // draw only a rule's badge beside a heading, which is not a board on its
  // own, so rules alone do not fill them.
  const drawsDayRules = config.view !== 'up-next' && config.view !== 'free-time';
  const hasContent = hasEvents
    || notesInView
    || (drawsDayRules && (config.dayRules?.length ?? 0) > 0)
    || ((config.view === 'family-grid' || config.view === 'free-time') && (visiblePeople?.length ?? 0) > 0)
    || (wantsExtras && hasExtras(extras, weekDates));
  const personView = config.view === 'family-grid' || config.view === 'free-time';
  const peopleUnavailable = (personView || rosterPending) && !!peopleState;
  // The first fetch still out (see buildModuleProps): the skeleton, never an
  // empty week, since a person view would draw everyone with nothing on.
  const isLoading = calendarLoading === true || (loading && !hasContent) || ((personView || rosterPending) && peopleState === 'loading');

  // Failure ≠ empty: while the shared calendar fetch is failing, the events
  // on screen are the kept last-good payload — badge them as not updating
  // rather than live (loud after a day). Setup problems (nothing picked,
  // Google sign-in expired) show the setup card instead of aging events.
  // Only a failure with NO successful fetch ever (updatedAt null) renders
  // the "can't load" state: last-good data whose visible window happens to
  // be empty (an agenda after the day's last event) is a normal empty day,
  // not an outage.
  const status = calendarStatusView({
    calendarSetup, calendarLoading, calendarStatus, failingSources, hasLiveSource,
    timezone, timeFormat, locale, now, today, t, tCore,
  });
  const neverLoaded = status.kind === 'cantLoad';

  // Stepped away, the tag and the way back join the header, and a long title
  // ("December 27, 2026 – January 2, 2027", or a long month name in another
  // language) beside them can be wider than a portrait wall. The title then
  // steps down in size just enough to keep the weather and the view's name
  // inside the header, measured before the frame paints. Text width follows
  // its size, so one measurement at full size gives the scale. At rest the
  // title keeps the size the family chose.
  const titleSize = scale.bu * 3.5 * scale.typoMul;
  const headerRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const fitKey = look.away ? `${headerTitle}|${titleNote}|${look.offset}|${titleSize}|${scale.width}|${status.kind}|${currentTemp != null}` : '';
  const [titleFit, setTitleFit] = useState({ key: '', scale: 1 });
  const titleScale = titleFit.key === fitKey ? titleFit.scale : 1;
  useLayoutEffect(() => {
    const header = headerRef.current;
    const title = titleRef.current;
    const last = header?.lastElementChild;
    if (!fitKey || !header || !title || !last) return;
    const limit = header.getBoundingClientRect().right - parseFloat(getComputedStyle(header).paddingRight);
    const over = last.getBoundingClientRect().right - limit;
    const width = title.getBoundingClientRect().width;
    const fit = over > 0 && width > 0 ? Math.max(0.6, (width - over - 2) / width) : 1;
    setTitleFit((prev) => (prev.key === fitKey && prev.scale === fit ? prev : { key: fitKey, scale: fit }));
  }, [fitKey]);

  // Tap-to-open detail: shared delegated-handler hook (see useEventTapDetail).
  const tapDetails = config.eventTapDetails === true;
  const { detailEvent, onRootClick, open: openDetail, close: closeDetail } = useEventTapDetail(events, tapDetails);
  // "+N more" and the grid day numbers open the whole day (see useDaySheet).
  // Add, Change and Remove from the wall, once the household turned adding on (S9: the module can say no).
  const adding = useWallCalendarAdding(tapDetails && config.addEvents !== false);
  const daySheet = useDaySheet(events, tapDetails, dayNotes, adding !== null);

  // The picker's counts: each person's events in what the view shows, before
  // any one person is picked. Worked out only while the picker is open.
  const pickerCounts = useMemo(() => {
    if (!peopleOpen) return new Map<string, number>();
    const everyone = selectVisibleEvents(rawEvents, config.view, config.sourceFilter, selectionNow ?? today, {
      timezone, titleFilter: config.titleFilter, showFinishedToday: config.agendaShowFinishedToday === true,
      eventRules: config.eventRules, peopleSelection: editorSelection, from: listFrom,
    });
    const window = traits.legendWindow({ today, anchor, weekStartsOn, config, scaleWidth: scale.width });
    return personEventCounts(everyone, peopleChoices.people, window, timezone);
  }, [peopleOpen, rawEvents, config, selectionNow, today, timezone, editorSelection, listFrom, traits, anchor, weekStartsOn, scale.width, peopleChoices]);

  return (
    <div
      ref={containerRef}
      className="fsc-root"
      data-tap-events={tapDetails ? '' : undefined}
      onClick={onRootClick}
      {...look.rootProps}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        overflow: 'hidden',
        position: 'relative',
        '--cal-bg': theme.bg,
        '--cal-surface': theme.surface,
        '--cal-surface-hover': theme.surfaceHover,
        '--cal-border': theme.border,
        '--cal-border-subtle': theme.borderSubtle,
        '--cal-text-primary': theme.text,
        '--cal-text-secondary': theme.textSecondary,
        '--cal-text-tertiary': theme.textMuted,
        '--cal-header-bg': theme.headerBg,
        '--cal-card-shadow': theme.cardShadow,
        '--cal-past-opacity': String(theme.pastOpacity),
        // The quieter second surface: the week list's meal and chore rows,
        // the family grid's name column and the rolling window's status line.
        '--cal-surface-alt': theme.surfaceAlt,
        '--cal-weekend-shade': theme.surfaceAlt,
        '--cal-accent': drawnAccent,
        '--cal-accent-bg': eventBg(resolvedAccent, theme.isDark ? 0.20 : 0.12, theme.isDark),
        // Day notes: a strong yellow wash reads as olive over a near-black
        // theme, so dark themes take a lighter wash with brighter words.
        ...dayNoteColors(theme.isDark),
        '--cal-accent-surface': eventBg(resolvedAccent, theme.isDark ? 0.32 : 0.22, theme.isDark),
        '--cal-today-fill': todayFill,
        '--cal-bg-image': theme.bgImage ?? 'none',
        '--cal-surface-backdrop': surfaceBackdrop(theme),
        // A theme's on-accent ink is tuned for that theme's accent only; a
        // user-picked accent may be dark, so it keeps the original white.
        '--cal-on-accent': config.accentColor ? '#fff' : (theme.onAccent ?? '#fff'),
        // Sticky day bands (agenda) must cover what scrolls under them. The
        // flat themes paint their background verbatim, as before; over an
        // atmosphere layer a flat slab would punch a hole in the gradient, so
        // those themes get the header's frosted treatment instead.
        '--cal-band-bg': theme.bgImage ? theme.headerBg : theme.bg,
        // Header and bands share one frost, and only over an atmosphere layer.
        '--cal-bar-backdrop': barBackdrop(theme),
      } as React.CSSProperties}
    >
      <style>{cssTokens}</style>

      {/* Header bar */}
      {/* The bar grows with the typography setting so a scaled-up serif
          title never spills over the view below; `small` keeps the full
          5bu bar (the pills and badges in it don't shrink as far). */}
      {/* With the look-ahead arrows the bar is never shorter than a finger's
          button and its breathing room. */}
      <header ref={headerRef} className="fsc-header" style={{ height: `${Math.max(scale.bu * 5 * Math.max(1, scale.typoMul), look.on ? LOOK_AHEAD_BAR_MIN : 0)}px`, flexShrink: 0 }} role="banner">
        <h1
          ref={titleRef}
          className="fsc-header-title"
          // Explicit line height: the serif's default line box is ~1.45em,
          // which overshoots the bar and paints descenders over the view.
          style={{ fontSize: `${titleSize * titleScale}px`, lineHeight: 1.15, margin: 0 }}
        >
          {headerTitle}
        </h1>
        {look.on && <HeaderLookAheadTag look={look} scale={scale} tagged={!(config.view === 'rolling' && clampRollingWeeks(config.rollingWeeksToShow) > 1)} />}
        {titleNote && (
          <DayNoteLine
            text={titleNote}
            tone="fullscreen"
            style={{
              fontSize: scale.bu * 1.55 * scale.typoMul,
              padding: `${scale.bu * 0.45}px ${scale.bu}px`,
              marginLeft: scale.bu * 0.8,
              borderRadius: 6,
              flexShrink: 1,
              maxWidth: '50%',
            }}
          />
        )}
        <div style={{ flex: 1 }} />
        {/* On the right, before the weather and the view's name: the arrows
            stay put whatever the title says, so a second tap steps again. */}
        {look.on && <HeaderLookAheadArrows look={look} scale={scale} />}
        {status.kind === 'badge' ? (
          // The not-updating pill takes the weather pill's slot so the
          // header element count never changes; calm amber, no "error"
          // language (wording shared via calendarStatusView). 24px on a
          // 1080-wide wall, filled when the outage is a day old.
          <span
            className={status.loud ? 'fsc-stale-pill fsc-stale-pill-loud' : 'fsc-stale-pill'}
            data-loud={status.loud ? '' : undefined}
            style={{
              fontSize: `${scale.bu * 1.5 * scale.typoMul}px`,
              color: scale.isDark ? (status.loud ? '#f5b942' : '#d9a441') : '#92642c',
            }}
            role="status"
          >
            <span className="fsc-stale-dot" aria-hidden="true" />
            {status.text}
          </span>
        ) : weatherPlacement === 'header' && currentTemp != null && (
          <span
            className="fsc-weather-pill"
            style={{ fontSize: `${scale.bu * 1.3 * scale.typoMul}px` }}
            aria-label={t('fullscreen-calendar.ariaLabels.currentTemperature', { temp: Math.round(currentTemp) })}
          >
            {WeatherIcon && <WeatherIcon size={scale.bu * 1.6 * scale.typoMul} aria-hidden="true" />}
            {Math.round(currentTemp)}{tempUnit}
          </span>
        )}
        {/* With the wall's view buttons below, the lit button names the view. */}
        {!switchShown && (
          <span
            className="fsc-view-badge"
            style={{ fontSize: `${scale.bu * 1.0 * scale.typoMul}px` }}
            aria-label={t('fullscreen-calendar.ariaLabels.view', { label: viewLabel })}
          >
            <ViewIcon size={scale.bu * 1.2 * scale.typoMul} aria-hidden="true" />
            {viewLabel}
          </span>
        )}
      </header>

      {switchShown && (
        <CalendarSwitchBar
          look="fullscreen"
          bu={scale.bu}
          views={viewChoices.map((view) => ({ value: view, label: t(VIEW_TRAITS[view].labelKey), icon: VIEW_TRAITS[view].icon }))}
          current={wall.view}
          onView={wall.showView}
          people={personOffered ? peopleChoices : null}
          pick={wall.pick}
          pending={peopleState === 'loading'}
          onOpenPeople={() => setPeopleOpen(true)}
          onClearPerson={() => wall.showPick(null)}
          style={{
            background: 'var(--cal-header-bg)',
            backdropFilter: 'var(--cal-bar-backdrop)',
            WebkitBackdropFilter: 'var(--cal-bar-backdrop)',
            borderBottom: '1px solid var(--cal-border-subtle)',
            position: 'relative',
            zIndex: 20,
          }}
        />
      )}

      {legendPlacement === 'header' && (
        <CalendarLegend
          mutedIds={mutedSources.muted}
          onToggle={legendToggle}
          onPickColor={legendColor.open}
          colorLabel={colourFor}
          rows={legend}
          label={t('fullscreen-calendar.ariaLabels.legend')}
          style={{ ...legendStripStyle(scale), borderBottom: '1px solid var(--cal-border-subtle)' }}
          failingIds={failingSourceIds}
        />
      )}

      {/* View area */}
      <div className="fsc-content" style={{ flex: 1, minHeight: 0 }}>
        {/* No calendar picked yet shows the setup card, unless a day in view
            has a note: day notes need no calendar account, so the view draws
            them on their own rather than hiding what the phone just saved. */}
        {status.kind === 'setup' && !(status.setup === 'noSources' && notesInView) ? (
          <CalendarSetupCard
            title={status.title}
            hint={status.hint}
            setup={status.setup}
            titleSize={scale.bu * 2.2 * scale.typoMul}
            hintSize={scale.bu * 1.6 * scale.typoMul}
            iconSize={scale.bu * 6}
            color="var(--cal-text-primary)"
            hintColor="var(--cal-text-secondary)"
            style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}
          />
        ) : isLoading ? (
          <FullscreenStateContext.Provider value>
            <ModuleLoadingState style={fullscreenStateStyle(style, theme, dims)} message={t('calendar.loadingEvents')} />
          </FullscreenStateContext.Provider>
        ) : neverLoaded || peopleUnavailable ? (
          // A fetch that has never succeeded is an outage even when the view
          // has settings-derived content (people rows, meals/chores): drawing
          // every person with zero events would read as a free week. It
          // never takes the same words as a genuinely empty calendar.
          <FullscreenStateContext.Provider value>
            <ModuleNotUpdatingState style={fullscreenStateStyle(style, theme, dims)} />
          </FullscreenStateContext.Provider>
        ) : !hasContent ? (
          <EmptyState scale={scale} emptyKey={traits.emptyKey} t={t} />
        ) : (
          <DaySheetContext.Provider value={daySheet.opener}>
            <AnimatePresence mode="wait">
              {/* Keyed on the saved view: a view picked in the editor fades in,
                  while one borrowed from the wall's buttons (and the way back)
                  changes at once, like the look-ahead arrows. On a Pi 4 the
                  full-screen fade dropped frames on every tap and held the new
                  view back by its exit. */}
              <motion.div
                key={savedConfig.view}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                style={{ height: '100%' }}
                className="fsc-view-motion"
              >
                {config.view === 'schedule' && <MemoScheduleView {...viewProps} />}
                {config.view === 'week-list' && <MemoWeekListView {...viewProps} />}
                {config.view === 'month-grid' && <MemoMonthGridView {...viewProps} />}
                {config.view === 'day-timeline' && <MemoDayTimelineView {...viewProps} />}
                {config.view === 'agenda' && <MemoAgendaView {...viewProps} />}
                {config.view === 'family-grid' && <MemoFamilyGridView {...viewProps} />}
                {config.view === 'up-next' && <MemoUpNextView {...viewProps} />}
                {config.view === 'free-time' && <MemoFreeTimeView {...viewProps} />}
                {config.view === 'rolling' && <MemoRollingWeeksView {...viewProps} />}
              </motion.div>
            </AnimatePresence>
          </DaySheetContext.Provider>
        )}
      </div>

      {legendPlacement === 'footer' && (
        <CalendarLegend
          mutedIds={mutedSources.muted}
          onToggle={legendToggle}
          onPickColor={legendColor.open}
          colorLabel={colourFor}
          rows={legend}
          label={t('fullscreen-calendar.ariaLabels.legend')}
          style={{ ...legendStripStyle(scale), borderTop: '1px solid var(--cal-border-subtle)' }}
          failingIds={failingSourceIds}
        />
      )}

      <CalendarTapOverlays
        daySheet={daySheet}
        tapDetails={tapDetails}
        detailEvent={detailEvent}
        openDetail={openDetail}
        closeDetail={closeDetail}
        owners={owners}
        variant={config.eventTapStyle ?? 'sheet'}
        theme={theme}
        accentColor={drawnAccent}
        colorFor={(ev) => eventBorder(ev.calendarColor ?? DEFAULT_EVENT_COLOR, theme.isDark)}
        detailAccentFor={(ev) => eventBorder(ev.calendarColor ?? DEFAULT_EVENT_COLOR, theme.isDark)}
        timeFormat={timeFormat}
        timezone={timezone}
        now={now}
        adding={adding}
      />
      {peopleOpen && personOffered && (
        <WallPersonSheet
          choices={peopleChoices}
          current={wall.pick}
          counts={pickerCounts}
          theme={theme}
          accentColor={drawnAccent}
          onPick={(pick) => {
            wall.showPick(pick);
            setPeopleOpen(false);
          }}
          onClose={() => setPeopleOpen(false)}
        />
      )}
      {legendColor.popover}
    </div>
  );
}

// ─── Look-ahead in the header ───

/** The header's least height with the arrows in it: a 44 px button and a little room. */
const LOOK_AHEAD_BAR_MIN = 52;

/**
 * Beside the header title while stepped away: a tag naming the period
 * ("Next week") in the look of the views' Today badge, or, a moment after a
 * tap past the end, how far the wall goes. The title itself names the dates.
 * A view of several weeks at once has no tag (`tagged` false): "Next week"
 * would name only the first of them.
 */
function HeaderLookAheadTag({ look, scale, tagged }: { look: LookAhead; scale: CalendarScale; tagged: boolean }) {
  const words = useLookAheadWords(look);
  const limitWords = useLookAheadLimitWords(look);
  const text = limitWords ?? (look.away && tagged ? words : null);
  if (!text) return null;
  return (
    <span
      data-testid={limitWords ? 'look-ahead-limit' : 'look-ahead-words'}
      role={limitWords ? 'status' : undefined}
      style={{
        flexShrink: 0,
        marginLeft: scale.bu * 1.2,
        fontSize: `${scale.bu * 1.3 * scale.typoMul}px`,
        fontWeight: 700,
        textTransform: limitWords ? undefined : 'uppercase',
        letterSpacing: limitWords ? undefined : '0.08em',
        color: 'var(--cal-accent)',
        background: 'var(--cal-accent-bg)',
        padding: `${scale.bu * 0.1}px ${scale.bu * 0.5}px`,
        borderRadius: 4,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

/** The way back while away, then ‹ and ›, on the header's right. */
function HeaderLookAheadArrows({ look, scale }: { look: LookAhead; scale: CalendarScale }) {
  return (
    <div
      data-testid="look-ahead-bar"
      data-offset={look.offset}
      style={{
        display: 'flex', alignItems: 'center', gap: scale.bu * 0.9, flexShrink: 0,
        marginLeft: scale.bu * 1.2, marginRight: scale.bu * 1.2,
        // The buttons size themselves from this: 2.75em, never under 44 px.
        fontSize: Math.max(14, scale.bu * 1.5 * scale.typoMul),
      }}
    >
      <LookAheadButtons look={look} tone="theme" accent="var(--cal-accent)" onAccent="var(--cal-on-accent, #fff)" />
    </div>
  );
}

// ─── CSS Custom Properties (injected into component scope) ───

/** Lucide's chevron-right as a CSS mask, so the chevron a row draws by CSS matches the ones drawn as icons. */
const CHEVRON_MASK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m9 18 6-6-6-6'/%3E%3C/svg%3E")`;

const cssTokens = `
.fsc-root {
  --cal-transition-fast: 150ms ease-out;
  --cal-transition-normal: 250ms ease-out;
  --cal-transition-slow: 400ms ease-out;
  background-color: var(--cal-bg);
  background-image: var(--cal-bg-image, none);
  color: var(--cal-text-primary);
}

/* Smooth theme transitions */
.fsc-root,
.fsc-root *:not(.fsc-view-motion) {
  transition:
    background-color 800ms ease-in-out,
    color 400ms ease-in-out,
    border-color 400ms ease-in-out,
    opacity 500ms ease-out;
}

/* Today highlight pulse. The glow is a composited pseudo-element fading in
   and out: animating box-shadow on the marker itself repaints the gradient
   tiles beneath it on every frame, forever, on atmosphere themes. Its
   keyframes are held samples so the wall redraws 12 times a second, not on
   every refresh (held-pulse.ts). */
${heldPulseKeyframes('fsc-today-pulse', { rest: 0, peak: 1, periodMs: 4000 })}
.fsc-today-pulse {
  position: relative;
}
.fsc-today-pulse::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: 0 0 8px 2px var(--cal-accent);
  pointer-events: none;
  will-change: opacity;
  animation: fsc-today-pulse 4s linear infinite;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .fsc-root,
  .fsc-root * {
    transition-duration: 0ms !important;
    animation-duration: 0ms !important;
    animation-iteration-count: 1 !important;
  }
  .fsc-today-pulse::after {
    animation: none !important;
    opacity: 0;
  }
}

/* Header */
.fsc-header {
  display: flex;
  align-items: center;
  padding: 0 1.5%;
  background: var(--cal-header-bg);
  backdrop-filter: var(--cal-bar-backdrop);
  -webkit-backdrop-filter: var(--cal-bar-backdrop);
  border-bottom: 1px solid var(--cal-border-subtle);
  position: relative;
  z-index: 20;
  gap: 8px;
}
.fsc-header-title {
  font-family: var(--font-dm-serif), 'DM Serif Display', Georgia, serif;
  color: var(--cal-text-primary);
  white-space: nowrap;
  font-weight: 400;
}
.fsc-weather-pill {
  display: flex;
  align-items: center;
  backdrop-filter: var(--cal-surface-backdrop, none);
  -webkit-backdrop-filter: var(--cal-surface-backdrop, none);
  gap: 6px;
  color: var(--cal-text-secondary);
  background: var(--cal-surface);
  border: 1px solid var(--cal-border-subtle);
  border-radius: 999px;
  padding: 2px 12px;
  font-weight: 500;
  white-space: nowrap;
}
.fsc-stale-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(217,164,65,0.16);
  border: 1px solid rgba(217,164,65,0.35);
  border-radius: 999px;
  padding: 2px 12px;
  font-weight: 600;
  white-space: nowrap;
}
.fsc-stale-pill-loud {
  background: rgba(245,185,66,0.18);
  border-color: rgba(245,185,66,0.6);
  padding: 4px 14px;
}
.fsc-stale-dot {
  width: 0.55em;
  height: 0.55em;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}
.fsc-view-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--cal-accent);
  background: var(--cal-accent-bg);
  border-radius: 4px;
  padding: 2px 8px;
  white-space: nowrap;
}
.fsc-content {
  position: relative;
  overflow: hidden;
}

/* Tap-to-open event details enabled */
.fsc-root[data-tap-events] .fsc-event-block {
  cursor: pointer;
}
/* List rows that open a detail overlay get a chevron at the right edge, only
   while tapping does something (data-tap-events). Inline padding wins over a
   stylesheet, so the room for it is forced. */
.fsc-root[data-tap-events] .fsc-tap-row {
  position: relative;
  padding-right: 1.6em !important;
}
.fsc-root[data-tap-events] .fsc-tap-row::after {
  content: '';
  position: absolute;
  right: 0.3em;
  top: 50%;
  transform: translateY(-50%);
  width: 1em;
  height: 1em;
  background: currentColor;
  -webkit-mask: ${CHEVRON_MASK} center / contain no-repeat;
  mask: ${CHEVRON_MASK} center / contain no-repeat;
  opacity: 0.4;
  pointer-events: none;
}

/* Hide scrollbars: kiosk display, no manual scroll */
.fsc-root,
.fsc-root * {
  scrollbar-width: none;
}
.fsc-root::-webkit-scrollbar,
.fsc-root *::-webkit-scrollbar {
  display: none;
}

`;
