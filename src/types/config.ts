import type { RewardData } from '@/lib/reward-data';

export type BuiltinModuleType =
  | 'clock'
  | 'calendar'
  | 'weather'
  | 'countdown'
  | 'dad-joke'
  | 'text'
  | 'image'
  | 'video'
  | 'quote'
  | 'todo'
  | 'sticky-note'
  | 'greeting'
  | 'news'
  | 'stock-ticker'
  | 'crypto'
  | 'word-of-day'
  | 'history'
  | 'moon-phase'
  | 'sunrise-sunset'
  | 'photo-slideshow'
  | 'qr-code'
  | 'year-progress'
  | 'traffic'
  | 'sports'
  | 'air-quality'
  | 'todoist'
  | 'rain-map'
  | 'multi-month'
  | 'garbage-day'
  | 'standings'
  | 'affirmations'
  | 'date'
  | 'display-control'
  | 'meal-planner'
  | 'iframe'
  | 'icon'
  | 'shape'
  | 'chore-chart'
  | 'fullscreen-calendar'
  | 'fullscreen-chore-chart'
  | 'fullscreen-meal-planner'
  | 'fullscreen-photo'
  | 'fullscreen-weather';

type PluginModuleType = `plugin:${string}`;

export type ModuleType = BuiltinModuleType | PluginModuleType;

export interface ModuleStyle {
  opacity: number;
  borderRadius: number;
  padding: number;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  fontSize: number;
  /** Numeric weight 100–900. Omitted = normal (400). */
  fontWeight?: number;
  /**
   * Optional centered header strip rendered at the top of the module card,
   * above the content. Empty/omitted = no strip and no reserved space
   * (layout identical to a title-less module).
   */
  title?: string;
  /** Title strip font size in px. Omitted = falls back to `fontSize`. */
  titleFontSize?: number;
  backdropBlur: number;
  borderWidth: number;
  borderColor: string;
  shadowSize: number;
}

export interface ModulePosition {
  x: number;
  y: number;
}

export interface ModuleSize {
  w: number;
  h: number;
}

export interface ModuleSchedule {
  daysOfWeek?: number[];    // 0=Sun, 1=Mon, ... 6=Sat (omit = every day)
  startTime?: string;       // "06:00" (omit = from midnight)
  endTime?: string;         // "09:00" (omit = until midnight)
  invert?: boolean;         // if true, HIDE during this window instead of show
}

/**
 * Declarative condition over shared-state keys (see `shared-state-store.ts`).
 * A closed, serializable union by design — no templates — so conditions stay
 * visually editable, validatable, and dependency-trackable. Mirrors Home
 * Assistant's conditional schema.
 */
export type VisibilityCondition =
  | { kind: 'state'; sourceKey: string; equals?: string | string[]; notEquals?: string | string[] }
  | {
      kind: 'numeric';
      sourceKey: string;
      above?: number;
      /** When true, `above` is an inclusive bound (>=) instead of strict (>). */
      aboveInclusive?: boolean;
      below?: number;
      /** When true, `below` is an inclusive bound (<=) instead of strict (<). */
      belowInclusive?: boolean;
    }
  | {
      /**
       * Local time-of-day / day-of-week gate — no shared-state key, so it fences
       * a condition tree (or a rule) by the clock ("doorbell takeover only
       * 07:00–21:00"). Fields mirror `ModuleSchedule` exactly (same HH:MM format,
       * same 0=Sun day numbering, same overnight-window semantics where
       * start > end wraps past midnight). Evaluated against the display's
       * configured timezone, like every other schedule. All fields absent means
       * "always true". Never evaluates to unknown, so it does not trip
       * `whenUnknown`.
       */
      kind: 'time';
      daysOfWeek?: number[];    // 0=Sun … 6=Sat (omit / empty = every day)
      startTime?: string;       // "07:00" (omit = from midnight)
      endTime?: string;         // "21:00" (omit = until midnight)
    }
  | { kind: 'and'; conditions: VisibilityCondition[] }
  | { kind: 'or'; conditions: VisibilityCondition[] }
  | { kind: 'not'; conditions: VisibilityCondition[] };

export interface ModuleVisibility {
  /** Implicit AND across the array (Home Assistant semantics). Met → show, unmet → hide. */
  conditions: VisibilityCondition[];
  /**
   * Outcome while ANY referenced key is not yet published (default 'hide').
   * This is an all-or-nothing gate evaluated before the condition tree, so
   * the boolean algebra never sees a three-valued input.
   */
  whenUnknown?: 'hide' | 'show';
}

export interface ModuleInstance {
  id: string;
  /**
   * When `false`, the module is excluded from the live display, prefetch,
   * and schedule evaluation. The module is still rendered (dimmed) in the
   * editor so users can re-enable it. Omitted / `true` = enabled.
   * Mirrors `Screen.enabled`.
   */
  enabled?: boolean;
  type: ModuleType;
  position: ModulePosition;
  size: ModuleSize;
  zIndex: number;
  config: Record<string, unknown>;
  style: ModuleStyle;
  schedule?: ModuleSchedule;
  /** Conditional visibility over shared state — AND-combined with schedule + enabled. */
  visibility?: ModuleVisibility;
  /**
   * When true, this instance never renders on screen; it mounts once in the
   * hidden BackgroundProviderLayer so its data loop (and any state it
   * publishes) survives screen rotation. Background-ONLY, not "also run in
   * background" — a user who wants the widget visible adds a second,
   * un-flagged instance.
   */
  backgroundProvider?: boolean;
}

export interface BackgroundRotation {
  enabled: boolean;
  source?: 'unsplash' | 'nasa-apod' | 'immich' | 'icloud';
  query: string;
  intervalMinutes: number;
  immichAlbumId?: string;
  immichPersonId?: string;
  immichFavoritesOnly?: boolean;
  /** Public share link (icloud.com/sharedalbum/#TOKEN) or bare token. */
  icloudAlbumUrl?: string;
}

export interface Screen {
  id: string;
  name: string;
  enabled?: boolean;
  backgroundImage: string;
  backgroundRotation?: BackgroundRotation;
  modules: ModuleInstance[];
  /**
   * Optional override for auto-rotation duration, in milliseconds.
   * - undefined (default): inherit settings.rotationIntervalMs (after any display override).
   * - 0: sticky — auto-rotation is disabled on this screen (manual advance only).
   * - positive integer: this screen auto-advances after exactly this many ms.
   */
  rotationDurationMs?: number;
  /** When present, screen only rotates in during matching days/times. */
  schedule?: ModuleSchedule;
}

export interface WeatherSettings {
  provider: 'openweathermap' | 'weatherapi' | 'pirateweather' | 'noaa' | 'open-meteo' | 'yr' | 'smhi' | 'metoffice' | 'envcanada';
  latitude: number;
  longitude: number;
  units: 'metric' | 'imperial';
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  allDay: boolean;
  calendarColor?: string;
  sourceId?: string;
  sourceName?: string;
  /** Set by the birthday/holiday sources; absent means a plain event. */
  kind?: 'birthday' | 'holiday' | 'event';
  /** Birthday only — the person's birth year, when the source can determine it. */
  birthYear?: number;
  /**
   * Render-time decorations stamped by a module's event rules
   * (`applyEventRules`); never set by a source. `icon` replaces the color
   * dot / kind glyph, `opacity` multiplies whatever fade the view applies.
   */
  icon?: string;
  opacity?: number;
}

export interface ICalSource {
  id: string;
  type: 'ical';
  name: string;
  url: string;
  color: string;
  enabled: boolean;
}

export interface ICloudSource {
  id: string;
  /** ICloudAccount.id in data/icloud-accounts.json (credentials never live in config) */
  accountId: string;
  /** 'calendar' = a CalDAV calendar; 'birthdays' = contact birthdays via CardDAV */
  kind: 'calendar' | 'birthdays';
  /** CalDAV calendar URL; empty for kind 'birthdays' */
  url: string;
  name: string;
  color: string;
  enabled: boolean;
}

/**
 * A household member for the per-person calendar views (family grid, free
 * time). `sourceIds` are the calendar sources (Google id, iCal/iCloud id)
 * whose events belong to this person; a source assigned to nobody is shared
 * by everyone. Optional, so a household that never sets people up still gets
 * the per-source fallback those views render.
 */
export interface CalendarPerson {
  id: string;
  name: string;
  color: string;
  sourceIds: string[];
}

export interface CalendarSettings {
  googleCalendarId: string;
  googleCalendarIds: string[];
  icalSources: ICalSource[];
  icloudSources?: ICloudSource[];
  people?: CalendarPerson[];
  maxEvents: number;
  daysAhead: number;
  holidayCountry?: string; // ISO 3166-1 alpha-2 country code (e.g. 'US')
  hideDeclined?: boolean; // Google only: skip events the signed-in account declined
}

export interface SleepSettings {
  enabled: boolean;
  /**
   * Gates the idle-inactivity dim/sleep machinery only; schedules below run
   * regardless. Absent means true — every config saved before this field
   * existed had idle dimming on, so absence must keep behaving that way.
   */
  idleDimEnabled?: boolean;
  dimAfterMinutes: number;
  sleepAfterMinutes: number;
  dimBrightness: number;
  dimSchedule?: {
    startTime: string; // "23:00"
    endTime: string;   // "06:00"
  };
  schedule?: {
    startTime: string; // "23:00"
    endTime: string;   // "06:00"
  };
  /**
   * How long an explicit wake (touch, remote wake button, remote navigation,
   * a remote brightness command) keeps the display awake when it lands
   * inside an active sleep/dim schedule window, before the schedule
   * re-asserts. Absent means DEFAULT_WAKE_HOLD_MINUTES; 0 means no hold (the
   * schedule re-asserts on the next 10s tick). The hold is only ever armed
   * inside a schedule window, so idle dimming timing stays governed by
   * dimAfterMinutes alone.
   */
  wakeHoldMinutes?: number;
}

export type ScreensaverMode = 'clock' | 'blank' | 'off';

export interface ScreensaverSettings {
  mode: ScreensaverMode;
}

export type TransitionEffect =
  | 'fade' | 'slide' | 'slide-up' | 'zoom'
  | 'flip' | 'blur' | 'crossfade' | 'none';

export type AlertType = 'info' | 'warning' | 'urgent';

export interface AlertSettings {
  enabled: boolean;
  position: 'top' | 'bottom';
  maxVisible: number;
  defaultDuration: number; // ms — 0 means use per-type defaults
  scale?: number; // 0.75–2.0, default 1.0
}

export interface BackupReminderSettings {
  enabled: boolean;
  intervalDays: number; // default 7
}

export interface UpdateNotificationSettings {
  enabled: boolean;
}

export interface GlobalSettings {
  rotationIntervalMs: number;
  displayWidth: number;
  displayHeight: number;
  displayTransform?: 'normal' | '90' | '180' | '270';
  latitude: number;
  longitude: number;
  locationName?: string;
  timezone?: string;
  weather: WeatherSettings;
  calendar: CalendarSettings;
  sleep?: SleepSettings;
  screensaver?: ScreensaverSettings;
  cursorHideSeconds?: number;
  activeProfile?: string;
  transitionEffect?: TransitionEffect;
  transitionDuration?: number;
  updateChannel?: 'stable' | 'dev';
  advancedMode?: boolean;
  alerts?: AlertSettings;
  telemetryEnabled?: boolean;
  fullscreenTheme?: string;
  pauseEnabled?: boolean;
  pauseTimeoutSeconds?: number;
  /** Flick left/right on the touchscreen to change screens. Default true. */
  swipeEnabled?: boolean;
  backupReminder?: BackupReminderSettings;
  updateNotification?: UpdateNotificationSettings;
  /** BCP-47 tag (e.g. "en-US", "de-DE"). Defaults to "en-US". */
  locale?: string;
  /** Optional override for date/number formatting only. Falls back to `locale`. */
  formattingLocale?: string;
  /** Household 12/24-hour preference. Calendar module time lines and grid
   *  pills resolve against this; the meal planner follows it unless its own
   *  timeFormat override is set. Absent = 12h. Global-only like `locale`. */
  timeFormat?: TimeFormat;
}

/** Household 12/24-hour clock preference (`GlobalSettings.timeFormat`). */
export type TimeFormat = '12h' | '24h';

/** Absent-value default for `GlobalSettings.timeFormat`; the prop builder and
 *  the calendar module both resolve against this single constant. */
export const DEFAULT_TIME_FORMAT = '12h' as const;

export interface Profile {
  id: string;
  name: string;
  screenIds: string[];
  schedule?: ModuleSchedule;
}

/**
 * What a display rule does when its conditions become true.
 * A closed, serializable union for the same reasons `VisibilityCondition`
 * is one: actions stay visually editable, validatable, and safe to evaluate.
 * Deliberately NOT in v1: webhooks, service calls, sounds, module-level
 * actions, else-branches.
 */
export type RuleAction =
  | {
      kind: 'showScreen';
      /** Target screen id, resolved against the owning display's full screen list. */
      screenId: string;
      /**
       * 'while': pinned while the condition holds (min hold 5s to ride out
       * flaps; the shared-state tombstone grace already smooths producer
       * restarts). 'for': shown for `seconds`, then rotation resumes.
       */
      mode: 'while' | 'for';
      /** Required when mode === 'for'. */
      seconds?: number;
    }
  | { kind: 'wake' } // wake from sleep; no-op if awake
  | { kind: 'sleep' }; // put the display to sleep, exactly like the remote sleep command; ends any active takeover

/**
 * A condition → action rule owned by a display. Rules reuse the visibility
 * condition tree and evaluator unchanged; they are edge-triggered (fire on
 * the false→true transition only, so a reboot never slams the display onto
 * an alert screen for a condition that has been true for days).
 */
export interface DisplayRule {
  id: string;
  /** "Doorbell → front camera" */
  name: string;
  /** Default true, mirrors ModuleInstance.enabled. */
  enabled?: boolean;
  /** Implicit AND, same tree + evaluator as ModuleVisibility. */
  when: VisibilityCondition[];
  action: RuleAction;
  /** Seconds after a firing during which the rule will not re-fire. Default 0. */
  cooldownSeconds?: number;
}

/**
 * Per-display settings overrides. Any field omitted falls back to GlobalSettings.
 * Nested objects (sleep, screensaver, alerts) are full-replacement, NOT deep-merged —
 * partial overrides would create surprising fallback chains. Override the whole
 * object or omit it.
 *
 * Adding a new override here is sufficient to make `filterConfigForDisplay`
 * pick it up: the merge in `display-filter.ts` is `{ ...global, ...perDisplay }`,
 * so the field flows through automatically without any merge-logic change.
 */
export interface DisplayNodeSettings {
  displayWidth?: number;
  displayHeight?: number;
  displayTransform?: 'normal' | '90' | '180' | '270';
  rotationIntervalMs?: number;
  transitionEffect?: TransitionEffect;
  transitionDuration?: number;
  sleep?: SleepSettings;
  screensaver?: ScreensaverSettings;

  // Per-display rendering / interaction overrides
  fullscreenTheme?: string;
  cursorHideSeconds?: number;
  pauseEnabled?: boolean;
  pauseTimeoutSeconds?: number;
  swipeEnabled?: boolean;
  alerts?: AlertSettings;

  // NOTE: per-display location overrides (latitude/longitude/locationName/
  // timezone) were intentionally NOT added. The server-side API routes
  // that fetch weather/air-quality/calendar data read location via
  // `readConfig()` directly, not through `filterConfigForDisplay`, so a
  // per-display override would only affect client-side rendering — the
  // actual weather module would still hit the hub's coordinates. Ship
  // this properly by threading displayId into those routes first, then
  // re-introduce the override fields here.
}

/**
 * A named display device. Each display owns its own list of screens, designed
 * at its own resolution and orientation — this is how a portrait kitchen
 * touchscreen can live alongside a landscape living-room TV without either
 * of them squashing the other's layout.
 *
 * When `displays` is undefined/empty on the parent ScreenConfiguration, the
 * system runs in single-display mode (no DisplayNode exists at all; the
 * legacy `ScreenConfiguration.screens` is rendered directly).
 */
export interface DisplayNode {
  /** URL-safe slug used as the route segment: /display/<id> */
  id: string;
  /** Human-readable label shown in the editor */
  name: string;
  /**
   * Screens owned by this display. Each display has its own independent list,
   * laid out at this display's resolution.
   */
  screens: Screen[];
  /** Canvas width in pixels (overrides GlobalSettings.displayWidth) */
  displayWidth?: number;
  /** Canvas height in pixels (overrides GlobalSettings.displayHeight) */
  displayHeight?: number;
  /** wlr-randr transform applied at boot on the display-only Pi (informational on the hub side) */
  displayTransform?: 'normal' | '90' | '180' | '270';
  /**
   * Profiles owned by this display. When present, this display ignores the
   * global `config.profiles` pool. Owned profile `screenIds` reference this
   * display's own `screens`.
   */
  profiles?: Profile[];
  /** Per-display active profile (falls back to GlobalSettings.activeProfile) */
  activeProfile?: string;
  /** Per-display setting overrides (rotation interval, sleep, etc.) */
  settings?: DisplayNodeSettings;
  /**
   * Condition → action rules owned by this display. Owned like `screens` —
   * there is no shared pool or global fallback in multi-display mode.
   */
  rules?: DisplayRule[];
}

export interface ScreenConfiguration {
  version: number;
  settings: GlobalSettings;
  screens: Screen[];
  profiles?: Profile[];
  /** Display rules for legacy single-display mode (multi-display rules live on each DisplayNode). */
  rules?: DisplayRule[];
  /** Multi-display registry. Omitted = single-display mode (backward compat). */
  displays?: DisplayNode[];
}

// Default style for new modules
export const DEFAULT_MODULE_STYLE: ModuleStyle = {
  opacity: 1,
  borderRadius: 12,
  padding: 16,
  backgroundColor: 'rgba(0, 0, 0, 0.4)',
  textColor: '#ffffff',
  fontFamily: 'inter',
  fontSize: 16,
  backdropBlur: 12,
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.15)',
  shadowSize: 8,
};

// Clock module config
// Two curated dropdowns, not free-form pickers: `elapsedFormat` covers the
// issue's "50d 20h 13m" / "50:20:13" / "50 days" / "50D" shapes, and
// `elapsedPrecision` covers "how much detail" — a fixed unit set shown
// unconditionally, deliberately not an open unit checklist, since most
// combinations (e.g. hours+seconds only) are not something anyone would pick.
export type ElapsedFormat = 'units' | 'unitsUpper' | 'unitsShort' | 'colon' | 'words' | 'wordsTitle';
export type ElapsedPrecision = 'auto' | 'days' | 'daysHours' | 'daysHoursMinutes' | 'daysHoursMinutesSeconds';

export type ClockView =
  | 'classic' | 'digital' | 'analog' | 'minimal' | 'flip'
  | 'word' | 'binary' | 'vertical' | 'split' | 'progress'
  | 'fuzzy' | 'world' | 'dot-matrix' | 'radial' | 'arc'
  | 'neon' | 'bar' | 'elapsed';

export interface WorldClockZone {
  label: string;
  timezone: string;
}

export interface ClockConfig {
  view: ClockView;
  format24h: boolean;
  showSeconds: boolean;
  showDate: boolean;
  dateFormat: string;
  showWeekNumber: boolean;
  showDayOfYear: boolean;
  /** IANA zone id (e.g. "Asia/Tokyo"); empty/absent = follow the display setting. */
  timezone?: string;
  // View-specific
  showNumerals: boolean;        // analog: hour numbers on face
  animateFlip: boolean;         // flip: show flip animation on digit change
  accentColor: string;          // shared accent for several views
  worldZones: WorldClockZone[]; // world: additional timezones (max 3)
  referenceTime: string;        // elapsed: ISO timestamp or time string
  referenceLabel: string;       // elapsed: label ("market open", "shift start")
  countUp: boolean;             // elapsed: count up (true) or down (false)
  elapsedFormat: ElapsedFormat;         // elapsed: how units are rendered
  elapsedPrecision: ElapsedPrecision;   // elapsed: which units are shown
}

// Fullscreen calendar module config (Skylight-inspired ambient display)
export type FullscreenCalendarView =
  | 'schedule' | 'week-list' | 'month-grid' | 'day-timeline' | 'agenda'
  | 'family-grid' | 'up-next' | 'free-time';
// Time-grid hour range: the configured fixed hours, or a window of
// `rollingHours` that slides with the clock so what is next stays full size.
export type HourWindowMode = 'fixed' | 'rolling';
export type CalendarDensity = 'cozy' | 'snug';
export type FullscreenTypographySize =
  | 'small' | 'medium' | 'large' | 'extra-large' | '2x-large' | '3x-large' | '4x-large';
export type TodayHighlightStyle = 'full' | 'subtle' | 'minimal' | 'off';
export type EventOverlapMode = 'columns' | 'stacked';
export type EventTapStyle = 'sheet' | 'card';
export type WeekStartDay = 'sunday' | 'monday';
// Where forecast data renders: module header pill, day headers (daily
// forecast), event rows (hourly at the event's start time), or both.
export type WeatherPlacement = 'off' | 'header' | 'days' | 'events' | 'days-and-events';
// Source legend (one dot + name per source with an event in the rendered
// window): hidden, a row in the module header, or a footer strip.
export type CalendarLegendPlacement = 'off' | 'header' | 'footer';

// Case-insensitive substring match against the event title. Empty terms = no filter.
export interface CalendarTitleFilter {
  mode: 'include' | 'exclude';
  terms: string[];
}

// ─── Rules engines (event looks / day looks) ───
// Every set field in a match must hold (AND); an empty match matches
// everything. Rules run top to bottom and the first rule that sets a
// property wins for that property, so list order is the priority.

export type CalendarRuleTextMatch = 'contains' | 'exact' | 'regex';

export interface CalendarEventMatch {
  /** Matched against the event title per `textMatch` (case-insensitive). */
  text?: string;
  textMatch?: CalendarRuleTextMatch;   // default 'contains'
  /** Any of these source ids (Google id, iCal/iCloud id, 'holidays'). */
  sourceIds?: string[];
  /** Case-insensitive substring of the location. */
  location?: string;
  allDay?: boolean;
  /** true = already ended, false = still upcoming or running. */
  past?: boolean;
  kind?: 'birthday' | 'holiday' | 'event';
}

export interface CalendarEventRule {
  id: string;
  match: CalendarEventMatch;
  hide?: boolean;
  color?: string;       // replaces the source color
  opacity?: number;     // 0.1-1, multiplies the view's own fade
  icon?: string;        // emoji / short text in place of the dot or kind glyph
  title?: string;       // display title override
}

export type CalendarDayWhen = 'today' | 'past' | 'future';
export type CalendarDayEvents = 'any' | 'none' | 'matching';

export interface CalendarDayMatch {
  when?: CalendarDayWhen;
  /** 0 = Sunday. Empty or unset = every day. */
  daysOfWeek?: number[];
  /** 'any' = has at least one event, 'none' = empty day, 'matching' = has an event matching `eventMatch`. */
  withEvents?: CalendarDayEvents;
  eventMatch?: CalendarEventMatch;
}

export interface CalendarDayRule {
  id: string;
  match: CalendarDayMatch;
  /** CSS color, or 'auto' = tinted from that day's event colors. */
  background?: string;
  opacity?: number;
  borderColor?: string;
  badgeIcon?: string;
  badgeText?: string;
  badgeColor?: string;
}

/**
 * Health of the shared calendar fetch, passed to calendar modules only while
 * the latest attempt failed (the events alongside it are kept last-good
 * data). `updatedAt` is when that data was last successfully fetched; null
 * means no fetch has ever succeeded this session.
 */
/**
 * Health of one calendar source in the shared `/api/calendar` payload. `id`
 * matches the event `sourceId` (Google calendar id, iCal/iCloud source id, or
 * 'holidays'). `name` is best-effort — a source that has never succeeded may
 * not have one. `fetchedAt` is when this source last delivered events; null
 * means never this session. `error` is plain family-friendly wording.
 */
export interface CalendarSourceStatus {
  id: string;
  name?: string;
  ok: boolean;
  error?: string;
  /** i18n key under the editor's `settings.calendarPage.health.errors.*`; preferred over `error` at render time. */
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  fetchedAt: number | null;
}

export interface CalendarFetchStatus {
  error: string | null;
  updatedAt: number | null;
}
// Agenda boundary separators; month beats week when boundaries coincide.
export type AgendaSeparators = 'none' | 'weeks' | 'weeks-and-months';
// Schedule view first column: sliding today, calendar-stable week start,
// or the upcoming weekend (Saturday, held through Sunday).
export type ScheduleStartAnchor = 'today' | 'start-of-week' | 'next-weekend';
export interface FullscreenCalendarConfig {
  view: FullscreenCalendarView;
  density: CalendarDensity;
  typographySize: FullscreenTypographySize;
  accentColor: string;
  // Dims whole past day columns/cells; default ON. Deliberately different
  // from CalendarConfig.dimPastEvents (compact daily view, default off,
  // today's-column rows only): same name, two view-specific behaviors.
  dimPastEvents: boolean;
  shadeWeekends: boolean;
  /** Deprecated: pre-weatherPlacement boolean; true resolves to 'header'. */
  showWeather?: boolean;
  weatherPlacement?: WeatherPlacement;  // default 'header' (new), legacy showWeather honored when unset
  showNowLine: boolean;
  sourceFilter?: string[];
  titleFilter?: CalendarTitleFilter;
  darkMode: boolean;
  theme?: string;
  todayHighlightStyle?: TodayHighlightStyle;  // default 'full'; 'subtle' = faint bg, 'minimal' = marker only, 'off' = none
  eventOverlap?: EventOverlapMode;            // default 'columns' (side-by-side); 'stacked' = cascading overlap
  wrapEventTitles?: boolean;                  // default false; wrap long titles to 2 lines (schedule + month views)
  eventTapDetails?: boolean;                  // default false; touch displays: tap an event to open a detail overlay
  eventTapStyle?: EventTapStyle;              // default 'sheet' (bottom sheet); 'card' = centered card
  startDay?: WeekStartDay;                    // first day of the week wherever a view is week-anchored (week/month grids, family grid, the schedule 'start-of-week' anchor, agenda week separators). Default sunday

  // List views (agenda + week-list): one shared status slot per event row —
  // a countdown pill before the event starts, replaced by a progress bar
  // while it runs. All-day rows opt into countdowns separately ("in 0 days"
  // noise on all-day events is the known failure mode).
  showCountdown?: boolean;          // default false
  showProgressBar?: boolean;        // default false
  countdownAllDay?: boolean;        // default false; only meaningful with showCountdown
  // Custom wording for empty days ("Free day!", "Leftovers"); '' = default.
  emptyDayText?: string;

  // Time grids (schedule + day timeline): fixed configured hours, or a
  // window that slides with the clock. Rolling starts one hour before now
  // and always fits inside the configured fixed range's day.
  hourWindow?: HourWindowMode;      // default 'fixed'
  rollingHours?: number;            // 4-16, default 8; only with hourWindow 'rolling'

  // Schedule view
  scheduleDaysToShow: number;       // 1-7, 0 = auto
  scheduleHourStart: number;        // 0-23
  scheduleHourEnd: number;          // 1-24
  scheduleShowDescription?: boolean;
  scheduleStartAnchor?: ScheduleStartAnchor;  // default 'today'

  // Week list view
  weekCollapsePastDays: boolean;
  weekShowDescription?: boolean;
  // Household data on the week list: the day's planned meals (from the
  // meal planner) and one aggregate chore row per day (from the chore chart).
  showMeals?: boolean;              // default false
  showChores?: boolean;             // default false

  // Family grid view (people as rows, the week as columns)
  familyShowEveryoneRow?: boolean;  // default true; shared events on their own row

  // Up next view
  upNextLaterCount?: number;        // 0-6, default 3: rows under the hero
  upNextShowEarlier?: boolean;      // default true: today's finished / running events
  upNextShowTomorrow?: boolean;     // default true

  // Free time view
  freeTimeHourStart?: number;       // 0-23, default 7
  freeTimeHourEnd?: number;         // 1-24, default 22
  freeTimeShowTomorrow?: boolean;   // default true

  // Month grid view
  monthShowWeekNumbers: boolean;
  monthMaxEventsPerCell: number;    // 0 = auto

  // Day timeline view
  dayHourStart: number;
  dayHourEnd: number;
  dayShowLocation: boolean;
  dayShowDescription?: boolean;

  // Agenda view
  agendaDaysAhead: number;          // 7-30
  agendaHideEmptyDays: boolean;
  // Keep events that already ended today on the list (dimmed via
  // dimPastEvents) until midnight instead of dropping them as they end.
  // Mirrors CalendarConfig.agendaShowFinishedToday in name, but the
  // policies differ deliberately: this view has no row cap, so it keeps
  // only the most recent few finished rows (FINISHED_TODAY_MAX in
  // AgendaView); the compact agenda backfills leftover maxEvents budget.
  agendaShowFinishedToday?: boolean;  // default false
  agendaShowDescription?: boolean;
  agendaSeparators?: AgendaSeparators;  // default 'none'
  // Sources present in the rendered window, as dot + name. Default 'off'.
  showLegend?: CalendarLegendPlacement;
  // Rules engines: per-event looks and per-day looks / badges. Unset = off.
  eventRules?: CalendarEventRule[];
  dayRules?: CalendarDayRule[];
}

// Calendar module config
export type CalendarViewMode = 'daily' | 'agenda' | 'week' | 'multi-week' | 'month';

export type CalendarGridTheme = 'banner' | 'clean' | 'minimal' | 'vivid';

export interface CalendarConfig {
  viewMode: CalendarViewMode;
  daysToShow: number;
  showTime: boolean;
  showLocation: boolean;
  maxEvents: number;
  showWeekNumbers: boolean;
  // Multi-week grid view: total weeks rendered, 4-12 (row 1 = current week)
  weeksToShow?: number;
  // Grid views (week / month / multi-week): event pills per day cell before
  // "+N more", 2-10. Unset = 5 on the week grid (its cells run a full column
  // tall), 4 on the shorter month and multi-week cells.
  gridMaxEventsPerCell?: number;
  // Grid views (week / month / multi-week): first column day. Default sunday.
  startDay?: WeekStartDay;
  // Grid views (week / month / multi-week): event rendering style.
  // 'classic' (default) = colored dot + faint light pill + default text.
  // 'colored' = timed events render time + title in the calendar's color
  // with no background; all-day events render a solid calendar-color pill.
  gridEventStyle?: 'classic' | 'colored';
  // Colored style only: faint light pill background behind timed events.
  gridEventPillBackground?: boolean;
  // Month + multi-week grid theme (the two views share one renderer and
  // differ only in range). 'banner' (default when unset) is the original
  // look: tinted day-number strips, padded times, pills driven by
  // gridEventStyle. 'clean' / 'minimal' / 'vivid' share the modern skeleton
  // (month or month-range header, corner day numbers, today ring, stitched
  // multi-day pills) and differ only in pill treatment — they supersede
  // gridEventStyle and gridEventPillBackground for these views.
  gridTheme?: CalendarGridTheme;
  sourceFilter?: string[];  // undefined or empty = all sources (merged)
  titleFilter?: CalendarTitleFilter;
  accentColor?: string;     // Event indicator bar and today highlights; default '#3b82f6'
  // Per-view: render the sanitized event description under the title.
  dailyShowDescription?: boolean;
  agendaShowDescription?: boolean;
  eventTapDetails?: boolean;      // default false; touch displays: tap an event to open a detail overlay
  eventTapStyle?: EventTapStyle;  // default 'sheet' (bottom sheet); 'card' = centered card
  // List views (daily + agenda): shared status slot, same semantics as the
  // fullscreen calendar's — countdown pill before start, progress bar while
  // running. Timed events only; compact grid pills are untouched.
  showCountdown?: boolean;        // default false
  showProgressBar?: boolean;      // default false
  // Daily view: custom wording for empty day cells; '' = default.
  emptyDayText?: string;
  // Agenda view: week/month boundary separators (month beats week).
  agendaSeparators?: AgendaSeparators;  // default 'none'
  // Agenda view: keep events that already ended today on the list (dimmed)
  // until midnight instead of dropping them the moment they end, and group
  // an ongoing multi-day event under Today rather than the day it started.
  // Same name as the fullscreen toggle, different capping policy — see the
  // note on FullscreenCalendarConfig.agendaShowFinishedToday.
  agendaShowFinishedToday?: boolean;   // default false
  // Sources present in the rendered window, as dot + name. Default 'off'.
  showLegend?: CalendarLegendPlacement;
  // Daily view: dim events in today's column that have already ended.
  // Default off — deliberately different from the fullscreen module's
  // same-named toggle (whole past days, default on).
  dimPastEvents?: boolean;   // default false
  // Daily view: thin accent rule between today's ended and upcoming events.
  showNowRule?: boolean;     // default false
  // Rules engines: per-event looks and per-day looks / badges. Unset = off.
  eventRules?: CalendarEventRule[];
  dayRules?: CalendarDayRule[];
}

// Unified weather module config
export type WeatherView = 'current' | 'hourly' | 'daily' | 'combined' | 'compact' | 'table' | 'precipitation' | 'alerts';

export type WeatherIconSet = 'outline' | 'color';
export type WeatherProviderOption = 'global' | 'openweathermap' | 'weatherapi' | 'pirateweather' | 'noaa' | 'open-meteo' | 'yr' | 'smhi' | 'metoffice' | 'envcanada';

export interface WeatherConfig {
  view: WeatherView;
  iconSet: WeatherIconSet;
  provider: WeatherProviderOption;
  hoursToShow: number;
  showFeelsLike: boolean;
  daysToShow: number;
  showHighLow: boolean;
  showPrecipAmount: boolean;
  showPrecipitation: boolean;
  showHumidity: boolean;
  showWind: boolean;
  showPressure: boolean;
  showVisibility: boolean;
  showDewPoint: boolean;
  hideWhenNoAlerts: boolean;
  /** Render a place-name header above the view. Off by default so upgrades
   *  don't reflow any deployed weather module. */
  showLocation: boolean;
  /** Overrides the geocoded name when set — the escape hatch for the long
   *  strings Nominatim returns and for hand-entered coordinates. */
  locationLabel?: string;
}


// Countdown config
export type CountdownView = 'all' | 'next';

// Two curated dropdowns, mirroring the Clock elapsed view (`CountdownFormat`
// shares its unit styles with `formatDuration`). `'flip'` is the classic
// flip-card look and the default; the rest render as text. Countdown's
// `'auto'` keeps seconds ticking regardless of how far off the event is,
// unlike clock's elapsed `'auto'` which drops seconds past an hour.
export type CountdownFormat = 'flip' | 'units' | 'unitsUpper' | 'unitsShort' | 'colon' | 'words' | 'wordsTitle';
export type CountdownPrecision = 'auto' | 'days' | 'daysHours' | 'daysHoursMinutes' | 'daysHoursMinutesSeconds';

export interface CountdownEvent {
  id: string;
  name: string;
  date: string; // ISO date string
  recurring?: 'yearly';
  source?: 'custom' | 'holiday';
  backgroundImage?: string;
}

export interface CountdownConfig {
  events: CountdownEvent[];
  showPastEvents: boolean;
  stayUntilEndOfDay?: boolean; // When true, an event that has hit zero stays visible until the end of the calendar day in the configured timezone.
  scale: number; // 0.5 – 5.2, default 1. View-independent: the same value renders the same pixel size in every CountdownView.
  view: CountdownView;
  holidayCountry?: string;
  format: CountdownFormat;    // how units render: flip cards (default) or a text style shared with Clock's elapsed view
  precision: CountdownPrecision; // which units are shown; 'auto' = days only when > 0, hours/minutes/seconds always
}

// Dad joke config
export interface DadJokeConfig {
  refreshIntervalMs: number;
  accentColor?: string;
  showDividers?: boolean;
}

// Text module config
export type TextEffect =
  | 'none'
  | 'typewriter'
  | 'fade-in'
  | 'gradient-sweep'
  | 'glow'
  | 'outline'
  | 'shadow'
  | '3d'
  | 'neon'
  | 'wave'
  | 'bounce'
  | 'shake'
  | 'color-cycle';

export type TextDecoration = 'none' | 'underline' | 'overline' | 'line-through';
export type TextRevealOnRotation = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'zoom';
export type TextWrapMode = 'normal' | 'nowrap' | 'balance' | 'pretty';

export interface TextConfig {
  content: string;
  alignment: 'left' | 'center' | 'right';
  orientation?: 'horizontal' | 'vertical' | 'sideways';
  verticalAlign?: 'top' | 'center' | 'bottom';
  // Rich text
  markdown?: boolean;
  // Auto-fit to container
  autoFit?: boolean;
  // Text effects
  effect?: TextEffect;
  // Content rotation (split by separator)
  rotationEnabled?: boolean;
  rotationIntervalMs?: number;
  rotationSeparator?: string;
  // Gradient text
  gradientEnabled?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
  gradientAngle?: number;
  // Typography
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  letterSpacing?: number;
  /** Font registry id (or raw CSS stack) overriding the module's global font. */
  fontFamily?: string;
  italic?: boolean;
  /** Unitless line-height multiplier. */
  lineHeight?: number;
  wordSpacing?: number;
  // Icon prefix (emoji or short text)
  icon?: string;
  // Dynamic template variables ({{time}}, {{date}}, {{greeting}}, etc.)
  templateVariables?: boolean;
  // Marquee scrolling
  marquee?: boolean;
  marqueeSpeed?: number;
  marqueeDirection?: 'left' | 'right' | 'up' | 'down';
  // Visual effect knobs (only applied when matching `effect` is selected)
  outlineWidth?: number;
  outlineColor?: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowBlur?: number;
  shadowColor?: string;
  // Text decoration
  textDecoration?: TextDecoration;
  textDecorationColor?: string;
  textDecorationThickness?: number;
  // Animation knobs
  animationSpeed?: number;        // seconds per cycle
  /** Palette for color-cycle effect. */
  colorCyclePalette?: string[];
  /** Reveal animation when rotation advances (only used when rotationEnabled). */
  revealOnRotation?: TextRevealOnRotation;
  // Layout polish
  /** Max width in px (0 or undefined = no limit). */
  maxWidth?: number;
  wrapMode?: TextWrapMode;
  dropCap?: boolean;
  dropCapColor?: string;
  /** Background color drawn behind the text glyphs (separate from module wrapper). */
  textBackground?: string;
  textBackgroundPadding?: number;
  textBackgroundRadius?: number;
  // Decorative
  showDividers?: boolean;
  accentColor?: string;
}

// Image module config
export interface ImageConfig {
  src: string;
  objectFit: 'cover' | 'contain' | 'fill';
  alt: string;
}

// Quote module config
export interface QuoteConfig {
  refreshIntervalMs: number;
  accentColor?: string;
}

// Todo module config
export interface TodoItem {
  id: string;
  text: string;
  /**
   * Authored *default* completion, set in the editor. In interactive mode this
   * is only the seed value: once a kiosk user taps an item, its live completion
   * lives in the runtime `todo-state.json` store (keyed by item id) and
   * overrides this default. See `lib/todo-data.ts`.
   */
  completed: boolean;
}

export interface TodoConfig {
  title: string;
  items: TodoItem[];
  accentColor?: string;
  /**
   * When true, the module renders each item as a tap target on the display so a
   * kiosk user can check/uncheck it. The tap persists to the runtime
   * `todo-state.json` store (NOT back into `config.json`, which the editor owns
   * and would clobber on save) and syncs to every display showing the same item
   * via the `/api/todo/state` poll. Defaults to false — existing read-only todos
   * stay read-only until opted in.
   */
  interactive?: boolean;
}

// Sticky note module config
export interface StickyNoteConfig {
  content: string;
  noteColor: string;
}

// Greeting module config
export interface GreetingConfig {
  name: string;
  accentColor?: string;
  weatherAware?: boolean;
}

// News module config
export type NewsView = 'headline' | 'list' | 'ticker' | 'compact';

export interface NewsConfig {
  feedUrl: string;
  view: NewsView;
  refreshIntervalMs: number;
  rotateIntervalMs: number;
  maxItems: number;
  showTimestamp: boolean;
  showDescription: boolean;
  tickerSpeed?: number;
  accentColor?: string;     // List bullet color; default undefined (text-based bullet)
}

// Stock ticker module config
export type StockTickerView = 'cards' | 'ticker' | 'table' | 'compact';

export interface StockTickerConfig {
  symbols: string;
  refreshIntervalMs: number;
  view: StockTickerView;
  cardScale?: number;
  tickerSpeed?: number;
  showSparkline?: boolean;  // Trend line on cards view; default true
}

// Crypto module config
export type CryptoView = 'cards' | 'ticker' | 'table' | 'compact';

export interface CryptoConfig {
  ids: string;
  refreshIntervalMs: number;
  view: CryptoView;
  cardScale?: number;
  tickerSpeed?: number;
  showSparkline?: boolean;  // Trend line on cards view; default true
}

// Word of the day module config
export interface WordOfDayConfig {
  accentColor?: string;
  showDividers?: boolean;
}

// This day in history module config
export interface HistoryConfig {
  refreshIntervalMs: number;
  rotationIntervalMs: number;
  accentColor?: string;
  showDividers?: boolean;
  sourceMuffinLabs?: boolean;
  sourceWikipedia?: boolean;
}

// Moon phase module config
export interface MoonPhaseConfig {
  showIllumination: boolean;
  showMoonTimes: boolean;
}

// Sunrise / Sunset module config
export type SunriseSunsetView = 'default' | 'arc' | 'circle';

/** Circle-view ring coloring. 'simple' (default when unset) paints the flat
    day/twilight/dark segments; 'sky' paints a gradient through event-anchored
    stops with stars in the astrodark window. */
export type SunriseSunsetTheme = 'simple' | 'sky';

export interface SunriseSunsetConfig {
  view: SunriseSunsetView;
  showDayLength: boolean;
  showGoldenHour: boolean;
  showAstroDark?: boolean;
  theme?: SunriseSunsetTheme;
}

// Photo slideshow module config
/**
 * One entry in a typed media list. `/api/backgrounds` and `/api/immich/photos`
 * return plain `string[]` URL lists unless a `media=` query param is present
 * (set only when a slideshow's `mediaTypes` is not 'photos'), in which case
 * they return this shape — so pre-video configs keep their old responses.
 */
export interface MediaListItem {
  url: string;
  type: 'image' | 'video';
  /** Thumbnail for video entries (shown while the decoder spins up, and in the editor). */
  posterUrl?: string;
  /** Source-reported duration, when the backend knows it (Immich does; local files don't). */
  durationMs?: number;
}

/** Which media kinds a slideshow should pull from its source. */
export type SlideshowMediaTypes = 'photos' | 'videos' | 'both';

export interface PhotoSlideshowConfig {
  directory: string;
  intervalMs: number;
  transition: 'fade' | 'none';
  objectFit: 'cover' | 'contain' | 'fill';
  refreshIntervalMs: number;
  source?: 'local' | 'immich' | 'icloud' | 'onedrive';
  immichAlbumId?: string;
  immichPersonId?: string;
  immichFavoritesOnly?: boolean;
  immichCount?: number;
  /** Public share link (icloud.com/sharedalbum/#TOKEN) or bare token. */
  icloudAlbumUrl?: string;
  /** Graph driveItem ID of the OneDrive folder this module pulls from (source 'onedrive'). */
  onedriveFolderId?: string;
  /** Folder label captured at pick time — display only, the ID is authoritative. */
  onedriveFolderName?: string;
  /** Photos per refresh for source 'onedrive'. Default 50. */
  onedriveCount?: number;
  /** Default 'photos' — existing photo-only behavior. */
  mediaTypes?: SlideshowMediaTypes;
  /** Force-advance cap for video slides. Default 60000. */
  maxVideoDurationMs?: number;
}

// QR code module config
type QRCodeMode = 'custom' | 'wifi';
export type WifiAuthType = 'WPA' | 'WEP' | 'nopass';

export interface QRCodeConfig {
  mode: QRCodeMode;
  // Custom mode
  data: string;
  label: string;
  // WiFi mode
  ssid: string;
  password: string;
  authType: WifiAuthType;
  hiddenNetwork: boolean;
  showPassword: boolean;
  showNetworkName: boolean;
  // Shared
  fgColor: string;
  bgColor: string;
}

// Year progress module config
export interface YearProgressConfig {
  showYear: boolean;
  showMonth: boolean;
  showWeek: boolean;
  showDay: boolean;
  showPercentage: boolean;
  accentColor?: string;
}

// Traffic / Commute module config
export interface TrafficRoute {
  label: string;
  origin: string;
  destination: string;
}

export interface TrafficConfig {
  routes: TrafficRoute[];
  refreshIntervalMs: number;
}

// Sports scores module config
export type SportsView = 'scoreboard' | 'cards' | 'list' | 'ticker';

export interface SportsConfig {
  view: SportsView;
  leagues: string[];
  refreshIntervalMs: number;
  tickerSpeed?: number;
}

// Todoist module config
type TodoistViewMode = 'list' | 'board' | 'focus';
export type TodoistGroupBy = 'none' | 'project' | 'priority' | 'date' | 'label';
type TodoistSortBy = 'default' | 'priority' | 'due_date' | 'alphabetical';

export interface TodoistConfig {
  viewMode: TodoistViewMode;
  groupBy: TodoistGroupBy;
  sortBy: TodoistSortBy;
  projectFilter: string;
  labelFilter: string;
  showNoDueDate: boolean;
  showSubtasks: boolean;
  showLabels: boolean;
  showProject: boolean;
  showDescription: boolean;
  maxTasks: number;
  refreshIntervalMs: number;
  title: string;
  // When true, tapping a task on a touchscreen closes it via Todoist's API.
  allowComplete?: boolean;
}

// Air quality module config
export interface AirQualityConfig {
  showAQI: boolean;
  showPollutants: boolean;
  refreshIntervalMs: number;
}

// Multi-month calendar config
type MultiMonthView = 'vertical' | 'horizontal';

export interface MultiMonthConfig {
  view: MultiMonthView;
  monthCount: number;
  startDay: WeekStartDay;
  showWeekNumbers: boolean;
  highlightWeekends: boolean;
  showAdjacentDays: boolean;
}

// Garbage day module config
export type GarbageFrequency = 'weekly' | 'biweekly';

export interface GarbageDayConfig {
  trashDay: number;            // 0=Sun, 1=Mon, ..., 6=Sat, -1=disabled
  trashFrequency: GarbageFrequency;
  trashStartDate: string;      // ISO date anchor for biweekly calculation
  trashColor: string;
  recyclingDay: number;
  recyclingFrequency: GarbageFrequency;
  recyclingStartDate: string;
  recyclingColor: string;
  customDay: number;
  customFrequency: GarbageFrequency;
  customStartDate: string;
  customColor: string;
  customLabel: string;
  highlightMode: 'day-of' | 'day-before';
}

// Rain map module config
type RainMapStyle = 'dark' | 'standard';

export interface RainMapConfig {
  latitude: number;
  longitude: number;
  zoom: number;
  animationSpeedMs: number;
  extraDelayLastFrameMs: number;
  colorScheme: number;
  smooth: boolean;
  showSnow: boolean;
  opacity: number;
  showTimestamp: boolean;
  showTimeline: boolean;
  refreshIntervalMs: number;
  mapStyle: RainMapStyle;
}

// Standings module config
export type StandingsView = 'table' | 'compact' | 'conference';
export type StandingsGrouping = 'division' | 'conference' | 'league';

export interface StandingsConfig {
  view: StandingsView;
  league: string;
  grouping: StandingsGrouping;
  teamsToShow: number;
  showPlayoffLine: boolean;
  rotationIntervalMs: number;
  refreshIntervalMs: number;
}

// Affirmations module config
export type AffirmationsView = 'elegant' | 'card' | 'minimal' | 'typewriter';
export type AffirmationsCategory = 'affirmations' | 'compliments' | 'motivational' | 'gratitude' | 'mindfulness';

export interface CustomAffirmation {
  id: string;
  text: string;
  attribution?: string;
}

export interface AffirmationsConfig {
  view: AffirmationsView;
  categories: AffirmationsCategory[];
  rotationIntervalMs: number;
  showCategoryLabel: boolean;
  timeAware: boolean;
  weatherAware?: boolean;
  customEntries: CustomAffirmation[];
  accentColor: string;
}

// Meal planner module config
export type MealPlannerView = 'week' | 'today' | 'next-meal' | 'compact' | 'list';
export type MealSlotType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type GroceryCategory = 'produce' | 'dairy' | 'meat' | 'seafood' | 'bakery' | 'pantry' | 'frozen' | 'beverages' | 'other';

export interface MealIngredient {
  name: string;
  amount?: string;
  category?: GroceryCategory;
}

export interface SavedMeal {
  id: string;
  name: string;
  emoji?: string;
  category?: 'main' | 'side' | 'dessert' | 'drink' | 'snack';
  tags?: string[];
  prepTime?: number;      // minutes
  cookTime?: number;      // minutes
  difficulty?: 'easy' | 'medium' | 'hard';
  servings?: number;
  ingredients?: MealIngredient[];
  recipeUrl?: string;
  notes?: string;
  rating?: number;        // 1-5
  isFavorite?: boolean;
}

export interface PlannedMeal {
  date: string;           // ISO date "2026-04-04"
  slot: MealSlotType;
  mealId?: string;        // references SavedMeal.id
  customText?: string;    // "Eating out", "Leftovers"
  notes?: string;
  /** Optional serving time in 24-hour "HH:MM" format (e.g. "18:30"). Per-instance: Tuesday's dinner can be at 6:30 while Friday's is at 7:00. */
  time?: string;
}

/**
 * Shared meal-planner settings stored in `data/meals.json` (NOT per-module config).
 * These describe the household's planning model — what slots exist, when the week starts,
 * default times — and are edited from `/remote` so all meal modules stay consistent.
 */
export interface MealSettings {
  /** Which meal slots are enabled across all meal-planner modules */
  enabledSlots: MealSlotType[];
  /** First day of the planning week */
  weekStartDay: WeekStartDay;
  /**
   * Default serving time per slot in 24-hour "HH:MM" format. Used as a fallback
   * when a `PlannedMeal` does not have its own `time` set. Always present (may
   * be empty `{}`); per-slot keys are optional since not every slot needs a default.
   *
   * `normalizeMealSettings` guarantees this object exists at every read/write
   * boundary (server read, server write, client fetch), so consumers can access
   * `settings.defaultSlotTimes[slot]` directly without an outer optional check.
   */
  defaultSlotTimes: Partial<Record<MealSlotType, string>>;
  /**
   * Time display format override for meal serving times. Absent (the
   * default) follows the household `GlobalSettings.timeFormat`; an explicit
   * '12h' / '24h' wins everywhere meals are shown. Kept in the shared
   * settings block so /remote and all meal-planner module instances agree.
   */
  timeFormat?: TimeFormat;
}

/**
 * What tapping a meal with a saved recipeUrl does on the display:
 * 'qr' shows a fullscreen QR overlay, 'iframe' embeds the recipe page.
 * In the editor preview the recipe always opens in a new tab instead.
 */
export type RecipeTapAction = 'off' | 'qr' | 'iframe';

export interface MealPlannerConfig {
  view: MealPlannerView;
  showEmoji: boolean;
  showPrepTime: boolean;
  showTags: boolean;
  accentColor: string;
  tapRecipeAction?: RecipeTapAction;
}

// Icon module config (Font Awesome)
export type IconStyle = 'solid' | 'regular' | 'brands';
export type IconAnimation =
  | 'none'
  | 'spin'
  | 'spin-pulse'
  | 'spin-reverse'
  | 'beat'
  | 'fade'
  | 'beat-fade'
  | 'bounce'
  | 'shake'
  | 'flip';
export type IconFlip = 'none' | 'horizontal' | 'vertical' | 'both';
export type IconRotation = 0 | 90 | 180 | 270;

export interface IconConfig {
  /**
   * Icon name without the `fa-` prefix (e.g. "house", "cloud-sun", "github").
   * If the user pastes a full class string (anything containing a space or
   * starting with `fa-`), it is used verbatim and `style` is ignored.
   */
  iconName: string;
  /** Free Font Awesome style: solid, regular, or brands. */
  style: IconStyle;
  color: string;
  /** Background tint behind the icon glyph (separate from module wrapper bg). */
  iconBackground?: string;
  rotation: IconRotation;
  flip: IconFlip;
  animation: IconAnimation;
  /** Animation duration in seconds (Font Awesome --fa-animation-duration). */
  animationDuration: number;
  /**
   * Icon size as a fraction of the smaller container dimension (cqmin units).
   * 1.0 = fills the box, 0.5 = half. Ignored when `autoFit` is true.
   */
  scale: number;
  /** When true, scale is locked to 0.85 to leave a comfortable breathing margin. */
  autoFit: boolean;
}

// Shape & Divider module config
export type ShapeView =
  | 'divider'
  | 'double-line'
  | 'wave'
  | 'zigzag'
  | 'dotted-row'
  | 'rectangle'
  | 'circle'
  | 'triangle'
  | 'polygon'
  | 'star'
  | 'arrow'
  | 'glow'
  | 'gradient'
  | 'grid'
  | 'frame';

export type ShapeFillMode = 'solid' | 'gradient';
export type ShapeOrientation = 'horizontal' | 'vertical' | 'diagonal';
export type ShapeLineStyle = 'solid' | 'dashed' | 'dotted';
export type ShapeEndStyle = 'flat' | 'fade' | 'rounded';
export type ShapeArrowDirection = 'up' | 'right' | 'down' | 'left';
export type ShapeGridPattern = 'dots' | 'lines' | 'cross';
export type ShapeFrameStyle = 'rectangle' | 'brackets';

export interface ShapeConfig {
  view: ShapeView;

  // Fill & color (shared)
  fillMode: ShapeFillMode;
  color: string;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;

  // Line variants (divider, double-line, wave, zigzag, dotted-row)
  orientation: ShapeOrientation;
  thickness: number;
  lineStyle: ShapeLineStyle;
  /** Edge treatment for divider lines: flat ends, fade-to-transparent, or rounded caps. */
  endStyle: ShapeEndStyle;
  /** Wave/zigzag amplitude as % of viewBox height (0-50). */
  waveAmplitude: number;
  /** Number of full wave/zigzag cycles across the width. */
  waveFrequency: number;
  /** Number of dots in the dotted-row view. */
  dotCount: number;
  /** Dot radius in px for dotted-row. */
  dotSize: number;
  /** Pixel gap between the two parallel lines in double-line view. */
  doubleLineGap: number;

  // Geometric (rectangle, circle, triangle, polygon, star, arrow)
  outline: boolean;
  strokeWidth: number;
  cornerRadius: number;
  /** Polygon side count (3-12). */
  sides: number;
  /** Star point count (3-12). */
  starPoints: number;
  /** Star inner-to-outer radius ratio (0.2-0.8). Lower = pointier. */
  starInnerRatio: number;
  /** Rotation in degrees applied to geometric shapes. */
  rotation: number;
  arrowDirection: ShapeArrowDirection;
  /** Arrow head length as ratio of total length (0.1-0.6). */
  arrowHeadRatio: number;

  // Atmospheric (glow, gradient, grid)
  /** Glow gradient falloff: 0 = hard edge, 1 = soft edge. */
  softness: number;
  /** Glow center max alpha (0-1). */
  intensity: number;
  gridPattern: ShapeGridPattern;
  /** Grid spacing in px. */
  gridSpacing: number;
  /** Grid dot/line thickness in px. */
  gridDotSize: number;

  // Frame
  frameStyle: ShapeFrameStyle;
  /** Bracket length as % of side length (5-50). */
  bracketLength: number;
}

// iFrame / Web embed module config
export interface IframeConfig {
  url: string;
  refreshIntervalMs: number;
  scrollable: boolean;
  sandboxEnabled: boolean;
  sandbox: string;
  title: string;
}

// Date module config
export type DateView = 'full' | 'minimal' | 'stacked' | 'editorial' | 'banner';

export interface DateConfig {
  view: DateView;
  dateFormat: string;
  /** IANA zone id; empty/absent = follow the display setting. */
  timezone?: string;
  showDayName: boolean;
  showYear: boolean;
  showWeekNumber: boolean;
  showDayOfYear: boolean;
  accentColor: string;
}

// Display control module config
export interface DisplayControlConfig {
  layout: 'bar' | 'pad' | 'panel';
  /**
   * Target at mount time. 'self' resolves to the display this module renders
   * on (via useDisplayId). 'all' broadcasts. A display id targets that queue;
   * an unknown id falls back to 'self'.
   */
  defaultTarget: 'all' | 'self' | string;
  /** When false, the in-module picker is hidden even in multi-display mode. */
  allowRetargeting: boolean;
}

// Chore chart module config
export type ChoreChartView = 'board' | 'star-chart' | 'today' | 'progress' | 'compact';
export type ChoreTimeOfDay = 'morning' | 'afternoon' | 'evening' | 'anytime';
export type ChoreRotation = 'fixed' | 'rotate-daily' | 'rotate-weekly' | 'schedule';
export type ChoreResetFrequency = 'daily' | 'weekly' | 'biweekly' | 'once';

export interface ChoreMember {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface ChoreDefinition {
  id: string;
  name: string;
  emoji: string;
  points: number;
  frequency: ChoreResetFrequency;
  daysOfWeek: number[];
  specificDate?: string;            // YYYY-MM-DD — required when frequency is 'once'
  timeOfDay: ChoreTimeOfDay;
  assigneeIds: string[];
  rotation: ChoreRotation;
  schedule?: Record<string, number[]>;
}

export interface ChoreCompletion {
  choreId: string;
  memberId: string;
  date: string;
}

/** Request body for POST /api/chores — toggles a single completion on or off. */
export interface ChoreToggleRequest {
  choreId: string;
  memberId: string;
  /** YYYY-MM-DD; must be within the retention window (last 90 days through today). */
  date: string;
  /**
   * Idempotent mode for callers that can repeat a request (voice assistants):
   * 'complete' only ever adds the completion, 'uncomplete' only ever removes
   * it — a redundant request is a no-op with no points movement. Omitted =
   * plain toggle (the tap-to-flip behavior every UI surface uses).
   */
  direction?: 'complete' | 'uncomplete';
}

/** Response body for GET and POST /api/chores. */
export interface ChoreToggleResponse {
  completions: ChoreCompletion[];
  /** Present on POST responses so the client can update its rewards cache
   *  instantly after toggling, instead of waiting for the next rewards poll. */
  rewards?: RewardData;
  /** Set when an admin un-completes a chore whose points were already spent —
   *  the balance went negative as a result. UI should surface a warning. */
  warning?: string;
  /** POST only: false when a directional request was a no-op (already in the
   *  requested state), so callers can tell "just done" from "already done". */
  changed?: boolean;
}

/**
 * Per-module display settings for the chore chart. Members and chores are
 * deliberately absent: they are household data shared by every chore surface
 * and live in `data/chores.json`, served by `/api/chores/data`. Putting them
 * in module config would mean each placed module carried its own private copy.
 */
export interface ChoreChartConfig {
  view: ChoreChartView;
  weekStartDay: WeekStartDay;
  showPoints: boolean;
  showStreaks: boolean;
  showTimeOfDay: boolean;
  allowDisplayComplete: boolean;
  accentColor: string;
}

export type FullscreenChoreChartView = 'chores' | 'rewards-store';

export interface FullscreenChoreChartConfig {
  view: FullscreenChoreChartView;
  showRewardsButton: boolean;
  weekStartDay: WeekStartDay;
  showPoints: boolean;
  showStreaks: boolean;
  showTimeOfDay: boolean;
  allowDisplayComplete: boolean;
  darkMode: boolean;
  density: 'cozy' | 'snug';
  typographySize: FullscreenTypographySize;
  accentColor: string;
  theme?: string;
}

// Fullscreen meal planner module config
export type FullscreenMealPlannerView = 'week' | 'today' | 'menu-board' | 'next-meal';

export interface FullscreenMealPlannerConfig {
  view: FullscreenMealPlannerView;
  density: 'cozy' | 'snug';
  typographySize: FullscreenTypographySize;
  accentColor: string;
  showPrepTime: boolean;
  showTags: boolean;
  showEmoji: boolean;
  showDifficulty: boolean;
  theme?: string;
  tapRecipeAction?: RecipeTapAction;
}

// Fullscreen weather module config
/**
 * panorama — the flagship stack; almanac — instrument bento; ambient — huge
 * read-from-across-the-room; week — the daily forecast as the whole screen;
 * hourly — the next 24 hours as a timeline (down the page in portrait, across
 * it in landscape).
 */
export type FullscreenWeatherView = 'panorama' | 'almanac' | 'ambient' | 'week' | 'hourly';

/** 'auto' tints the background by condition and sun elevation; 'off' falls
 *  back to the flat theme background. The sky is a wash *behind* the cards,
 *  so turning it off never changes any text contrast. */
export type FullscreenWeatherSky = 'auto' | 'off';

export interface FullscreenWeatherConfig {
  view: FullscreenWeatherView;
  density: 'cozy' | 'snug';
  typographySize: FullscreenTypographySize;
  accentColor: string;
  theme?: string;
  /** Condition-reactive background wash. Default 'auto'. */
  skyLayer?: FullscreenWeatherSky;
  /** Falling rain/snow particles. Off is the cheap mode for slow Pis. Default true. */
  animateConditions?: boolean;
  /** Panorama: the minute-by-minute strip. Renders only when the provider
   *  returns minutely data (Pirate Weather today); hides itself otherwise. */
  showNowcast: boolean;
  /** Panorama + Almanac: severe-weather banner. */
  showAlerts: boolean;
  /** Clock in the header. Applies to every view. Default true. */
  showTime: boolean;
  /** Panorama: the 48h temperature ribbon. */
  showRibbon: boolean;
  /** Panorama: the bottom wind/humidity/UV/pressure/sunset rail. */
  showStatRail: boolean;
  /** Panorama + Week: how many forecast days the daily list shows (3-7). */
  daysToShow: number;
  /** Optional place-name override, mirroring WeatherConfig.locationLabel. */
  locationLabel?: string;
}

// Fullscreen photo viewer module config
export type FullscreenPhotoTransition = 'fade' | 'slide' | 'zoom' | 'none';

export interface FullscreenPhotoConfig {
  directory: string;
  file?: string;
  intervalMs: number;
  transition: FullscreenPhotoTransition;
  objectFit: 'cover' | 'contain' | 'fill';
  shuffle: boolean;
  showClock: boolean;
  kenBurns: boolean;
  theme?: string;
  source?: 'local' | 'immich' | 'icloud' | 'onedrive';
  immichAlbumId?: string;
  immichPersonId?: string;
  immichFavoritesOnly?: boolean;
  immichCount?: number;
  /** Public share link (icloud.com/sharedalbum/#TOKEN) or bare token. */
  icloudAlbumUrl?: string;
  /** Graph driveItem ID of the OneDrive folder this module pulls from (source 'onedrive'). */
  onedriveFolderId?: string;
  /** Folder label captured at pick time — display only, the ID is authoritative. */
  onedriveFolderName?: string;
  /** Photos per refresh for source 'onedrive'. Default 50. */
  onedriveCount?: number;
  /** Default 'photos' — existing photo-only behavior. */
  mediaTypes?: SlideshowMediaTypes;
  /** Force-advance cap for video slides. Default 60000. */
  maxVideoDurationMs?: number;
}

// Video module config
export interface VideoConfig {
  source: 'file' | 'url';
  /** Relative path under data backgrounds (same store as photo slideshows). */
  file?: string;
  /** Direct https mp4/webm URL. HLS is deliberately not supported yet. */
  url?: string;
  objectFit: 'cover' | 'contain' | 'fill';
  /** Default true. Sound additionally requires the kiosk autoplay launcher flag. */
  muted: boolean;
  loop: boolean;
  /** Safety cap that force-advances a stalled clip; 0/undefined = uncapped (loop covers it). */
  maxDurationMs?: number;
}

