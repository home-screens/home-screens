import type { RewardData } from '@/lib/reward-data';
import type { UpdateChannel } from '@/lib/semver';

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
  | 'fullscreen-news'
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
  /** Module opacity, 0 to 1 */
  opacity: number;
  /** Corner rounding in pixels */
  borderRadius: number;
  /** Inner padding in pixels */
  padding: number;
  /** Card background, any CSS color (e.g. `rgba(0,0,0,0.4)`) */
  backgroundColor: string;
  /** Text color, any CSS color */
  textColor: string;
  /** Font id from the built-in list below */
  fontFamily: string;
  /**
   * Text size in pixels (the smallest size, on modules that fit their text to their box). Stands as
   * it is while `textScale` is unset
   */
  fontSize: number;
  /**
   * Text size as a percent, 10 to 450, of what the module shows on its own. Unset leaves `fontSize`
   * as it is
   *
   * Text size, as a percent of what the module shows on its own (10..450):
   * the fitted size on a module that fits its text to its box, the registry
   * base pixel size everywhere else. The editor's only text-size control.
   * Absent on any module not touched since it existed, whose `fontSize` then
   * stands as it is (the size, or the floor on a fitting module), and the
   * editor shows that value as a percent. Kept apart from `fontSize` on
   * purpose: a stored pixel value must never be reinterpreted as a multiplier
   * of a fitted size (that happened once and doubled text on every wall that
   * had touched the slider).
   */
  textScale?: number;
  /**
   * One weight, 100 to 900, for all of the module's text. Unset keeps each module's own weights
   *
   * Numeric weight 100–900. Omitted = normal (400).
   */
  fontWeight?: number;
  /**
   * Centered title strip above the module content; empty or unset = no strip
   *
   * Optional centered header strip rendered at the top of the module card,
   * above the content. Empty/omitted = no strip and no reserved space
   * (layout identical to a title-less module).
   */
  title?: string;
  /**
   * Title strip text size in pixels; unset uses `fontSize`
   *
   * Title strip font size in px. Omitted = falls back to `fontSize`.
   */
  titleFontSize?: number;
  /** Blur behind the card, in pixels */
  backdropBlur: number;
  /** Border width in pixels */
  borderWidth: number;
  /** Border color, any CSS color */
  borderColor: string;
  /** Shadow size in pixels */
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
  /**
   * Days the window opens, 0 = Sunday through 6 = Saturday. Omit for every day
   *
   * 0=Sun, 1=Mon, ... 6=Sat (omit = every day)
   */
  daysOfWeek?: number[];
  /**
   * Start, as `HH:MM`. Omit to start at midnight
   *
   * "06:00" (omit = from midnight)
   */
  startTime?: string;
  /**
   * End, as `HH:MM`. Omit to end at midnight. An end earlier than the start closes the next
   * morning; an end equal to the start runs a full 24 hours
   *
   * "09:00" (omit = until midnight). An end earlier than the start closes the
   * next morning; an end equal to the start is a full 24 hours from the start,
   * which is how the editor stores a repeating window dragged out to a day.
   */
  endTime?: string;
  /**
   * Days after the start day that the window closes, 0 to 6, for one long stretch such as Monday
   * 08:00 until Thursday 20:00
   *
   * How many days after its start day the window closes. 0-6.
   *
   * Omitted, or 0, means a plain repeating window: same day, or the next
   * morning when `startTime >= endTime`. Above 0 it is one continuous stretch,
   * which the implicit wrap cannot reach. "Monday 08:00 until Thursday 20:00"
   * is `daysOfWeek: [1]`, `startTime: '08:00'`, `endTime: '20:00'`,
   * `endDayOffset: 3`.
   *
   * The editor treats a value above 0 as the stretch shape and gives it exactly
   * one start day, so its windows cannot repeat into each other. An
   * out-of-range or fractional value is ignored rather than trusted.
   */
  endDayOffset?: number;
  /**
   * Hide during the window instead of showing
   *
   * if true, HIDE during this window instead of show
   */
  invert?: boolean;
}

/**
 * Declarative condition over shared-state keys (see `shared-state-store.ts`).
 * A closed, serializable union by design — no templates — so conditions stay
 * visually editable, validatable, and dependency-trackable. Mirrors Home
 * Assistant's conditional schema.
 */
export type VisibilityCondition =
  | {
      /** Compares a published value as text */
      kind: 'state';
      /** Key of the published value */
      sourceKey: string;
      /** Holds when the value is this text, or one of these */
      equals?: string | string[];
      /** Holds when the value is not this text, nor any of these */
      notEquals?: string | string[];
    }
  | {
      /** Compares a published value as a number */
      kind: 'numeric';
      /** Key of the published value */
      sourceKey: string;
      /** Holds when the value is greater than this */
      above?: number;
      /**
       * Count a value equal to `above` as holding
       *
       * When true, `above` is an inclusive bound (>=) instead of strict (>).
       */
      aboveInclusive?: boolean;
      /** Holds when the value is less than this */
      below?: number;
      /**
       * Count a value equal to `below` as holding
       *
       * When true, `below` is an inclusive bound (<=) instead of strict (<).
       */
      belowInclusive?: boolean;
    }
  | {
      /**
       * A day-and-time window on the display's clock, with the same fields as ModuleSchedule. It
       * reads no published value, so it never waits on one
       *
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
      /**
       * Days the window opens, 0 = Sunday through 6 = Saturday. Omit for every day
       *
       * 0=Sun … 6=Sat (omit / empty = every day)
       */
      daysOfWeek?: number[];
      /**
       * Start, as `HH:MM`. Omit to start at midnight
       *
       * "07:00" (omit = from midnight)
       */
      startTime?: string;
      /**
       * End, as `HH:MM`. Omit to end at midnight
       *
       * "21:00" (omit = until midnight)
       */
      endTime?: string;
      /**
       * Days after the start day that the window closes, as in ModuleSchedule
       *
       * Days after the start day that the window closes, exactly as `ModuleSchedule.endDayOffset`.
       */
      endDayOffset?: number;
    }
  | {
      /** Holds when every condition inside it holds */
      kind: 'and';
      /** The conditions in the group */
      conditions: VisibilityCondition[];
    }
  | {
      /** Holds when any condition inside it holds */
      kind: 'or';
      /** The conditions in the group */
      conditions: VisibilityCondition[];
    }
  | {
      /** Holds when none of the conditions inside it hold */
      kind: 'not';
      /** The conditions in the group */
      conditions: VisibilityCondition[];
    };

export interface ModuleVisibility {
  /**
   * Conditions that must all hold for the module to show (see VisibilityCondition)
   *
   * Implicit AND across the array (Home Assistant semantics). Met → show, unmet → hide.
   */
  conditions: VisibilityCondition[];
  /**
   * What to do while a value the conditions read has not been published yet: `hide` or `show`
   *
   * Outcome while ANY referenced key is not yet published (default 'hide').
   * This is an all-or-nothing gate evaluated before the condition tree, so
   * the boolean algebra never sees a three-valued input.
   *
   * @default "hide"
   */
  whenUnknown?: 'hide' | 'show';
}

export interface ModuleInstance {
  /** Unique ID */
  id: string;
  /**
   * Set to `false` to hide the module on the display without deleting it; the editor still shows
   * it, dimmed
   *
   * When `false`, the module is excluded from the live display, prefetch,
   * and schedule evaluation. The module is still rendered (dimmed) in the
   * editor so users can re-enable it. Omitted / `true` = enabled.
   * Mirrors `Screen.enabled`.
   *
   * @default true
   */
  enabled?: boolean;
  /** Module type, such as `clock`, or `plugin:<name>` for an add-on */
  type: ModuleType;
  /** Top-left corner in pixels: `{ x, y }` */
  position: ModulePosition;
  /** Width and height in pixels: `{ w, h }` */
  size: ModuleSize;
  /** Stacking order; higher draws on top */
  zIndex: number;
  /**
   * The module's own settings, listed module by module in the [Module
   * Reference](/docs/module-reference)
   */
  config: Record<string, unknown>;
  /** Card styling (see ModuleStyle) */
  style: ModuleStyle;
  /** Only show the module during these days and times (see ModuleSchedule) */
  schedule?: ModuleSchedule;
  /**
   * Only show the module while live values meet these conditions (see ModuleVisibility)
   *
   * Conditional visibility over shared state — AND-combined with schedule + enabled.
   */
  visibility?: ModuleVisibility;
  /**
   * Never draw the module; run it in the background instead, so the values it publishes keep
   * updating while other screens show
   *
   * When true, this instance never renders on screen; it mounts once in the
   * hidden BackgroundProviderLayer so its data loop (and any state it
   * publishes) survives screen rotation. Background-ONLY, not "also run in
   * background": a user who wants the module visible adds a second,
   * un-flagged instance.
   */
  backgroundProvider?: boolean;
}

export interface BackgroundRotation {
  /** Turn rotation on */
  enabled: boolean;
  /** Where the images come from */
  source?: 'unsplash' | 'nasa-apod' | 'immich' | 'icloud';
  /** Unsplash search words; other sources ignore it */
  query: string;
  /** Minutes between images */
  intervalMinutes: number;
  /** Immich album to use */
  immichAlbumId?: string;
  /** Immich person (face) to use */
  immichPersonId?: string;
  /** Only use Immich favorites */
  immichFavoritesOnly?: boolean;
  /**
   * Public iCloud shared album link, or just its token
   *
   * Public share link (icloud.com/sharedalbum/#TOKEN) or bare token.
   */
  icloudAlbumUrl?: string;
}

export interface Screen {
  /** Unique ID */
  id: string;
  /** Name shown in the editor */
  name: string;
  /**
   * Whether the screen is in the rotation
   *
   * @default true
   */
  enabled?: boolean;
  /** Background image path; empty for none */
  backgroundImage: string;
  /** Rotating background images (see BackgroundRotation) */
  backgroundRotation?: BackgroundRotation;
  /** The modules on this screen (see ModuleInstance) */
  modules: ModuleInstance[];
  /**
   * How long this screen shows, in milliseconds. Unset uses the display's rotation interval; `0`
   * keeps the screen up until someone moves on
   *
   * Optional override for auto-rotation duration, in milliseconds.
   * - undefined (default): inherit settings.rotationIntervalMs (after any display override).
   * - 0: sticky — auto-rotation is disabled on this screen (manual advance only).
   * - positive integer: this screen auto-advances after exactly this many ms.
   */
  rotationDurationMs?: number;
  /**
   * Only put this screen in the rotation during these days and times (see ModuleSchedule). When no
   * scheduled screen matches, every enabled screen shows
   *
   * When present, screen only rotates in during matching days/times.
   */
  schedule?: ModuleSchedule;
}

export interface WeatherSettings {
  /** Weather data source */
  provider: 'openweathermap' | 'weatherapi' | 'pirateweather' | 'noaa' | 'open-meteo' | 'yr' | 'smhi' | 'metoffice' | 'envcanada';
  /** Latitude the forecast is fetched for */
  latitude: number;
  /** Longitude the forecast is fetched for */
  longitude: number;
  /** `metric` or `imperial` */
  units: 'metric' | 'imperial';
  /**
   * Rain map radar server: any LibreWXR server. Blank uses the public one
   *
   * Radar server the rain map reads from: any LibreWXR (RainViewer v2
   * compatible) instance. Absent or blank = the public LibreWXR server
   * (`DEFAULT_RADAR_SERVER_URL`); set it to point at a self-hosted copy.
   */
  radarServerUrl?: string;
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
  /** Unique ID */
  id: string;
  /** Always `ical` */
  type: 'ical';
  /** Name shown in the editor and in calendar legends */
  name: string;
  /** Feed address */
  url: string;
  /** Color for this calendar's events */
  color: string;
  /** Whether the feed is shown */
  enabled: boolean;
  /**
   * Let the hub fetch this feed from an address on the home network, for a self-hosted calendar
   * server
   *
   * Let the hub fetch this calendar from a home-network address (self-hosted calendar servers).
   */
  homeNetwork?: boolean;
}

export interface ICloudSource {
  /** Unique ID */
  id: string;
  /**
   * The connected iCloud account, from `data/icloud-accounts.json`. Passwords never live in the
   * config
   *
   * ICloudAccount.id in data/icloud-accounts.json (credentials never live in config)
   */
  accountId: string;
  /**
   * `calendar` for a calendar, `birthdays` for your contacts' birthdays
   *
   * 'calendar' = a CalDAV calendar; 'birthdays' = contact birthdays via CardDAV
   */
  kind: 'calendar' | 'birthdays';
  /**
   * The calendar's address; empty for `birthdays`
   *
   * CalDAV calendar URL; empty for kind 'birthdays'
   */
  url: string;
  /** Calendar name */
  name: string;
  /** Calendar color, kept from iCloud */
  color: string;
  /** Whether the calendar is shown */
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
  /**
   * A single Google calendar ID, from before several could be picked; `googleCalendarIds` replaced
   * it
   */
  googleCalendarId: string;
  /** Google calendars to show */
  googleCalendarIds: string[];
  /** iCal (ICS) feeds (see ICalSource) */
  icalSources: ICalSource[];
  /** iCloud calendars picked from connected accounts (see ICloudSource) */
  icloudSources?: ICloudSource[];
  /**
   * An older list of people and their calendars, kept only until it has been moved onto the family
   * list
   *
   * Legacy input, preserved until the family migration durably folds it.
   */
  people?: CalendarPerson[];
  /**
   * Whose calendars are whose: a family member ID to the calendar source IDs that belong to them. A
   * calendar nobody claims is shared by the household
   *
   * Calendar ownership keyed by the shared family member id.
   */
  personSources?: Record<string, string[]>;
  /** How many days ahead to fetch events */
  daysAhead: number;
  /**
   * Country for public holidays, as a two-letter ISO code (e.g. `US`)
   *
   * ISO 3166-1 alpha-2 country code (e.g. 'US')
   */
  holidayCountry?: string;
  /**
   * Google only: skip events the signed-in account declined
   *
   * Google only: skip events the signed-in account declined
   */
  hideDeclined?: boolean;
}

export interface SleepSettings {
  /** Turn dimming and sleep on */
  enabled: boolean;
  /**
   * Dim, then sleep, after a stretch with no touches. The schedules below run either way
   *
   * Gates the idle-inactivity dim/sleep machinery only; schedules below run
   * regardless. Absent means true — every config saved before this field
   * existed had idle dimming on, so absence must keep behaving that way.
   *
   * @default true
   */
  idleDimEnabled?: boolean;
  /** Minutes without a touch before the display dims */
  dimAfterMinutes: number;
  /** Minutes without a touch before the display sleeps */
  sleepAfterMinutes: number;
  /** Brightness while dimmed, 0 to 100 */
  dimBrightness: number;
  /** A daily window to stay dimmed: `startTime` and `endTime` as `HH:MM` */
  dimSchedule?: {
    startTime: string; // "23:00"
    endTime: string;   // "06:00"
  };
  /** A daily window to sleep: `startTime` and `endTime` as `HH:MM` */
  schedule?: {
    startTime: string; // "23:00"
    endTime: string;   // "06:00"
  };
  /**
   * How long a wake-up during a scheduled dim or sleep window keeps the display on, in minutes; `0`
   * = not at all
   *
   * How long an explicit wake (touch, remote wake button, remote navigation,
   * a remote brightness command) keeps the display awake when it lands
   * inside an active sleep/dim schedule window, before the schedule
   * re-asserts. Absent means DEFAULT_WAKE_HOLD_MINUTES; 0 means no hold (the
   * schedule re-asserts on the next 10s tick). The hold is only ever armed
   * inside a schedule window, so idle dimming timing stays governed by
   * dimAfterMinutes alone.
   *
   * @default 5
   */
  wakeHoldMinutes?: number;
  /**
   * Also switch the screen's power off while asleep (Raspberry Pi kiosks only)
   *
   * Cut power to the panel itself (not just paint black) while the display
   * is asleep. Opt-in, absent means false: it depends on a Raspberry Pi
   * kiosk running the power agent, and some monitors never come back from
   * a signal loss without help. Only `asleep` cuts power; `dimmed` keeps
   * the panel on because the screensaver is meant to be seen.
   *
   * @default false
   */
  panelPowerOff?: boolean;
}

export type ScreensaverMode = 'clock' | 'blank' | 'off';

export interface ScreensaverSettings {
  /** What a dimmed display shows: `clock`, `blank`, or `off` */
  mode: ScreensaverMode;
}

export type TransitionEffect =
  | 'fade' | 'slide' | 'slide-up' | 'zoom'
  | 'flip' | 'blur' | 'crossfade' | 'none';

export type AlertType = 'info' | 'warning' | 'urgent';

export interface AlertSettings {
  /** Show alerts sent to the display */
  enabled: boolean;
  /** Where alerts appear: `top` or `bottom` */
  position: 'top' | 'bottom';
  /** Most alerts shown at once */
  maxVisible: number;
  /**
   * How long an alert stays up, in milliseconds; `0` = each alert type's own default
   *
   * ms — 0 means use per-type defaults
   */
  defaultDuration: number;
  /**
   * Size of the alerts, 0.75 to 2
   *
   * 0.75–2.0, default 1.0
   *
   * @default 1
   */
  scale?: number;
}

export interface BackupReminderSettings {
  /**
   * Remind you when a backup is overdue
   *
   * @default true
   */
  enabled: boolean;
  /**
   * Days between reminders
   *
   * default 7
   *
   * @default 7
   */
  intervalDays: number;
}

export interface UpdateNotificationSettings {
  /** Show a banner when a new release is available */
  enabled: boolean;
}

export interface GlobalSettings {
  /** How long each screen shows before the next one, in milliseconds */
  rotationIntervalMs: number;
  /** Canvas width in pixels */
  displayWidth: number;
  /** Canvas height in pixels */
  displayHeight: number;
  /**
   * Screen rotation: `normal`, `90`, `180`, or `270`. `90` and `270` turn the screen to portrait
   */
  displayTransform?: 'normal' | '90' | '180' | '270';
  /** Household latitude */
  latitude: number;
  /** Household longitude */
  longitude: number;
  /** Name of the location, as shown in settings */
  locationName?: string;
  /** IANA timezone the displays keep time in (e.g. `America/Chicago`) */
  timezone?: string;
  /** Weather source, location, and units (see WeatherSettings) */
  weather: WeatherSettings;
  /** Calendar sources and options (see CalendarSettings) */
  calendar: CalendarSettings;
  /** Dimming and sleep (see SleepSettings) */
  sleep?: SleepSettings;
  /** What a dimmed display shows (see ScreensaverSettings) */
  screensaver?: ScreensaverSettings;
  /**
   * Seconds without mouse movement before the pointer hides
   *
   * @default 3
   */
  cursorHideSeconds?: number;
  /** ID of the profile used whenever no scheduled profile matches */
  activeProfile?: string;
  /** How one screen changes to the next (see TransitionEffect) */
  transitionEffect?: TransitionEffect;
  /**
   * Length of the screen transition in seconds
   *
   * @default 0.6
   */
  transitionDuration?: number;
  /**
   * Which builds the update check offers: `stable`, `rc`, `beta`, or `nightly`. Each channel also
   * sees everything more stable than itself
   *
   * Which builds the update check offers. See `UpdateChannel` in `@/lib/semver`.
   *
   * @default "stable"
   */
  updateChannel?: UpdateChannel;
  /**
   * Show the developer settings: the Test builds choice, build details, and the Plugins > Developer
   * tab
   *
   * @default false
   */
  advancedMode?: boolean;
  /** Alert overlay (see AlertSettings) */
  alerts?: AlertSettings;
  /**
   * Send anonymous usage statistics
   *
   * @default true
   */
  telemetryEnabled?: boolean;
  /**
   * Theme for every full-screen module that does not set its own: `linen`, `paper`, `mist`,
   * `sandstone`, `vellum`, or `bloom` (light), `charcoal`, `midnight`, `slate`, `aurora`,
   * `obsidian`, or `horizon` (dark)
   */
  fullscreenTheme?: string;
  /**
   * Double-tap the active pagination dot to pause screen rotation
   *
   * @default true
   */
  pauseEnabled?: boolean;
  /**
   * Seconds before a paused display starts rotating again on its own; `0` = never
   *
   * @default 300
   */
  pauseTimeoutSeconds?: number;
  /**
   * Flick left or right on a touchscreen to change screens
   *
   * Flick left/right on the touchscreen to change screens. Default true.
   *
   * @default true
   */
  swipeEnabled?: boolean;
  /**
   * Show a faint note with the editor address on a display that has no screens to show. Turn it off
   * to keep a deliberately blank display blank
   *
   * Show the faint "no screens yet, here's the editor address" watermark on a
   * display that resolves zero screens. Default true — a freshly-flashed Pi is
   * otherwise a black rectangle with no clue where the hub lives. Turn it off
   * to keep an intentionally-blank display genuinely blank.
   *
   * @default true
   */
  setupHintEnabled?: boolean;
  /**
   * Draw a thin line under the active pagination dot that fills while the screen is showing
   *
   * Draw a thin line under the active pagination dot that fills over the
   * current screen's dwell, so a long screen and a stuck one look different
   * from across the room. Default true.
   *
   * @default true
   */
  showRotationProgress?: boolean;
  /** Backup reminder (see BackupReminderSettings) */
  backupReminder?: BackupReminderSettings;
  /** New-release banner (see UpdateNotificationSettings) */
  updateNotification?: UpdateNotificationSettings;
  /**
   * Language for every display, as a BCP-47 tag (e.g. `en-US`, `de-DE`). Also sets date and number
   * formatting unless `formattingLocale` overrides it
   *
   * BCP-47 tag (e.g. "en-US", "de-DE"). Defaults to "en-US".
   *
   * @default "en-US"
   */
  locale?: string;
  /**
   * A BCP-47 tag that changes only date and number formatting, leaving the language alone. Unset
   * follows `locale`
   *
   * Optional override for date/number formatting only. Falls back to `locale`.
   */
  formattingLocale?: string;
  /**
   * Household 12/24-hour preference: `12h` or `24h`. Every module that shows a time follows it;
   * clocks do when their `hourFormat` is `inherit`, and the meal planner unless its own time format
   * is set
   *
   * Household 12/24-hour preference. Calendar module time lines and grid
   *  pills resolve against this; the meal planner follows it unless its own
   *  timeFormat override is set. Absent = 12h. Global-only like `locale`.
   *
   * @default "12h"
   */
  timeFormat?: TimeFormat;
}

/** Household 12/24-hour clock preference (`GlobalSettings.timeFormat`). */
export type TimeFormat = '12h' | '24h';

/** Absent-value default for `GlobalSettings.timeFormat`; the prop builder and
 *  the calendar module both resolve against this single constant. */
export const DEFAULT_TIME_FORMAT = '12h' as const;

export interface Profile {
  /** Unique ID */
  id: string;
  /** Name shown in the editor (e.g. `Morning`) */
  name: string;
  /** IDs of the screens this profile shows */
  screenIds: string[];
  /** When the profile turns itself on (see ModuleSchedule) */
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
      /** Show one screen */
      kind: 'showScreen';
      /**
       * The screen to show, from the rule's own display
       *
       * Target screen id, resolved against the owning display's full screen list.
       */
      screenId: string;
      /**
       * `while` keeps the screen up as long as the conditions hold (at least 5 seconds); `for`
       * shows it for `seconds`, then rotation carries on
       *
       * 'while': pinned while the condition holds (min hold 5s to ride out
       * flaps; the shared-state tombstone grace already smooths producer
       * restarts). 'for': shown for `seconds`, then rotation resumes.
       */
      mode: 'while' | 'for';
      /**
       * How long to show the screen; required when `mode` is `for`
       *
       * Required when mode === 'for'.
       */
      seconds?: number;
    }
  | {
      /** Wake the display; nothing happens if it is already awake */
      kind: 'wake';
    }
  | {
      /**
       * Put the display to sleep, like the remote sleep command, and end any screen a rule is
       * holding
       */
      kind: 'sleep';
    };

/**
 * A condition → action rule owned by a display. Rules reuse the visibility
 * condition tree and evaluator unchanged; they are edge-triggered (fire on
 * the false→true transition only, so a reboot never slams the display onto
 * an alert screen for a condition that has been true for days).
 */
export interface DisplayRule {
  /** Unique ID */
  id: string;
  /**
   * Name shown in the editor, e.g. `Doorbell → front camera`
   *
   * "Doorbell → front camera"
   */
  name: string;
  /**
   * Set to `false` to switch the rule off
   *
   * Default true, mirrors ModuleInstance.enabled.
   *
   * @default true
   */
  enabled?: boolean;
  /**
   * Conditions that must all become true for the rule to fire (see VisibilityCondition)
   *
   * Implicit AND, same tree + evaluator as ModuleVisibility.
   */
  when: VisibilityCondition[];
  /** What happens when it fires (see RuleAction) */
  action: RuleAction;
  /**
   * Seconds after firing before the rule can fire again
   *
   * Seconds after a firing during which the rule will not re-fire. Default 0.
   *
   * @default 0
   */
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
  /** Canvas width in pixels */
  displayWidth?: number;
  /** Canvas height in pixels */
  displayHeight?: number;
  /** Screen rotation */
  displayTransform?: 'normal' | '90' | '180' | '270';
  /** How long each screen shows, in milliseconds */
  rotationIntervalMs?: number;
  /** How one screen changes to the next */
  transitionEffect?: TransitionEffect;
  /** Length of the transition in seconds */
  transitionDuration?: number;
  /** Dimming and sleep, replacing the shared object as a whole */
  sleep?: SleepSettings;
  /** What a dimmed display shows, replacing the shared object as a whole */
  screensaver?: ScreensaverSettings;

  // Per-display rendering / interaction overrides
  /** Theme for full-screen modules */
  fullscreenTheme?: string;
  /** Seconds before the pointer hides */
  cursorHideSeconds?: number;
  /** Double-tap the active dot to pause rotation */
  pauseEnabled?: boolean;
  /** Seconds before a pause ends on its own */
  pauseTimeoutSeconds?: number;
  /** Swipe to change screens */
  swipeEnabled?: boolean;
  /** Show the setup note on a display with no screens */
  setupHintEnabled?: boolean;
  /** Show the rotation progress line */
  showRotationProgress?: boolean;
  /** Alert overlay, replacing the shared object as a whole */
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
  /**
   * URL-safe ID, which is also the display's address: `/display/<id>`
   *
   * URL-safe slug used as the route segment: /display/<id>
   */
  id: string;
  /**
   * Name shown in the editor
   *
   * Human-readable label shown in the editor
   */
  name: string;
  /**
   * This display's own screens, laid out at its resolution
   *
   * Screens owned by this display. Each display has its own independent list,
   * laid out at this display's resolution.
   */
  screens: Screen[];
  /**
   * Canvas width in pixels, instead of the shared one
   *
   * Canvas width in pixels (overrides GlobalSettings.displayWidth)
   */
  displayWidth?: number;
  /**
   * Canvas height in pixels, instead of the shared one
   *
   * Canvas height in pixels (overrides GlobalSettings.displayHeight)
   */
  displayHeight?: number;
  /**
   * Screen rotation for this display: `normal`, `90`, `180`, or `270`
   *
   * wlr-randr transform applied at boot on the display-only Pi (informational on the hub side)
   */
  displayTransform?: 'normal' | '90' | '180' | '270';
  /**
   * This display's own profiles. Their `screenIds` point at this display's screens
   *
   * Profiles owned by this display. When present, this display ignores the
   * global `config.profiles` pool. Owned profile `screenIds` reference this
   * display's own `screens`.
   */
  profiles?: Profile[];
  /**
   * Profile used when no scheduled one matches; unset uses the shared `activeProfile`
   *
   * Per-display active profile (falls back to GlobalSettings.activeProfile)
   */
  activeProfile?: string;
  /**
   * Settings this display overrides (see DisplayNodeSettings)
   *
   * Per-display setting overrides (rotation interval, sleep, etc.)
   */
  settings?: DisplayNodeSettings;
  /**
   * This display's own rules (see DisplayRule). There is no shared set in multi-display mode
   *
   * Condition → action rules owned by this display. Owned like `screens` —
   * there is no shared pool or global fallback in multi-display mode.
   */
  rules?: DisplayRule[];
}

export interface ScreenConfiguration {
  /**
   * Config schema version. The app updates it when it upgrades an older file; never edit it by hand
   */
  version: number;
  /** Settings shared by every display (see GlobalSettings) */
  settings: GlobalSettings;
  /**
   * The screens shown in single-display mode. Once `displays` is set, each display owns its own
   * screens instead
   */
  screens: Screen[];
  /** Named groups of screens in single-display mode (see Profile) */
  profiles?: Profile[];
  /** Display rules for legacy single-display mode (multi-display rules live on each DisplayNode). */
  rules?: DisplayRule[];
  /**
   * The multi-display registry (see DisplayNode). Omitted or empty means single-display mode
   *
   * Multi-display registry. Omitted = single-display mode (backward compat).
   */
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

/**
 * Where a clock takes its 12/24-hour choice from. `inherit` follows the
 * household `GlobalSettings.timeFormat`; the other two pin it per clock.
 */
export type ClockHourFormat = 'inherit' | '12h' | '24h';

export interface ClockConfig {
  /**
   * Display style: `classic`, `digital`, `analog`, `minimal`, `flip`, `word`, `binary`, `vertical`,
   * `split`, `progress`, `fuzzy`, `world`, `dot-matrix`, `radial`, `arc`, `neon`, `bar`, or
   * `elapsed`
   */
  view: ClockView;
  /**
   * The older per-clock 24-hour toggle. Only read when `hourFormat` is absent
   *
   * Legacy per-clock toggle. Every clock placed before `hourFormat` existed
   * carries an explicit value here and keeps it: it is only read when
   * `hourFormat` is absent, so nothing on a wall changed when the household
   * setting started reaching new clocks (plan 50, item 6b).
   */
  format24h: boolean;
  /**
   * Where the 12/24-hour choice comes from: `inherit` follows the display's **Time format**
   * setting, `12h` or `24h` pins it for this clock. Clocks from before this option existed have no
   * `hourFormat` and keep using `format24h`
   *
   * Absent = read `format24h`. New clocks are placed with `inherit`.
   */
  hourFormat?: ClockHourFormat;
  /** Display seconds */
  showSeconds: boolean;
  /** Show date below time */
  showDate: boolean;
  /** Date format string (date-fns) */
  dateFormat: string;
  /** Display current week number */
  showWeekNumber: boolean;
  /** Display day of year (e.g. "Day 67 of 365") */
  showDayOfYear: boolean;
  /**
   * IANA timezone to show (e.g. `"Asia/Tokyo"`); empty = follow the display setting
   *
   * IANA zone id (e.g. "Asia/Tokyo"); empty/absent = follow the display setting.
   *
   * @default ""
   */
  timezone?: string;
  /**
   * Where the clock sits across its box: `left`, `center`, or `right`. Unset centers it
   *
   * Where the clock sits in its box; absent = centered both ways. Every view
   * honours it, so a clock whose Text size overflows the box grows from the
   * corner it is pinned to instead of from the middle.
   */
  alignment?: 'left' | 'center' | 'right';
  /** Where the clock sits down its box: `top`, `center`, or `bottom`. Unset centers it */
  verticalAlign?: 'top' | 'center' | 'bottom';
  /**
   * How the clock is sized. `fit` (absent) sizes it off the box height with
   * Text size as a percent of that, and shrinks a one-line view to the box
   * width. `fixed` renders Text size alone (a percent of the 16px base) and
   * never reads the box, which then only places the clock.
   */
  sizeMode?: 'fit' | 'fixed';
  /**
   * Minimal: append AM/PM in 12-hour mode. Absent = off, so a Minimal clock
   * placed before this existed keeps its bare time.
   */
  showAmPm?: boolean;
  // View-specific
  /**
   * Show hour numbers on the analog clock face
   *
   * analog: hour numbers on face
   */
  showNumerals: boolean;
  /**
   * Show flip animation on digit change (flip view)
   *
   * flip: show flip animation on digit change
   */
  animateFlip: boolean;
  /**
   * Accent color used by several views
   *
   * shared accent for several views
   */
  accentColor: string;
  /**
   * Additional timezones for the world view (max 3), each with `label` and `timezone`
   *
   * world: additional timezones (max 3)
   */
  worldZones: WorldClockZone[];
  /**
   * ISO timestamp or time string for elapsed view
   *
   * elapsed: ISO timestamp or time string
   */
  referenceTime: string;
  /**
   * Label for elapsed view (e.g. "market open", "shift start")
   *
   * elapsed: label ("market open", "shift start")
   */
  referenceLabel: string;
  /**
   * Count up (true) or down (false) from reference time (elapsed view)
   *
   * elapsed: count up (true) or down (false)
   */
  countUp: boolean;
  /**
   * How the elapsed view renders units: `units` (50d 20h 13m), `unitsUpper` (50D 20H 13M),
   * `unitsShort` (50day 20hr 13min), `colon` (50:20:13:00), `words` (50 days, 20 hours), or
   * `wordsTitle` (50 Days, 20 Hours). The two word styles are localized.
   *
   * elapsed: how units are rendered
   */
  elapsedFormat: ElapsedFormat;
  /**
   * Which units the elapsed view shows: `auto`, `days`, `daysHours`, `daysHoursMinutes`, or
   * `daysHoursMinutesSeconds`. Named precisions always show their full set including zeros; `auto`
   * hides days and hours while they are zero and shows seconds only under an hour. The `colon`
   * format is the exception: it always keeps a seconds segment, so its rightmost column always
   * means seconds and the counter never appears to reset at the hour or day mark.
   *
   * elapsed: which units are shown
   */
  elapsedPrecision: ElapsedPrecision;
}

// Fullscreen calendar module config (Skylight-inspired ambient display)
export type FullscreenCalendarView =
  | 'schedule' | 'week-list' | 'month-grid' | 'day-timeline' | 'agenda'
  | 'family-grid' | 'up-next' | 'free-time' | 'rolling';
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

/** Which occurrence of a weekday within a month: 1st through 5th, or the last one. */
export type CalendarNthWeek = 1 | 2 | 3 | 4 | 5 | 'last';

export interface CalendarWeekdayOfMonth {
  /** 1-5, or 'last' for the final occurrence in the month. */
  week: CalendarNthWeek;
  /** 0 = Sunday, matching `daysOfWeek`. */
  weekday: number;
}

export interface CalendarDayMatch {
  when?: CalendarDayWhen;
  /** 0 = Sunday. Empty or unset = every day. */
  daysOfWeek?: number[];
  /** 0 = January. Empty or unset = every month. */
  months?: number[];
  /** 1-31. Months without that day simply don't match (no clamping). */
  dayOfMonth?: number;
  /** True = the final day of the month, whatever its length. */
  lastDayOfMonth?: boolean;
  /** e.g. the 2nd Tuesday, or the last Friday. */
  weekdayOfMonth?: CalendarWeekdayOfMonth;
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
  /**
   * Display style: `schedule`, `week-list`, `month-grid`, `day-timeline`, `agenda`, `family-grid`,
   * `up-next`, `free-time`, or `rolling`
   */
  view: FullscreenCalendarView;
  /** Layout density: `cozy` or `snug` */
  density: CalendarDensity;
  /** Text size: `small`, `medium`, `large`, `extra-large`, `2x-large`, `3x-large`, or `4x-large` */
  typographySize: FullscreenTypographySize;
  /**
   * Accent color for event indicators and highlights. Leave empty to follow the theme's own accent;
   * set a color to pin it
   */
  accentColor: string;
  // Dims whole past day columns/cells; default ON. Deliberately different
  // from CalendarConfig.dimPastEvents (compact daily view, default off,
  // today's-column rows only): same name, two view-specific behaviors.
  /** Reduce opacity of past events */
  dimPastEvents: boolean;
  /** Subtle background tint on weekend columns, rows, or (rolling view) cells */
  shadeWeekends: boolean;
  /**
   * Superseded by `weatherPlacement`. Kept so older configurations still render: `false` maps to
   * `off`, `true` to `header`
   *
   * Deprecated: pre-weatherPlacement boolean; true resolves to 'header'.
   */
  showWeather?: boolean;
  /**
   * Where weather appears: `off`, `header` (temperature pill at the top), `days` (daily forecast on
   * day headers), `events` (forecast for each event's start time), or `days-and-events`. Day
   * placement renders in the schedule, week list, and agenda views; event placement in week list
   * and agenda. Views without that surface fall back to the header pill, so weather never
   * disappears when switching views
   *
   * default 'header' (new), legacy showWeather honored when unset
   */
  weatherPlacement?: WeatherPlacement;
  /** Show a line indicating the current time */
  showNowLine: boolean;
  /** Calendar source IDs to display (empty = all) */
  sourceFilter?: string[];
  /**
   * Keyword filter on event titles: `{ mode, terms }` where `mode` is `include` (keep only matching
   * events) or `exclude` (drop them). Terms are case-insensitive substrings; an empty `terms` list
   * means no filter
   */
  titleFilter?: CalendarTitleFilter;
  /** Superseded by `theme` (see above). Kept so older configurations still render */
  darkMode: boolean;
  /**
   * One of the twelve shared full-screen palettes (see [Themes](#full-screen) above). Unset =
   * inherit the display default from Settings > Screen
   */
  theme?: string;
  /**
   * How strongly today is highlighted: `full` (accent-tinted fill), `subtle` (faint background),
   * `minimal` (marker only), or `off`
   *
   * default 'full'; 'subtle' = faint bg, 'minimal' = marker only, 'off' = none
   */
  todayHighlightStyle?: TodayHighlightStyle;
  /**
   * How overlapping events are laid out in schedule and day timeline views: `columns`
   * (side-by-side, with a "+N" indicator when events don't fit) or `stacked` (cascading overlap)
   *
   * default 'columns' (side-by-side); 'stacked' = cascading overlap
   */
  eventOverlap?: EventOverlapMode;
  /**
   * Wrap long event titles onto a second line in schedule and month views instead of truncating
   *
   * default false; wrap long titles to 2 lines (schedule + month views)
   */
  wrapEventTitles?: boolean;
  /**
   * On touch displays, tap an event to open a detail panel with its time, location, and description
   *
   * default false; touch displays: tap an event to open a detail overlay
   */
  eventTapDetails?: boolean;
  /**
   * How the event detail opens: `sheet` (slides up from the bottom) or `card` (centered card)
   *
   * default 'sheet' (bottom sheet); 'card' = centered card
   */
  eventTapStyle?: EventTapStyle;
  /**
   * First day of the week (`sunday` or `monday`) for every view laid out by week: the week list,
   * month grid and family grid, the schedule's `start-of-week` anchor, and the agenda's week separators
   *
   * first day of the week wherever a view is week-anchored (week/month grids, family grid, the schedule 'start-of-week' anchor, agenda week separators). Default sunday
   */
  startDay?: WeekStartDay;

  // List views (agenda + week-list): one shared status slot per event row —
  // a countdown pill before the event starts, replaced by a progress bar
  // while it runs. All-day rows opt into countdowns separately ("in 0 days"
  // noise on all-day events is the known failure mode).
  /**
   * Week list and agenda views: show a "in 2 hours" style countdown next to upcoming events
   *
   * default false
   */
  showCountdown?: boolean;
  /**
   * Week list and agenda views: show a progress bar on events happening right now
   *
   * default false
   */
  showProgressBar?: boolean;
  /**
   * Also show day countdowns on all-day events (off by default so "in 0 days" noise never appears)
   *
   * default false; only meaningful with showCountdown
   */
  countdownAllDay?: boolean;
  // Custom wording for empty days ("Free day!", "Leftovers"); '' = default.
  /**
   * Custom wording for days with no events (for example "Free day!"); empty = the standard message
   */
  emptyDayText?: string;

  // Time grids (schedule + day timeline): fixed configured hours, or a
  // window that slides with the clock. Rolling starts one hour before now
  // and always fits inside the configured fixed range's day.
  /**
   * Schedule and day timeline hours: `fixed` (the start and end hours below) or `rolling` (a window
   * that follows the clock, starting an hour before now, so what is next is always full size; a
   * footer strip names the window and counts today's earlier events it is not showing)
   *
   * default 'fixed'
   */
  hourWindow?: HourWindowMode;
  /**
   * Length of the rolling window in hours (4–16)
   *
   * 4-16, default 8; only with hourWindow 'rolling'
   */
  rollingHours?: number;

  // Schedule view
  /**
   * Days visible in schedule view (1–7, 0 = auto)
   *
   * 1-7, 0 = auto
   */
  scheduleDaysToShow: number;
  /**
   * Schedule view start hour (0–23)
   *
   * 0-23
   */
  scheduleHourStart: number;
  /**
   * Schedule view end hour (1–24)
   *
   * 1-24
   */
  scheduleHourEnd: number;
  /** Show the event description under the title in schedule view */
  scheduleShowDescription?: boolean;
  /**
   * First column of the schedule view: `today` (slides forward each day), `start-of-week` (days
   * keep their place all week), or `next-weekend` (Saturday and Sunday planning board)
   *
   * default 'today'
   */
  scheduleStartAnchor?: ScheduleStartAnchor;

  // Week list view
  /** Collapse past days in week list view */
  weekCollapsePastDays: boolean;
  /** Show the event description under the title in week list view */
  weekShowDescription?: boolean;
  // Household data on the week list: the day's planned meals (from the
  // meal planner) and one aggregate chore row per day (from the chore chart).
  /**
   * Week list view: add the day's planned meals from the meal planner under its events
   *
   * default false
   */
  showMeals?: boolean;
  /**
   * Week list view: add one chore progress row per day (done/total, a bar, and who has a chore)
   * from the chore chart
   *
   * default false
   */
  showChores?: boolean;

  // Family grid view (people as rows, the week as columns)
  /**
   * Family grid view: an Everyone row for events on calendars that belong to nobody in particular
   *
   * default true; shared events on their own row
   */
  familyShowEveryoneRow?: boolean;
  /**
   * Family grid view: show the first two lines of the event description under each title
   *
   * default false; two clamped lines under each chip title
   */
  familyShowDescription?: boolean;

  // Rolling weeks view: weeks rendered, 1-8 (row 1 starts today)
  /**
   * Rolling weeks view: how many weeks to show (1–8), always starting with today in the top-left
   *
   * @default 6
   */
  rollingWeeksToShow?: number;

  // Up next view
  /**
   * Up next view: how many more events from the same day to list under the big one (0–6)
   *
   * 0-6, default 3: rows under the hero
   */
  upNextLaterCount?: number;
  /**
   * Up next view: list today's running and finished events
   *
   * default true: today's finished / running events
   */
  upNextShowEarlier?: boolean;
  /**
   * Up next view: list tomorrow's events
   *
   * default true
   */
  upNextShowTomorrow?: boolean;
  /**
   * Up next view: show the event description on the big card and under each listed event
   *
   * default false; under the hero's time line and each row's title
   */
  upNextShowDescription?: boolean;

  // Free time view
  /**
   * Free time view start hour (0–23)
   *
   * 0-23, default 7
   */
  freeTimeHourStart?: number;
  /**
   * Free time view end hour (1–24)
   *
   * 1-24, default 22
   */
  freeTimeHourEnd?: number;
  /**
   * Free time view: add a compact row per person for tomorrow
   *
   * default true
   */
  freeTimeShowTomorrow?: boolean;

  // Month grid view
  /** Show week numbers in month grid view */
  monthShowWeekNumbers: boolean;
  /**
   * Max events per cell in month grid (0 = auto)
   *
   * 0 = auto
   */
  monthMaxEventsPerCell: number;

  // Day timeline view
  /** Day timeline view start hour */
  dayHourStart: number;
  /** Day timeline view end hour */
  dayHourEnd: number;
  /** Show event locations in day timeline view */
  dayShowLocation: boolean;
  /** Show the event description under the title in day timeline view */
  dayShowDescription?: boolean;

  // Agenda view
  /**
   * Days ahead to show in agenda view (7–30)
   *
   * 7-30
   */
  agendaDaysAhead: number;
  /** Hide days with no events in agenda view */
  agendaHideEmptyDays: boolean;
  // Keep events that already ended today on the list (dimmed via
  // dimPastEvents) until midnight instead of dropping them as they end.
  // Mirrors CalendarConfig.agendaShowFinishedToday in name, but the
  // policies differ deliberately: this view has no row cap, so it keeps
  // only the most recent few finished rows (FINISHED_TODAY_MAX in
  // AgendaView); the compact agenda backfills leftover maxEvents budget.
  /**
   * Agenda view keeps events that already ended today on the list (dimmed) until midnight instead
   * of dropping them as they end
   *
   * default false
   */
  agendaShowFinishedToday?: boolean;
  /** Show the event description under the title in agenda view */
  agendaShowDescription?: boolean;
  /**
   * Boundary markers in agenda view: `none`, `weeks` (a "Week of" rule at each week start), or
   * `weeks-and-months` (plus a month divider; the month marker wins when both land on the same day)
   *
   * default 'none'
   */
  agendaSeparators?: AgendaSeparators;
  // Sources present in the rendered window, as dot + name. Default 'off'.
  /** A color key naming each calendar the module is showing: `off`, `header`, or `footer` */
  showLegend?: CalendarLegendPlacement;
  // Rules engines: per-event looks and per-day looks / badges. Unset = off.
  /**
   * Restyle or hide individual events by what they match. See [Event and day
   * rules](#event-and-day-rules) below
   */
  eventRules?: CalendarEventRule[];
  /**
   * Tint whole days and add badges to them. See [Event and day rules](#event-and-day-rules) below
   */
  dayRules?: CalendarDayRule[];
}

// Calendar module config
export type CalendarViewMode = 'daily' | 'agenda' | 'week' | 'multi-week' | 'month' | 'rolling';

export type CalendarGridTheme = 'banner' | 'clean' | 'minimal' | 'vivid';

export interface CalendarConfig {
  /** View mode: `daily`, `agenda`, `week`, `multi-week`, `month`, or `rolling` */
  viewMode: CalendarViewMode;
  /** Number of days ahead to display */
  daysToShow: number;
  /** Show event times */
  showTime: boolean;
  /** Show event locations */
  showLocation: boolean;
  /** Maximum number of events to display */
  maxEvents: number;
  /** Show week numbers in week/multi-week/month views */
  showWeekNumbers: boolean;
  // Grid views (multi-week / rolling): total weeks rendered. 2-12 on
  // multi-week (row 1 = the current week), 1-8 on rolling (row 1 starts
  // today, so weekday columns shift one left each midnight).
  /**
   * Multi-week and rolling views: how many weeks to show, 2–12 in multi-week (starting with the
   * current week) and 1–8 in rolling (starting today)
   *
   * @default 6
   */
  weeksToShow?: number;
  // Grid views (week / month / multi-week / rolling): event pills per day
  // cell before "+N more", 2-10. Unset = 5 on the week grid (its cells run a
  // full column tall), 4 on the shorter month, multi-week and rolling cells.
  /**
   * Week/multi-week/month/rolling grids: event pills per day cell before "+N more" (2–10). Unset
   * shows 5 in the week grid and 4 in the shorter multi-week, month and rolling cells
   */
  gridMaxEventsPerCell?: number;
  // Grid views (week / month / multi-week): first column day. Default sunday.
  // Rolling ignores it — nothing is week-anchored; its columns follow today.
  /** First day of the week in the week/multi-week/month grids: `sunday` or `monday` (the rolling view ignores it; its columns follow today) */
  startDay?: WeekStartDay;
  // Grid views (week / month / multi-week / rolling): event rendering style.
  // 'classic' (default) = colored dot + faint light pill + default text.
  // 'colored' = timed events render time + title in the calendar's color
  // with no background; all-day events render a solid calendar-color pill.
  /**
   * Event rendering in the week/multi-week/month/rolling grids: `classic` (colored dot on a light
   * pill) or `colored` (see below)
   *
   * @default "classic"
   */
  gridEventStyle?: 'classic' | 'colored';
  // Colored style only: faint light pill background behind timed events.
  /**
   * Colored style: faint background behind timed events
   *
   * @default false
   */
  gridEventPillBackground?: boolean;
  // Month, multi-week and rolling grid theme (the three share one renderer;
  // rolling anchors at today, the others at the month or week start).
  // 'banner' (default when unset) is the original look: tinted day-number
  // strips, padded times, pills driven by gridEventStyle. 'clean' /
  // 'minimal' / 'vivid' share the modern skeleton (month or month-range
  // header, corner day numbers, today ring, stitched multi-day pills) and
  // differ only in pill treatment — they supersede gridEventStyle and
  // gridEventPillBackground for these views.
  /**
   * Multi-week, month and rolling grid look: `banner` (the original tinted day strips), `clean`
   * (month header, quiet day numbers, compact times next to bold titles), `minimal` (titles only,
   * with a colored edge per calendar), or `vivid` (solid color pills). The three newer looks style
   * their own events, so `gridEventStyle` doesn't apply to them
   */
  gridTheme?: CalendarGridTheme;
  // Grid views (week / month / multi-week / rolling): multiplier on the
  // day-name and day-number type only, 0.8-2, default 1. Every size in these views is an
  // `em` off the module font size, so growing the module to read the dates
  // from across the room grows the event pills with it and costs rows per
  // cell. This scales the date furniture alone (headers, day numbers, week
  // numbers, and the badges sharing their row); event pills keep tracking
  // the module font size by themselves.
  /**
   * Week/multi-week/month/rolling grids: size of the date furniture (day names, day numbers, week
   * numbers, and the badges sharing their row), 0.8 to 2. Event pills keep tracking the module's
   * own font size, so this makes the dates readable from across the room without costing rows per
   * cell
   *
   * @default 1
   */
  gridDayLabelScale?: number;
  /**
   * Calendar source IDs this module shows (empty or unset = all sources merged). Use it to give one
   * screen a single family member's calendar
   *
   * undefined or empty = all sources (merged)
   */
  sourceFilter?: string[];
  /**
   * Keyword filter on event titles: `{ mode, terms }` where `mode` is `include` (keep only matching
   * events) or `exclude` (drop them). Terms are case-insensitive substrings; an empty `terms` list
   * means no filter
   */
  titleFilter?: CalendarTitleFilter;
  /**
   * Event indicator bar and today highlights
   *
   * Event indicator bar and today highlights; default '#3b82f6'
   */
  accentColor?: string;
  // Per-view: render the sanitized event description under the title.
  /** Show the event description under the title (daily view) */
  dailyShowDescription?: boolean;
  /** Show the event description under the title (agenda view) */
  agendaShowDescription?: boolean;
  /**
   * On touch displays, tap an event to open a detail panel with its time, location, and description
   *
   * default false; touch displays: tap an event to open a detail overlay
   */
  eventTapDetails?: boolean;
  /**
   * How the event detail opens: `sheet` (slides up from the bottom) or `card` (centered card)
   *
   * default 'sheet' (bottom sheet); 'card' = centered card
   */
  eventTapStyle?: EventTapStyle;
  // List views (daily + agenda): shared status slot, same semantics as the
  // fullscreen calendar's — countdown pill before start, progress bar while
  // running. Timed events only; compact grid pills are untouched.
  /**
   * Daily and agenda views: show a "in 2 hours" style countdown next to upcoming events
   *
   * default false
   */
  showCountdown?: boolean;
  /**
   * Daily and agenda views: show a progress bar on events happening right now
   *
   * default false
   */
  showProgressBar?: boolean;
  // Daily view: custom wording for empty day cells; '' = default.
  /** Daily view: custom wording for days with no events (for example "Free day!") */
  emptyDayText?: string;
  // Agenda view: week/month boundary separators (month beats week).
  /**
   * Agenda view boundary markers: `none`, `weeks`, or `weeks-and-months`
   *
   * default 'none'
   */
  agendaSeparators?: AgendaSeparators;
  // Agenda view: keep events that already ended today on the list (dimmed)
  // until midnight instead of dropping them the moment they end, and group
  // an ongoing multi-day event under Today rather than the day it started.
  // Same name as the fullscreen toggle, different capping policy — see the
  // note on FullscreenCalendarConfig.agendaShowFinishedToday.
  /**
   * Agenda view keeps events that already ended today on the list (dimmed) until midnight, and an
   * event that spans several days (a trip, a race weekend) groups under today while it's still
   * running instead of under the day it started
   *
   * default false
   */
  agendaShowFinishedToday?: boolean;
  // Sources present in the rendered window, as dot + name. Default 'off'.
  /** A color key naming each calendar the module is showing: `off`, `header`, or `footer` */
  showLegend?: CalendarLegendPlacement;
  // Daily view: dim events in today's column that have already ended.
  // Default off — deliberately different from the fullscreen module's
  // same-named toggle (whole past days, default on).
  /**
   * Daily view: fade events in today's column that have already ended. Deliberately different from
   * the Full-Screen Calendar's same-named option, which fades whole past days and defaults on
   *
   * default false
   */
  dimPastEvents?: boolean;
  // Daily view: thin accent rule between today's ended and upcoming events.
  /**
   * Daily view: a thin accent rule between today's finished and upcoming events
   *
   * default false
   */
  showNowRule?: boolean;
  // Rules engines: per-event looks and per-day looks / badges. Unset = off.
  /**
   * Restyle or hide individual events by what they match. See [Event and day
   * rules](#event-and-day-rules) below
   */
  eventRules?: CalendarEventRule[];
  /**
   * Tint whole days and add badges to them. See [Event and day rules](#event-and-day-rules) below
   */
  dayRules?: CalendarDayRule[];
}

// Unified weather module config
export type WeatherView = 'current' | 'hourly' | 'daily' | 'combined' | 'compact' | 'table' | 'precipitation' | 'alerts';

export type WeatherIconSet = 'outline' | 'color';
export type WeatherProviderOption = 'global' | 'openweathermap' | 'weatherapi' | 'pirateweather' | 'noaa' | 'open-meteo' | 'yr' | 'smhi' | 'metoffice' | 'envcanada';

export interface WeatherConfig {
  /** Which view to render (see list above) */
  view: WeatherView;
  /** Icon style: `outline` or `color` */
  iconSet: WeatherIconSet;
  /**
   * Weather provider: `global` (use global setting), `openweathermap`, `weatherapi`,
   * `pirateweather`, `noaa`, `open-meteo`, `yr`, `smhi`, `metoffice`, or `envcanada`
   */
  provider: WeatherProviderOption;
  /** Number of hours to display (hourly view) */
  hoursToShow: number;
  /** Show "feels like" temperature */
  showFeelsLike: boolean;
  /** Number of forecast days (daily view) */
  daysToShow: number;
  /** Show high/low temperatures */
  showHighLow: boolean;
  /** Show precipitation amount */
  showPrecipAmount: boolean;
  /** Show precipitation chance */
  showPrecipitation: boolean;
  /** Show humidity percentage */
  showHumidity: boolean;
  /** Show wind speed */
  showWind: boolean;
  /**
   * Show barometric pressure
   *
   * @default false
   */
  showPressure: boolean;
  /**
   * Show visibility distance
   *
   * @default false
   */
  showVisibility: boolean;
  /**
   * Show dew point temperature
   *
   * @default false
   */
  showDewPoint: boolean;
  /** Hide the alerts view when there are no active alerts */
  hideWhenNoAlerts: boolean;
  /**
   * Show a place-name header above the view
   *
   * Render a place-name header above the view. Off by default so upgrades
   *  don't reflow any deployed weather module.
   */
  showLocation: boolean;
  /**
   * Custom text for the location header. Empty falls back to the geocoded place name, then to the
   * formatted coordinates
   *
   * Overrides the geocoded name when set — the escape hatch for the long
   *  strings Nominatim returns and for hand-entered coordinates.
   */
  locationLabel?: string;
  /**
   * Show the "Forecast" / "Hourly Forecast" heading (hourly, daily, and table views)
   *
   * Show the "Forecast" / "Hourly Forecast" heading (hourly, daily, table views). Omitted = shown.
   */
  showTitle?: boolean;
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
  /**
   * List of events, each with `id`, `name`, `date`, optional `recurring` (`"yearly"`), optional
   * `source` (`"custom"` or `"holiday"`), and optional `backgroundImage`
   */
  events: CountdownEvent[];
  /** Continue showing events after they pass */
  showPastEvents: boolean;
  /**
   * Keep an event that has reached zero on screen until the end of that day, so a birthday or
   * anniversary stays up all day instead of vanishing at midnight
   *
   * When true, an event that has hit zero stays visible until the end of the calendar day in the configured timezone.
   *
   * @default false
   */
  stayUntilEndOfDay?: boolean;
  /**
   * Visual scale factor (0.5–5.2). View-independent: the same value renders the same size in every
   * view
   *
   * 0.5 – 5.2, default 1. View-independent: the same value renders the same pixel size in every CountdownView.
   */
  scale: number;
  /** Display mode: `all` (show all events) or `next` (show only the next upcoming event) */
  view: CountdownView;
  /** ISO country code to auto-populate holiday countdowns (e.g. `"US"`) */
  holidayCountry?: string;
  /**
   * How the numbers render: `flip` (animated flip cards), or one of the Clock elapsed text styles:
   * `units`, `unitsUpper`, `unitsShort`, `colon`, `words`, `wordsTitle`
   *
   * how units render: flip cards (default) or a text style shared with Clock's elapsed view
   */
  format: CountdownFormat;
  /**
   * Which units are shown: `auto`, `days`, `daysHours`, `daysHoursMinutes`, or
   * `daysHoursMinutesSeconds`. `auto` shows days only when there is at least one, and always shows
   * hours, minutes, and seconds.
   *
   * which units are shown; 'auto' = days only when > 0, hours/minutes/seconds always
   */
  precision: CountdownPrecision;
}

// Dad joke config
export interface DadJokeConfig {
  /** How often to fetch a new joke (1 min) */
  refreshIntervalMs: number;
  /** Accent color for background tint and decorative elements */
  accentColor?: string;
  /** Show decorative dividers */
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
  /** Text content (supports markdown when enabled) */
  content: string;
  /** Text alignment: `left`, `center`, or `right` */
  alignment: 'left' | 'center' | 'right';
  /** Text direction: `horizontal`, `vertical`, or `sideways` */
  orientation?: 'horizontal' | 'vertical' | 'sideways';
  /** Vertical alignment: `top`, `center`, or `bottom` */
  verticalAlign?: 'top' | 'center' | 'bottom';
  // Rich text
  /**
   * Enable markdown rendering
   *
   * @default false
   */
  markdown?: boolean;
  // Auto-fit to container
  /**
   * Auto-fit text size to fill the container
   *
   * @default false
   */
  autoFit?: boolean;
  // Text effects
  /**
   * Text effect: `none`, `typewriter`, `fade-in`, `gradient-sweep`, `glow`, `outline`, `shadow`,
   * `3d`, `neon`, `wave`, `bounce`, `shake`, or `color-cycle`
   */
  effect?: TextEffect;
  // Content rotation (split by separator)
  /**
   * Rotate through content split by separator
   *
   * @default false
   */
  rotationEnabled?: boolean;
  /**
   * Rotation interval in milliseconds
   *
   * @default 5000
   */
  rotationIntervalMs?: number;
  /**
   * Separator string for splitting content into rotation items
   *
   * @default "---"
   */
  rotationSeparator?: string;
  // Gradient text
  /**
   * Enable gradient text coloring
   *
   * @default false
   */
  gradientEnabled?: boolean;
  /** Gradient start color */
  gradientFrom?: string;
  /** Gradient end color */
  gradientTo?: string;
  /** Gradient angle in degrees */
  gradientAngle?: number;
  // Typography
  /** Text transform: `none`, `uppercase`, `lowercase`, or `capitalize` */
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  /** Letter spacing in pixels */
  letterSpacing?: number;
  /**
   * Font registry id overriding the module's Style font (see [Module Styling](#module-styling) for
   * the list). Unset = use the Style font
   *
   * Font registry id (or raw CSS stack) overriding the module's global font.
   */
  fontFamily?: string;
  /**
   * Italicize the text
   *
   * @default false
   */
  italic?: boolean;
  /**
   * Line height as a multiple of the font size
   *
   * Unitless line-height multiplier.
   *
   * @default 1.2
   */
  lineHeight?: number;
  /**
   * Word spacing in pixels
   *
   * @default 0
   */
  wordSpacing?: number;
  // Icon prefix (emoji or short text)
  /**
   * Icon prefix (emoji or short text shown before content)
   *
   * @default ""
   */
  icon?: string;
  // Dynamic template variables ({{time}}, {{date}}, {{greeting}}, etc.)
  /**
   * Enable dynamic variables like `{{time}}` and `{{date}}` (see below)
   *
   * @default false
   */
  templateVariables?: boolean;
  // Marquee scrolling
  /**
   * Enable marquee (scrolling) text
   *
   * @default false
   */
  marquee?: boolean;
  /**
   * Seconds for one full scroll pass (5–120). Higher is slower
   *
   * @default 30
   */
  marqueeSpeed?: number;
  /**
   * Marquee direction: `left`, `right`, `up`, or `down`
   *
   * @default "left"
   */
  marqueeDirection?: 'left' | 'right' | 'up' | 'down';
  // Visual effect knobs (only applied when matching `effect` is selected)
  /**
   * Stroke width in pixels (outline effect)
   *
   * @default 2
   */
  outlineWidth?: number;
  /**
   * Stroke color (outline effect)
   *
   * @default "#000000"
   */
  outlineColor?: string;
  /**
   * Horizontal shadow offset in pixels (shadow effect)
   *
   * @default 2
   */
  shadowOffsetX?: number;
  /**
   * Vertical shadow offset in pixels (shadow effect)
   *
   * @default 2
   */
  shadowOffsetY?: number;
  /**
   * Shadow blur radius in pixels (shadow effect)
   *
   * @default 4
   */
  shadowBlur?: number;
  /**
   * Shadow color (shadow effect)
   *
   * @default "rgba(0,0,0,0.5)"
   */
  shadowColor?: string;
  // Text decoration
  /**
   * Line decoration: `none`, `underline`, `overline`, or `line-through`
   *
   * @default "none"
   */
  textDecoration?: TextDecoration;
  /**
   * Color of that line
   *
   * @default "#ffffff"
   */
  textDecorationColor?: string;
  /**
   * Thickness of that line in pixels
   *
   * @default 2
   */
  textDecorationThickness?: number;
  // Animation knobs
  /**
   * Seconds per cycle for the animated effects
   *
   * seconds per cycle
   *
   * @default 2
   */
  animationSpeed?: number;
  /**
   * Colors the `color-cycle` effect cycles through
   *
   * Palette for color-cycle effect.
   *
   * @default 6 preset colors
   */
  colorCyclePalette?: string[];
  /**
   * How each new item appears: `none`, `fade`, `slide-up`, `slide-down`, or `zoom`. Only used while
   * rotation is on
   *
   * Reveal animation when rotation advances (only used when rotationEnabled).
   *
   * @default "none"
   */
  revealOnRotation?: TextRevealOnRotation;
  // Layout polish
  /**
   * Maximum text width in pixels (0 = no limit)
   *
   * Max width in px (0 or undefined = no limit).
   *
   * @default 0
   */
  maxWidth?: number;
  /**
   * Line-wrapping style: `normal`, `nowrap`, `balance` (even line lengths), or `pretty` (avoids
   * lonely last words)
   *
   * @default "normal"
   */
  wrapMode?: TextWrapMode;
  /**
   * Enlarge the first letter as a drop cap
   *
   * @default false
   */
  dropCap?: boolean;
  /** Drop cap color (falls back to `accentColor`, then the text color) */
  dropCapColor?: string;
  /**
   * Color drawn directly behind the glyphs, separate from the module's own background
   *
   * Background color drawn behind the text glyphs (separate from module wrapper).
   */
  textBackground?: string;
  /**
   * Padding around that background in pixels
   *
   * @default 4
   */
  textBackgroundPadding?: number;
  /**
   * Corner rounding of that background in pixels
   *
   * @default 4
   */
  textBackgroundRadius?: number;
  // Decorative
  /**
   * Show decorative divider lines above and below the text
   *
   * @default false
   */
  showDividers?: boolean;
  /**
   * Color for the dividers and the typewriter cursor
   *
   * @default "#ffffff"
   */
  accentColor?: string;
}

// Image module config
export interface ImageConfig {
  /** Image URL or path */
  src: string;
  /** How the image fills the container: `cover`, `contain`, or `fill` */
  objectFit: 'cover' | 'contain' | 'fill';
  /** Alt text */
  alt: string;
}

// Quote module config
export interface QuoteConfig {
  /** Refresh interval (1 hour) */
  refreshIntervalMs: number;
  /** Accent color for decorative quotation mark, left border, and attribution divider */
  accentColor?: string;
}

// Todo module config
export type TodoView = 'list' | 'focus' | 'progress' | 'board' | 'compact';
/** Where checked-off items go: sink below the open ones, stay in place, or leave the wall. */
export type TodoCompletedPlacement = 'bottom' | 'inline' | 'hidden';

/**
 * A To-Do module shows one shared list from `data/todos.json` (see
 * `types/todos.ts` and `lib/todo-data.ts`). Items are never stored on the
 * module: the phone remote, the wall and the editor all edit the store, so a
 * check-off from a phone never touches `config.json` and one list can sit on
 * any number of screens.
 */
export interface TodoConfig {
  /**
   * Which shared list to show. Unset renders a "pick a list" placeholder. Ignored by the board view
   *
   * The shared list to show. Unset renders the "pick a list" empty state. Ignored by the board view.
   */
  listId?: string;
  /**
   * `list`, `focus` (next three in big type), `progress` (ring), `board` (every list as a column)
   * or `compact`
   */
  view: TodoView;
  /**
   * Heading override. Empty shows the list's own name
   *
   * Overrides the list's own name as the heading. Empty = the list name.
   */
  title?: string;
  /**
   * Show the heading. The done count stays either way
   *
   * Show the heading (the done count stays). Omitted = shown.
   */
  showTitle?: boolean;
  /** Accent for checkboxes, strikethrough and the progress ring */
  accentColor?: string;
  /**
   * Render items as tap targets so anyone at the kiosk can tick them. A tap writes to the shared
   * list, never to the layout
   *
   * Render each item as a tap target so a kiosk user can check it off on the
   * wall. A tap writes to the shared store, not to `config.json`. Defaults
   * to true for new modules; instances created before lists were shared keep
   * whatever they had.
   */
  interactive?: boolean;
  /** Where done items go: `bottom` (sink under the open ones), `inline` (stay put) or `hidden` */
  completedPlacement?: TodoCompletedPlacement;
  /**
   * Due-day chips (Today, Tomorrow, Overdue, a weekday, a date) on items that carry a date
   *
   * Due-day chips ("Today", "Overdue") next to items that carry a date.
   */
  showDueDates?: boolean;
  /**
   * Initials, in their colours, of the people an item is for (two, then "+N"); people come from
   * Settings > Family
   *
   * Initials of the people an item is for, in their colours.
   */
  showAssignees?: boolean;
}

// Sticky note module config
export interface StickyNoteConfig {
  /** Note text content */
  content: string;
  /** Background color of the note */
  noteColor: string;
}

// Greeting module config
export interface GreetingConfig {
  /** Name to greet (e.g. "Good morning, Bryan") */
  name: string;
  /** Accent color for the greeting text */
  accentColor?: string;
  /**
   * Show a contextual weather subtitle beneath the greeting. Set to `false` to keep the behavior it
   * had before the event bus. Requires latitude/longitude configured in Settings > Weather, the
   * editor surfaces a hint in the Greeting config section if location is missing.
   *
   * @default true
   */
  weatherAware?: boolean;
}

// News module config
export type NewsView = 'headline' | 'list' | 'ticker' | 'compact' | 'cards';
export type NewsTapAction = 'none' | 'qr' | 'details';
export type NewsTickerSeparator = 'dot' | 'pipe' | 'slash';

/**
 * One feed a news module follows. `url` is either a real feed URL (RSS, RDF,
 * Atom, or JSON Feed) or a virtual source the server resolves:
 *   - `local`               news near the household location (Settings > Location)
 *   - `topic:<keywords>`    a keyword search feed
 *   - `youtube:<channelId>` a YouTube channel's uploads
 *   - `reddit:<subreddit>`  a subreddit's newest posts
 */
export interface NewsFeedSource {
  id: string;
  url: string;
  /** Shown as the story source; falls back to the feed's own title. */
  label?: string;
  /** Source dot / pill colour; unset = neutral. */
  color?: string;
  /** Let the hub fetch this feed from a home-network address (self-hosted readers). */
  homeNetwork?: boolean;
  /** Cap on stories from this feed before merging; unset = no per-feed cap. */
  maxItems?: number;
}

/** Fields shared by the news tile and the full-screen news module. */
export interface NewsSourceOptions {
  /**
   * Feeds to follow, in order (up to 12). `label` overrides the name shown as the story source;
   * `color` tints the source dot; `homeNetwork` lets the hub read a feed from a device on your own
   * network (a self-hosted reader); `maxItems` caps stories from that feed before merging
   */
  feeds: NewsFeedSource[];
  /** How often to fetch new stories (5 min) */
  refreshIntervalMs: number;
  /** Stories to show after merging every feed (3 to 24) */
  maxItems: number;
  /**
   * Hide stories older than this many hours; `0` = any age
   *
   * Hide stories older than this many hours; 0 or unset = no limit.
   */
  maxAgeHours?: number;
  /**
   * Comma or newline separated words; a story mentioning any of them in its headline or summary is
   * hidden
   *
   * Comma or newline separated words; a story mentioning any of them is hidden.
   */
  blockedWords?: string;
  /**
   * Comma or newline separated words; only stories mentioning one of them show
   *
   * Comma or newline separated words; only stories mentioning one of them show.
   */
  requiredWords?: string;
  /**
   * Keep each feed's own order instead of sorting newest first
   *
   * Keep each feed's own order instead of sorting newest first.
   */
  preserveOrder?: boolean;
  /**
   * What a tap does on a touch display: `qr` (a code that opens the story on your phone), `details`
   * (the summary, with a small code), or `none`
   *
   * What a tap on a story does on a touch display. Default 'qr'.
   */
  tapAction?: NewsTapAction;
}

export interface NewsConfig extends NewsSourceOptions {
  /**
   * Display mode: `headline` (one story at a time), `list`, `ticker`, `compact`, or `cards` (photo
   * grid)
   */
  view: NewsView;
  /**
   * How often the headline view moves to the next story, and how often list and cards views turn
   * the page when stories do not all fit (10 sec)
   */
  rotateIntervalMs: number;
  /** Show how long ago each story was published */
  showTimestamp: boolean;
  /** Show the story summary (headline, list, and cards views) */
  showDescription: boolean;
  /** Seconds per story in the ticker view */
  tickerSpeed?: number;
  /**
   * List bullet, "Just in" pill, and new-story dot colour (optional)
   *
   * List bullet color; default undefined (text-based bullet)
   */
  accentColor?: string;
  /**
   * Header text; unset shows "News" in the display language
   *
   * Header text; unset = the translated "News".
   */
  title?: string;
  /**
   * Show the built-in header (headline and list views)
   *
   * Show the built-in "News" header (headline + list views). Omitted = shown.
   */
  showTitle?: boolean;
  /**
   * Show the feed name next to each story
   *
   * Show the feed name next to each story. Default true.
   */
  showSource?: boolean;
  /**
   * Show story pictures where the view has room (headline, list, cards)
   *
   * Show story thumbnails where the view has room (list, cards, headline). Default true.
   */
  showImages?: boolean;
  /**
   * Lines of summary before it is cut off (1 to 4)
   *
   * Description clamp, 1 to 4 lines. Default 2.
   */
  descriptionLines?: number;
  /**
   * Cut headlines to one line
   *
   * Clamp headlines to one line. Default false.
   */
  singleLineTitles?: boolean;
  /**
   * "3 of 12" in the header of the headline view, and the page count on list and cards
   *
   * Headline view: "3 of 12" counter. Default true.
   */
  showCounter?: boolean;
  /**
   * Mark stories under an hour old with a "Just in" pill
   *
   * Mark stories under an hour old. Default false.
   */
  highlightBreaking?: boolean;
  /**
   * Dot stories that arrived since the display's last refresh
   *
   * Mark stories that arrived since the last refresh. Default false.
   */
  showNewMarker?: boolean;
  /**
   * Columns in the cards view (1 to 3); rows are however many fit
   *
   * Cards view columns, 1 to 3. Default 2.
   */
  cardColumns?: number;
  /**
   * Glyph between ticker stories: `dot`, `pipe`, or `slash`
   *
   * Ticker view separator glyph. Default 'dot'.
   */
  tickerSeparator?: NewsTickerSeparator;
}

export type FullscreenNewsView = 'story' | 'front-page';

export interface FullscreenNewsConfig extends NewsSourceOptions {
  /**
   * `story` (one story at a time, its picture filling the top of the screen) or `front-page` (a
   * lead story plus the next five)
   */
  view: FullscreenNewsView;
  /** Seconds per story, or per front page */
  rotateIntervalMs: number;
  /** Show the story summary */
  showDescription: boolean;
  /** Show the feed name */
  showSource: boolean;
  /** Show how long ago each story was published */
  showTimestamp: boolean;
  /** Show story pictures */
  showImages: boolean;
  /**
   * Clock and date in the corner
   *
   * Clock + date in the corner, like the full-screen photo viewer.
   */
  showTime: boolean;
  /** `small`, `medium`, `large`, `extra-large`, `2x-large`, `3x-large`, or `4x-large` */
  typographySize: FullscreenTypographySize;
  /**
   * Progress bar and pill colour; empty follows the theme
   *
   * Unset = follow the theme accent.
   */
  accentColor: string;
  /**
   * One of the shared full-screen palettes (see [Themes](#full-screen) above); unset inherits the
   * display default
   */
  theme?: string;
}

// Stock ticker module config
// 'single' dedicates the tile to the first symbol: quote header + full-space chart.
export type StockTickerView = 'cards' | 'ticker' | 'table' | 'compact' | 'single';

export interface StockTickerConfig {
  /** Comma-separated stock symbols */
  symbols: string;
  /** Refresh interval (30 sec) */
  refreshIntervalMs: number;
  /**
   * Display mode: `cards`, `ticker`, `table`, `compact`, or `single`. `single` dedicates the tile
   * to the first symbol: ticker and company name, large price with change, and one chart filling
   * the tile (min/max axis labels; in the `shaded` theme, hour marks on the day chart and day marks
   * on the week chart, in the symbol's own exchange hours). Only that first symbol is fetched
   */
  view: StockTickerView;
  /**
   * Size multiplier for the cards, table, and compact views (0.5–3). The quickest way to make
   * prices readable across a room. Not used by the ticker or single views
   *
   * @default 1
   */
  cardScale?: number;
  /** Scroll speed for ticker view */
  tickerSpeed?: number;
  /**
   * Draw a small trend line on each card in the cards view
   *
   * Trend line on cards view; default true
   */
  showSparkline?: boolean;
  // Which chart(s) the cards view draws; default 'day'
  /**
   * Which chart each card shows: `day`, `week`, or `both` (the week chart sits left of the day
   * chart, so the pair reads chronologically)
   */
  sparklineMode?: 'day' | 'week' | 'both';
  // 'classic' keeps the exact current rendering (plain line, even spacing,
  // day-change color); 'shaded' adds backdrop + tint, time-scaled day chart,
  // and per-chart colors. Default 'classic'.
  /**
   * Chart look: `classic` (plain line, evenly spaced) or `shaded` (soft backdrop and tint, day
   * chart scaled to trading hours)
   */
  sparklineTheme?: 'classic' | 'shaded';
  // Caption each chart with its range (1D / 5D) and, in the shaded theme,
  // tick the week chart into its sessions. Default false.
  /**
   * Caption each chart with its range (`1D` for today, `5D` for the past week) so the two are easy
   * to tell apart. In the `shaded` theme the week chart is also ticked into its trading sessions
   */
  sparklineLabels?: boolean;
}

// Crypto module config
export type CryptoView = 'cards' | 'ticker' | 'table' | 'compact';

export interface CryptoConfig {
  /** Comma-separated CoinGecko IDs */
  ids: string;
  /** Refresh interval (30 sec) */
  refreshIntervalMs: number;
  /** Display mode: `cards`, `ticker`, `table`, or `compact` */
  view: CryptoView;
  /**
   * Size multiplier for the cards, table, and compact views (0.5–3). Not used by the ticker view
   *
   * @default 1
   */
  cardScale?: number;
  /** Scroll speed for ticker view */
  tickerSpeed?: number;
  /**
   * Draw a small trend line on each card in the cards view
   *
   * Trend line on cards view; default true
   */
  showSparkline?: boolean;
}

// Word of the day module config
export interface WordOfDayConfig {
  /** Accent color for underline and part-of-speech tag */
  accentColor?: string;
  /** Show decorative dividers between sections */
  showDividers?: boolean;
}

// This day in history module config
export interface HistoryConfig {
  /** Data refresh interval (1 hour) */
  refreshIntervalMs: number;
  /** How often to rotate between events (10 sec) */
  rotationIntervalMs: number;
  /** Accent color for years-ago badge and dividers */
  accentColor?: string;
  /** Show decorative dividers */
  showDividers?: boolean;
  /**
   * Enable MuffinLabs data source
   *
   * @default true
   */
  sourceMuffinLabs?: boolean;
  /**
   * Enable Wikipedia "On This Day" data source
   *
   * @default true
   */
  sourceWikipedia?: boolean;
  /**
   * Show the "On This Day" header. Turning it off hides the divider under it too
   *
   * Show the built-in "On This Day" header. Omitted = shown.
   */
  showTitle?: boolean;
}

// Moon phase module config
export interface MoonPhaseConfig {
  /** Show illumination percentage */
  showIllumination: boolean;
  /** Show moonrise/moonset times */
  showMoonTimes: boolean;
}

// Sunrise / Sunset module config
export type SunriseSunsetView = 'default' | 'arc' | 'circle';

/** Circle-view ring coloring. 'simple' (default when unset) paints the flat
    day/twilight/dark segments; 'sky' paints a gradient through event-anchored
    stops with stars in the astrodark window. */
export type SunriseSunsetTheme = 'simple' | 'sky';

export interface SunriseSunsetConfig {
  /** Display style: `default`, `arc`, or `circle` */
  view: SunriseSunsetView;
  /** Show total daylight hours */
  showDayLength: boolean;
  /** Show golden hour times */
  showGoldenHour: boolean;
  /**
   * Show when full darkness starts and ends, and how long it lasts (always on with the `sky` theme)
   */
  showAstroDark?: boolean;
  /**
   * Circle-view ring coloring: `simple` (flat daylight/twilight/darkness segments) or `sky` (a
   * gradient through the day's sun colors, with stars in the full-darkness window). The `sky` theme
   * always shows the astro-dark times.
   */
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
  /** Directory name inside `public/backgrounds/` */
  directory: string;
  /** Time between transitions (30 sec) */
  intervalMs: number;
  /** Transition effect: `fade` or `none` */
  transition: 'fade' | 'none';
  /** Image fit mode */
  objectFit: 'cover' | 'contain' | 'fill';
  /** How often to re-scan the directory for new images (10 min) */
  refreshIntervalMs: number;
  /**
   * Photo source: `local`, `immich` (requires keys in Settings > API keys), `onedrive` (a one-time
   * Microsoft sign-in), or `icloud` (a public shared album, no keys needed)
   */
  source?: 'local' | 'immich' | 'icloud' | 'onedrive';
  /** Filter to a specific Immich album */
  immichAlbumId?: string;
  /** Filter to a recognized person (face) in Immich */
  immichPersonId?: string;
  /**
   * Only show photos marked as favorites in Immich
   *
   * @default false
   */
  immichFavoritesOnly?: boolean;
  /**
   * Number of photos to load per refresh (10–200)
   *
   * @default 50
   */
  immichCount?: number;
  /**
   * iCloud shared album link (`icloud.com/sharedalbum/#TOKEN`) or bare token (iCloud source)
   *
   * Public share link (icloud.com/sharedalbum/#TOKEN) or bare token.
   */
  icloudAlbumUrl?: string;
  /**
   * OneDrive folder to pull photos from (OneDrive source)
   *
   * Graph driveItem ID of the OneDrive folder this module pulls from (source 'onedrive').
   */
  onedriveFolderId?: string;
  /**
   * Folder name as shown in the editor, display only, the ID above is authoritative
   *
   * Folder label captured at pick time — display only, the ID is authoritative.
   */
  onedriveFolderName?: string;
  /**
   * Number of photos to load per refresh (10–200)
   *
   * Photos per refresh for source 'onedrive'. Default 50.
   *
   * @default 50
   */
  onedriveCount?: number;
  /**
   * What to show: `photos`, `videos`, or `both`
   *
   * Default 'photos' — existing photo-only behavior.
   */
  mediaTypes?: SlideshowMediaTypes;
  /**
   * Longest a video slide can play before moving on (60 sec)
   *
   * Force-advance cap for video slides. Default 60000.
   */
  maxVideoDurationMs?: number;
}

// QR code module config
type QRCodeMode = 'custom' | 'wifi';
export type WifiAuthType = 'WPA' | 'WEP' | 'nopass';

export interface QRCodeConfig {
  /** QR code mode: `custom` (arbitrary data) or `wifi` (WiFi network) */
  mode: QRCodeMode;
  // Custom mode
  /** Content to encode (custom mode) */
  data: string;
  /** Label text below the code (custom mode) */
  label: string;
  // WiFi mode
  /** WiFi network name (wifi mode) */
  ssid: string;
  /** WiFi password (wifi mode) */
  password: string;
  /** WiFi authentication type: `WPA`, `WEP`, or `nopass` (wifi mode) */
  authType: WifiAuthType;
  /** Whether the WiFi network is hidden (wifi mode) */
  hiddenNetwork: boolean;
  /** Show the password below the QR code (wifi mode) */
  showPassword: boolean;
  /** Show the network name below the QR code (wifi mode) */
  showNetworkName: boolean;
  // Shared
  /** Foreground color */
  fgColor: string;
  /** Background color */
  bgColor: string;
}

// Year progress module config
export interface YearProgressConfig {
  /** Show year progress */
  showYear: boolean;
  /** Show month progress */
  showMonth: boolean;
  /** Show week progress */
  showWeek: boolean;
  /** Show day progress */
  showDay: boolean;
  /** Show percentage labels */
  showPercentage: boolean;
  /** Accent color for progress bars and glow effects */
  accentColor?: string;
}

// Traffic / Commute module config
export interface TrafficRoute {
  label: string;
  origin: string;
  destination: string;
}

export interface TrafficConfig {
  /** Routes, each with `label`, `origin`, and `destination` */
  routes: TrafficRoute[];
  /** Refresh interval (5 min) */
  refreshIntervalMs: number;
  /**
   * Show the built-in "Traffic" header
   *
   * Show the built-in "Traffic" header. Omitted = shown.
   */
  showTitle?: boolean;
}

// Sports scores module config
export type SportsView = 'scoreboard' | 'cards' | 'list' | 'ticker';

export interface SportsConfig {
  /** Display mode: `scoreboard`, `cards`, `list`, or `ticker` */
  view: SportsView;
  /**
   * Leagues to show: `nfl`, `nba`, `mlb`, `nhl`, `wnba`, `mls`, `epl`, `laliga`, `bundesliga`,
   * `seriea`, `ligue1`, `liga_mx`
   */
  leagues: string[];
  /** Refresh interval (1 min) */
  refreshIntervalMs: number;
  /**
   * Scroll speed for ticker view
   *
   * @default 5
   */
  tickerSpeed?: number;
}

// Todoist module config
type TodoistViewMode = 'list' | 'board' | 'focus';
export type TodoistGroupBy = 'none' | 'project' | 'priority' | 'date' | 'label';
type TodoistSortBy = 'default' | 'priority' | 'due_date' | 'alphabetical';

export interface TodoistConfig {
  /** View mode: `list`, `board`, or `focus` */
  viewMode: TodoistViewMode;
  /** How to group tasks: `none`, `project`, `priority`, `date`, or `label` */
  groupBy: TodoistGroupBy;
  /** Sort order: `default`, `priority`, `due_date`, or `alphabetical` */
  sortBy: TodoistSortBy;
  /** Comma-separated project names to show (empty = all) */
  projectFilter: string;
  /** Comma-separated label names to filter by (empty = all) */
  labelFilter: string;
  /** Show tasks without a due date */
  showNoDueDate: boolean;
  /** Show subtasks indented under parents */
  showSubtasks: boolean;
  /** Show task labels */
  showLabels: boolean;
  /** Show project name and color dot */
  showProject: boolean;
  /** Show task description text */
  showDescription: boolean;
  /** Maximum number of tasks to display */
  maxTasks: number;
  /** How often to fetch tasks (1 min) */
  refreshIntervalMs: number;
  /** Module header title */
  title: string;
  /**
   * Show the title text. The task count stays either way
   *
   * Show the title text (the task count stays). Omitted = shown.
   */
  showTitle?: boolean;
  // When true, tapping a task on a touchscreen closes it via Todoist's API.
  /**
   * Show a tappable circle on each task. Tapping marks the task complete in Todoist (optimistic,
   * with cache invalidation so the task disappears immediately). When off, the priority bar is
   * shown instead.
   *
   * @default false
   */
  allowComplete?: boolean;
}

// Air quality module config
export interface AirQualityConfig {
  /** Show air quality index */
  showAQI: boolean;
  /** Show individual pollutant levels (PM2.5, PM10, O3, NO2) */
  showPollutants: boolean;
  /** Refresh interval (5 min) */
  refreshIntervalMs: number;
}

// Multi-month calendar config
type MultiMonthView = 'vertical' | 'horizontal';

/**
 * How today's date is marked in a month grid. Every style paints the same
 * `accentColor` — they differ only in where it lands (fill, ring, rule, ink),
 * so the color means the same thing whichever style is picked.
 */
export type MultiMonthTodayStyle = 'filled' | 'square' | 'outline' | 'underline' | 'text' | 'none';

export interface MultiMonthConfig {
  /** Layout direction: `vertical` or `horizontal` */
  view: MultiMonthView;
  /** Number of months to display */
  monthCount: number;
  /** First day of week: `sunday` or `monday` */
  startDay: WeekStartDay;
  /** Show ISO week numbers */
  showWeekNumbers: boolean;
  /** Dim weekend days */
  highlightWeekends: boolean;
  /** Show days from adjacent months in empty cells */
  showAdjacentDays: boolean;
  /**
   * Show the name of the current month above its grid (later months always keep theirs)
   *
   * Show the month name + year heading over the CURRENT month's grid. The
   * later months always keep their heading — without it there is nothing left
   * to tell them apart. Omitted = shown.
   */
  showCurrentMonthLabel?: boolean;
  /**
   * How today is marked: `filled`, `square`, `outline`, `underline`, `text`, or `none`
   *
   * How today's date is marked. Omitted = 'filled'.
   */
  todayStyle?: MultiMonthTodayStyle;
  /**
   * Color of today's marker
   *
   * Color of today's marker. Omitted = '#3b82f6'.
   */
  accentColor?: string;
  /**
   * Size the calendar to the module instead of to the text size setting.
   *
   * Off, the grid is built from `style.fontSize` and only ever shrinks to fit,
   * so a calendar in a card taller than about 600px stops at the text size and
   * leaves the rest of the card empty. On, it grows to fill the card the way
   * every other measured module does, and the text size becomes a bias on that.
   *
   * Omitted = off, which is how every calendar built before this option
   * behaved. New ones get it from the registry default.
   */
  fitToBox?: boolean;
}

// Garbage day module config
export type GarbageFrequency = 'weekly' | 'biweekly';

export interface GarbageDayConfig {
  /**
   * Trash collection day (0=Sun through 6=Sat, -1=disabled)
   *
   * 0=Sun, 1=Mon, ..., 6=Sat, -1=disabled
   */
  trashDay: number;
  /** Collection frequency: `weekly` or `biweekly` */
  trashFrequency: GarbageFrequency;
  /**
   * Anchor date for biweekly calculation (ISO date)
   *
   * ISO date anchor for biweekly calculation
   */
  trashStartDate: string;
  /** Trash icon color */
  trashColor: string;
  /** Recycling collection day (same format as `trashDay`) */
  recyclingDay: number;
  /** Recycling frequency: `weekly` or `biweekly` */
  recyclingFrequency: GarbageFrequency;
  /** Anchor date for biweekly recycling */
  recyclingStartDate: string;
  /** Recycling icon color */
  recyclingColor: string;
  /** Custom collection day (-1 = disabled) */
  customDay: number;
  /** Custom frequency: `weekly` or `biweekly` */
  customFrequency: GarbageFrequency;
  /** Anchor date for biweekly custom collection */
  customStartDate: string;
  /** Custom icon color */
  customColor: string;
  /** Label for the custom collection type */
  customLabel: string;
  /** When to highlight: `day-of` or `day-before` */
  highlightMode: 'day-of' | 'day-before';
  /**
   * Show the built-in "Collection Schedule" header
   *
   * Show the built-in "Collection Schedule" header. Omitted = shown.
   */
  showTitle?: boolean;
}

// Rain map module config
type RainMapStyle = 'dark' | 'standard';

export interface RainMapConfig {
  /** Map center latitude (falls back to global setting) */
  latitude: number;
  /** Map center longitude (falls back to global setting) */
  longitude: number;
  /** Map zoom level (1–12) */
  zoom: number;
  /** Delay between animation frames */
  animationSpeedMs: number;
  /** Extra pause on the last frame before looping */
  extraDelayLastFrameMs: number;
  /** Radar color scheme (0–8, the RainViewer numbering LibreWXR keeps; 2 is Universal Blue) */
  colorScheme: number;
  /** Smooth radar rendering */
  smooth: boolean;
  /** Show snow on radar */
  showSnow: boolean;
  /** Radar overlay opacity (0–1) */
  opacity: number;
  /** Show relative timestamp label */
  showTimestamp: boolean;
  /** Show timeline dots at the bottom */
  showTimeline: boolean;
  /** How often to fetch new radar data (10 min) */
  refreshIntervalMs: number;
  /** Base map style: `dark` or `standard` */
  mapStyle: RainMapStyle;
}

// Standings module config
export type StandingsView = 'table' | 'compact' | 'conference';
export type StandingsGrouping = 'division' | 'conference' | 'league';

export interface StandingsConfig {
  /** Display mode: `table`, `compact`, or `conference` */
  view: StandingsView;
  /** League to display (see list below) */
  league: string;
  /** How to group teams: `division`, `conference`, or `league` */
  grouping: StandingsGrouping;
  /** Limit number of teams per group (0 = show all) */
  teamsToShow: number;
  /** Draw a visual line below the last playoff spot */
  showPlayoffLine: boolean;
  /** How often to rotate between groups (10 sec) */
  rotationIntervalMs: number;
  /** Data refresh interval (5 min) */
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
  /** Display style: `elegant`, `card`, `minimal`, or `typewriter` */
  view: AffirmationsView;
  /**
   * Categories to include: `affirmations`, `compliments`, `motivational`, `gratitude`,
   * `mindfulness`
   */
  categories: AffirmationsCategory[];
  /** How often to rotate to the next affirmation (15 sec) */
  rotationIntervalMs: number;
  /** Show the category label below the affirmation */
  showCategoryLabel: boolean;
  /** Select affirmations based on time of day, day of week, and season */
  timeAware: boolean;
  /**
   * Give entries tagged with a matching weather condition a +2 score boost. Non-matching entries
   * are never hidden. Only takes effect while **Time-aware** is on, since the weather boost is part
   * of the same scoring pass. Requires latitude/longitude configured in Settings > Weather, the
   * editor surfaces a hint in the Affirmations config section if location is missing.
   *
   * @default true
   */
  weatherAware?: boolean;
  /** Custom affirmations, each with `id`, `text`, and optional `attribution` */
  customEntries: CustomAffirmation[];
  /** Accent color for card/typewriter views */
  accentColor: string;
}

// Meal planner module config
export type MealPlannerView = 'week' | 'today' | 'next-meal' | 'compact' | 'list';
export type MealSlotType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type GroceryCategory = 'produce' | 'dairy' | 'meat' | 'seafood' | 'bakery' | 'pantry' | 'frozen' | 'beverages' | 'other';

export interface MealIngredient {
  /** Ingredient */
  name: string;
  /** Amount, as text (e.g. `2 cups`) */
  amount?: string;
  /** Grocery aisle */
  category?: GroceryCategory;
}

export interface SavedMeal {
  /** Unique ID */
  id: string;
  /** Meal name */
  name: string;
  /** Emoji shown with the meal */
  emoji?: string;
  /** Kind of dish */
  category?: 'main' | 'side' | 'dessert' | 'drink' | 'snack';
  /** Free-form tags */
  tags?: string[];
  /**
   * Prep time in minutes
   *
   * minutes
   */
  prepTime?: number;
  /**
   * Cook time in minutes
   *
   * minutes
   */
  cookTime?: number;
  /** How hard it is to make */
  difficulty?: 'easy' | 'medium' | 'hard';
  /** How many people it serves */
  servings?: number;
  /** Ingredients, for the grocery list (see MealIngredient) */
  ingredients?: MealIngredient[];
  /** Link to the recipe, which a display can open */
  recipeUrl?: string;
  /** Notes */
  notes?: string;
  /**
   * Rating, 1 to 5
   *
   * 1-5
   */
  rating?: number;
  /** Marked as a favorite */
  isFavorite?: boolean;
}

export interface PlannedMeal {
  /**
   * Day, as `YYYY-MM-DD`
   *
   * ISO date "2026-04-04"
   */
  date: string;
  /** Which meal of the day */
  slot: MealSlotType;
  /**
   * The saved meal, by ID
   *
   * references SavedMeal.id
   */
  mealId?: string;
  /**
   * Text instead of a saved meal (e.g. `Eating out`)
   *
   * "Eating out", "Leftovers"
   */
  customText?: string;
  /** Notes */
  notes?: string;
  /**
   * Serving time, as 24-hour `HH:MM`, instead of the slot's default for this one day
   *
   * Optional serving time in 24-hour "HH:MM" format (e.g. "18:30"). Per-instance: Tuesday's dinner can be at 6:30 while Friday's is at 7:00.
   */
  time?: string;
}

/**
 * Shared meal-planner settings stored in `data/meals.json` (NOT per-module config).
 * These describe the household's planning model — what slots exist, when the week starts,
 * default times — and are edited from `/remote` so all meal modules stay consistent.
 */
export interface MealSettings {
  /**
   * Which meals of the day are planned
   *
   * Which meal slots are enabled across all meal-planner modules
   */
  enabledSlots: MealSlotType[];
  /**
   * First day of the planning week
   *
   * First day of the planning week
   */
  weekStartDay: WeekStartDay;
  /**
   * Default serving time per slot, as 24-hour `HH:MM`. A planned meal's own `time` wins
   *
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
   * `12h` or `24h` for meal times. Unset follows the household time format
   *
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
  /** Display style: `week`, `today`, `next-meal`, `compact`, or `list` */
  view: MealPlannerView;
  /** Show meal emoji */
  showEmoji: boolean;
  /** Show prep time in minutes */
  showPrepTime: boolean;
  /** Show meal tags */
  showTags: boolean;
  /** Accent color for highlights */
  accentColor: string;
  /**
   * What tapping a meal with a saved recipe link does: `off`, `qr` (fullscreen QR code overlay), or
   * `iframe` (embed the recipe page)
   */
  tapRecipeAction?: RecipeTapAction;
  /**
   * Show the "Today's Meals" label in the today view
   *
   * Show the "Today's Meals" label in the today view. Omitted = shown.
   */
  showTitle?: boolean;
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
   * Icon name without the `fa-` prefix (e.g. `"house"`, `"cloud-sun"`, `"github"`). A full class
   * string with spaces is used verbatim and ignores `style`
   *
   * Icon name without the `fa-` prefix (e.g. "house", "cloud-sun", "github").
   * If the user pastes a full class string (anything containing a space or
   * starting with `fa-`), it is used verbatim and `style` is ignored.
   */
  iconName: string;
  /**
   * Free Font Awesome style. `solid` covers most icons; `brands` is required for logos like GitHub
   * or Slack
   *
   * Free Font Awesome style: solid, regular, or brands.
   */
  style: IconStyle;
  /** Icon glyph color (CSS color) */
  color: string;
  /**
   * Background tint behind the glyph, separate from the module wrapper background
   *
   * Background tint behind the icon glyph (separate from module wrapper bg).
   */
  iconBackground?: string;
  /** Rotate the icon in 90° increments */
  rotation: IconRotation;
  /** Mirror the icon */
  flip: IconFlip;
  /**
   * One of `none`, `spin`, `spin-pulse`, `spin-reverse`, `beat`, `fade`, `beat-fade`, `bounce`,
   * `shake`, `flip`
   */
  animation: IconAnimation;
  /**
   * Animation cycle length in seconds (Font Awesome `--fa-animation-duration`)
   *
   * Animation duration in seconds (Font Awesome --fa-animation-duration).
   */
  animationDuration: number;
  /**
   * Glyph size as a fraction of the smaller container dimension (`cqmin`). Ignored when `autoFit`
   * is true
   *
   * Icon size as a fraction of the smaller container dimension (cqmin units).
   * 1.0 = fills the box, 0.5 = half. Ignored when `autoFit` is true.
   */
  scale: number;
  /**
   * When true, locks `scale` to `0.85` so the glyph has a comfortable margin on all sides
   *
   * When true, scale is locked to 0.85 to leave a comfortable breathing margin.
   */
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
  /** Which shape to render (see list above) */
  view: ShapeView;

  // Fill & color (shared)
  /** Use a flat color or a linear gradient between `gradientFrom` and `gradientTo` */
  fillMode: ShapeFillMode;
  /** Solid fill color */
  color: string;
  /** Gradient start color (used when `fillMode = "gradient"`) */
  gradientFrom: string;
  /** Gradient end color */
  gradientTo: string;
  /** Gradient angle in degrees */
  gradientAngle: number;

  // Line variants (divider, double-line, wave, zigzag, dotted-row)
  /** Direction for line views (divider, double-line, wave, zigzag, dotted-row) */
  orientation: ShapeOrientation;
  /** Line thickness in px (line views) */
  thickness: number;
  /** Stroke pattern for the divider line */
  lineStyle: ShapeLineStyle;
  /**
   * Edge treatment: flat ends, fade-to-transparent, or rounded caps
   *
   * Edge treatment for divider lines: flat ends, fade-to-transparent, or rounded caps.
   */
  endStyle: ShapeEndStyle;
  /**
   * Wave/zigzag amplitude as % of viewBox height (0–50)
   *
   * Wave/zigzag amplitude as % of viewBox height (0-50).
   */
  waveAmplitude: number;
  /**
   * Number of full wave/zigzag cycles across the width
   *
   * Number of full wave/zigzag cycles across the width.
   */
  waveFrequency: number;
  /**
   * Number of dots in the `dotted-row` view
   *
   * Number of dots in the dotted-row view.
   */
  dotCount: number;
  /**
   * Dot radius in px for `dotted-row`
   *
   * Dot radius in px for dotted-row.
   */
  dotSize: number;
  /**
   * Pixel gap between the two parallel lines in `double-line` view
   *
   * Pixel gap between the two parallel lines in double-line view.
   */
  doubleLineGap: number;

  // Geometric (rectangle, circle, triangle, polygon, star, arrow)
  /** Render geometric shapes as outlines instead of filled */
  outline: boolean;
  /** Outline stroke width in px */
  strokeWidth: number;
  /** Corner radius in px for `rectangle` */
  cornerRadius: number;
  /**
   * Polygon side count (3–12)
   *
   * Polygon side count (3-12).
   */
  sides: number;
  /**
   * Star point count (3–12)
   *
   * Star point count (3-12).
   */
  starPoints: number;
  /**
   * Star inner-to-outer radius ratio (0.2–0.8). Lower = pointier
   *
   * Star inner-to-outer radius ratio (0.2-0.8). Lower = pointier.
   */
  starInnerRatio: number;
  /**
   * Rotation in degrees applied to geometric shapes
   *
   * Rotation in degrees applied to geometric shapes.
   */
  rotation: number;
  /** Arrow head direction */
  arrowDirection: ShapeArrowDirection;
  /**
   * Arrow head length as ratio of total length (0.1–0.6)
   *
   * Arrow head length as ratio of total length (0.1-0.6).
   */
  arrowHeadRatio: number;

  // Atmospheric (glow, gradient, grid)
  /**
   * Glow gradient falloff (0 = hard edge, 1 = soft edge)
   *
   * Glow gradient falloff: 0 = hard edge, 1 = soft edge.
   */
  softness: number;
  /**
   * Glow center max alpha (0–1)
   *
   * Glow center max alpha (0-1).
   */
  intensity: number;
  /** Pattern used by the `grid` view */
  gridPattern: ShapeGridPattern;
  /**
   * Grid spacing in px
   *
   * Grid spacing in px.
   */
  gridSpacing: number;
  /**
   * Grid dot/line thickness in px
   *
   * Grid dot/line thickness in px.
   */
  gridDotSize: number;

  // Frame
  /** Frame border style */
  frameStyle: ShapeFrameStyle;
  /**
   * Bracket length as % of side length (5–50) when `frameStyle = "brackets"`
   *
   * Bracket length as % of side length (5-50).
   */
  bracketLength: number;
}

// iFrame / Web embed module config
export interface IframeConfig {
  /** URL of the page to embed */
  url: string;
  /** Auto-refresh interval in ms (0 = off) */
  refreshIntervalMs: number;
  /** Allow scrolling within the embedded page */
  scrollable: boolean;
  /** Apply sandbox restrictions to the iframe */
  sandboxEnabled: boolean;
  /** Sandbox permission tokens (when enabled) */
  sandbox: string;
  /** Accessibility title for the iframe */
  title: string;
}

// Date module config
export type DateView = 'full' | 'minimal' | 'stacked' | 'editorial' | 'banner';

export interface DateConfig {
  /** Display style: `full`, `minimal`, `stacked`, `editorial`, or `banner` */
  view: DateView;
  /** Date format string (date-fns format, used in minimal view) */
  dateFormat: string;
  /**
   * IANA timezone to show (e.g. `"Asia/Tokyo"`); empty = follow the display setting
   *
   * IANA zone id; empty/absent = follow the display setting.
   *
   * @default ""
   */
  timezone?: string;
  /** Show day of week name */
  showDayName: boolean;
  /** Show year */
  showYear: boolean;
  /** Show week number (e.g. "Week 12") */
  showWeekNumber: boolean;
  /** Show day of year (e.g. "Day 75") */
  showDayOfYear: boolean;
  /** Accent color for day number and dividers */
  accentColor: string;
}

// Display control module config
export interface DisplayControlConfig {
  /**
   * Control layout, `bar` is a single row, `pad` a grid of large buttons with brightness on tap,
   * `panel` a grid with the brightness slider always visible, `nav` just two big Previous and Next
   * buttons
   *
   * 'nav' is the pared-back one: just Previous and Next, nothing else.
   */
  layout: 'bar' | 'pad' | 'panel' | 'nav';
  /**
   * Which display the buttons control. `self` resolves to the display the module is rendered on
   *
   * Target at mount time. 'self' resolves to the display this module renders
   * on (via useDisplayId). 'all' broadcasts. A display id targets that queue;
   * an unknown id falls back to 'self'.
   */
  defaultTarget: 'all' | 'self' | string;
  /**
   * Show a "Controls" dropdown of display names (with "All displays" last) so people can retarget
   * on the wall (hidden in single-display mode)
   *
   * When false, the in-module picker is hidden even in multi-display mode.
   */
  allowRetargeting: boolean;
  /**
   * Icons only, no words (the buttons keep their spoken labels)
   *
   * Icons only, no words on the buttons.
   */
  compact: boolean;
}

// Chore chart module config
export type ChoreChartView = 'board' | 'star-chart' | 'today' | 'progress' | 'compact';
export type ChoreTimeOfDay = 'morning' | 'afternoon' | 'evening' | 'anytime';
export type ChoreRotation = 'fixed' | 'rotate-daily' | 'rotate-weekly' | 'schedule';
export type ChoreResetFrequency = 'daily' | 'weekly' | 'biweekly' | 'once';

export interface ChoreDefinition {
  /** Unique ID */
  id: string;
  /** Chore name */
  name: string;
  /** Emoji shown with the chore */
  emoji: string;
  /** Tickets earned for doing it; 0 or more (0 = no reward) */
  points: number;
  /** How often it comes around */
  frequency: ChoreResetFrequency;
  /** Days it happens, 0 = Sunday through 6 = Saturday */
  daysOfWeek: number[];
  /**
   * The day, as `YYYY-MM-DD`, when `frequency` is `once`
   *
   * YYYY-MM-DD — required when frequency is 'once'
   */
  specificDate?: string;
  /** When in the day it belongs */
  timeOfDay: ChoreTimeOfDay;
  /** Family members it can go to */
  assigneeIds: string[];
  /**
   * How it is shared among `assigneeIds`: everyone every time (`fixed`), taking turns by day or by
   * week, or by `schedule`
   */
  rotation: ChoreRotation;
  /** With `rotation` set to `schedule`: each member ID to the days (0 to 6) they have the chore */
  schedule?: Record<string, number[]>;
}

export interface ChoreCompletion {
  /** The chore */
  choreId: string;
  /** Who did it */
  memberId: string;
  /** The day it was done, as `YYYY-MM-DD` */
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
  /** Display style: `board`, `star-chart`, `today`, `progress`, or `compact` */
  view: ChoreChartView;
  /** First day of week: `sunday` or `monday` */
  weekStartDay: WeekStartDay;
  /** Show ticket values for chores */
  showPoints: boolean;
  /** Show completion streaks */
  showStreaks: boolean;
  /** Show time-of-day labels (morning, afternoon, evening) */
  showTimeOfDay: boolean;
  /** Allow marking chores complete from the display view */
  allowDisplayComplete: boolean;
  /** Accent color for highlights */
  accentColor: string;
  /**
   * Show the built-in view title ("Family Chores", "Star Chart", and so on)
   *
   * Show the built-in view title ("Family Chores", "Star Chart", ...). Omitted = shown.
   */
  showTitle?: boolean;
}

export type FullscreenChoreChartView = 'chores' | 'rewards-store';

/**
 * How the week's stars are shown on the fullscreen chore board.
 * - `chips` seven small stars inside each member chip (default)
 * - `strip` one aggregate cell per day for the whole household
 * - `grid`  the per-member star grid at the bottom
 * - `off`   nothing; every spare pixel goes to the chore list
 */
export type FullscreenChoreChartWeekProgress = 'chips' | 'strip' | 'grid' | 'off';
/**
 * How the fullscreen chore board groups its rows: by time of day (one row per
 * chore, a dot per person) or by person (one section per member, a row per
 * chore they have). Omitted = `by-time`.
 */
export type FullscreenChoreChartLayout = 'by-time' | 'by-person';

export interface FullscreenChoreChartConfig {
  /** Display mode: `chores` (daily chore board) or `rewards-store` (browse and redeem rewards) */
  view: FullscreenChoreChartView;
  /** Show a toggle button in the chore board header to switch to the rewards store view */
  showRewardsButton: boolean;
  /** First day of week: `sunday` or `monday` */
  weekStartDay: WeekStartDay;
  /** Where the week's stars render. Omitted = `chips`. */
  weekProgress?: FullscreenChoreChartWeekProgress;
  /**
   * Group chores by: `by-time` (one row per chore, a dot per person, with the person's name under
   * each dot when the row has room) or `by-person` (one section per person with their own chores).
   * By person works best for up to four people
   *
   * Row grouping. Omitted = `by-time`.
   */
  layout?: FullscreenChoreChartLayout;
  /** Show ticket values for chores */
  showPoints: boolean;
  /** Show completion streaks */
  showStreaks: boolean;
  /**
   * Group chores by time of day (morning, afternoon, evening); by person, this only orders each
   * person's chores
   */
  showTimeOfDay: boolean;
  /** Let anyone tap a chore on the display itself to mark it done */
  allowDisplayComplete: boolean;
  /** Superseded by `theme` (see above). Kept so older configurations still render */
  darkMode: boolean;
  /** Layout density: `cozy` or `snug` */
  density: 'cozy' | 'snug';
  /** Text size: `small`, `medium`, `large`, `extra-large`, `2x-large`, `3x-large`, or `4x-large` */
  typographySize: FullscreenTypographySize;
  /**
   * Accent color for highlights and active time-of-day. Leave empty to follow the theme's own
   * accent; set a color to pin it
   */
  accentColor: string;
  /**
   * One of the twelve shared full-screen palettes (see [Themes](#full-screen) above). Unset =
   * inherit the display default from Settings > Screen
   */
  theme?: string;
}

// Fullscreen meal planner module config
export type FullscreenMealPlannerView = 'week' | 'today' | 'menu-board' | 'next-meal';

export interface FullscreenMealPlannerConfig {
  /** Display style: `week`, `today`, `menu-board`, or `next-meal` */
  view: FullscreenMealPlannerView;
  /** Layout density: `cozy` or `snug` */
  density: 'cozy' | 'snug';
  /** Text size: `small`, `medium`, `large`, `extra-large`, `2x-large`, `3x-large`, or `4x-large` */
  typographySize: FullscreenTypographySize;
  /**
   * Accent color for highlights. Leave empty to follow the theme's own accent; set a color to pin
   * it
   */
  accentColor: string;
  /** Show prep time in minutes */
  showPrepTime: boolean;
  /** Show meal tags */
  showTags: boolean;
  /** Show meal emoji */
  showEmoji: boolean;
  /** Show difficulty indicator */
  showDifficulty: boolean;
  /**
   * One of the twelve shared full-screen palettes (see [Themes](#full-screen) above). Unset =
   * inherit the display default from Settings > Screen
   */
  theme?: string;
  /**
   * What tapping a meal with a saved recipe link does: `off`, `qr` (fullscreen QR code overlay), or
   * `iframe` (embed the recipe page)
   */
  tapRecipeAction?: RecipeTapAction;
  /**
   * Show the view title ("Today's Meals", "This Week's Meals", "Today's Menu")
   *
   * Show the view title ("Today's Meals", "This Week's Meals", "Today's Menu"). Omitted = shown.
   */
  showTitle?: boolean;
}

// Fullscreen weather module config
/**
 * panorama — the flagship stack; almanac — instrument bento; ambient — huge
 * read-from-across-the-room; week — the daily forecast as the whole screen;
 * hourly — the next 24 hours as a timeline (down the page in portrait, across
 * it in landscape).
 */
export type FullscreenWeatherView = 'panorama' | 'strip' | 'almanac' | 'ambient' | 'week' | 'hourly';

/** 'auto' tints the background by condition and sun elevation; 'off' falls
 *  back to the flat theme background. The sky is a wash *behind* the cards,
 *  so turning it off never changes any text contrast. */
export type FullscreenWeatherSky = 'auto' | 'off';

export interface FullscreenWeatherConfig {
  /** `panorama`, `strip` (Wide strip), `almanac`, `ambient`, `week`, or `hourly` */
  view: FullscreenWeatherView;
  /** `cozy` or `snug`. Controls padding, gaps, and chart heights */
  density: 'cozy' | 'snug';
  /** Text size. Scales type only, so the layout keeps its proportions */
  typographySize: FullscreenTypographySize;
  /**
   * Leave empty to let the accent follow the weather (amber for clear, blue for rain, violet for
   * storms); set a colour to pin it
   */
  accentColor: string;
  /** Full-screen palette; unset inherits the display default */
  theme?: string;
  /**
   * `auto` tints the background by conditions, `off` uses the plain theme background
   *
   * Condition-reactive background wash. Default 'auto'.
   */
  skyLayer?: FullscreenWeatherSky;
  /**
   * Falling rain and snow. Turn off if the display stutters on older hardware
   *
   * Falling rain/snow particles. Off is the cheap mode for slow Pis. Default true.
   */
  animateConditions?: boolean;
  /**
   * Next-hour rain strip (Panorama, Pirate Weather only)
   *
   * Panorama: the minute-by-minute strip. Renders only when the provider
   *  returns minutely data (Pirate Weather today); hides itself otherwise.
   */
  showNowcast: boolean;
  /**
   * Severe-weather banner
   *
   * Panorama + Almanac: severe-weather banner.
   */
  showAlerts: boolean;
  /**
   * Clock in the header. Follows your 12/24-hour setting and the display's time zone
   *
   * Clock in the header. Applies to every view. Default true.
   */
  showTime: boolean;
  /**
   * Temperature curve (Panorama)
   *
   * Panorama: the 48h temperature ribbon.
   */
  showRibbon: boolean;
  /**
   * Bottom stats row (Panorama)
   *
   * Panorama: the bottom wind/humidity/UV/pressure/sunset rail.
   */
  showStatRail: boolean;
  /**
   * Days in the outlook list, 3–7 (Panorama and Week ahead)
   *
   * Panorama + Week: how many forecast days the daily list shows (3-7).
   */
  daysToShow: number;
  /**
   * Overrides the place name shown in the header
   *
   * Optional place-name override, mirroring WeatherConfig.locationLabel.
   */
  locationLabel?: string;
}

// Fullscreen photo viewer module config
export type FullscreenPhotoTransition = 'fade' | 'slide' | 'zoom' | 'none';

export interface FullscreenPhotoConfig {
  /** Path to local photo directory (slideshow mode) */
  directory: string;
  /**
   * Path to a single pinned photo. When set, the viewer shows this image statically and ignores
   * `directory`/`intervalMs`/`transition`/`shuffle`. Shows a "No photo selected" empty state until
   * chosen
   */
  file?: string;
  /** Time between photos in milliseconds */
  intervalMs: number;
  /** Transition effect: `fade`, `slide`, `zoom`, or `none` */
  transition: FullscreenPhotoTransition;
  /** Image fit mode: `cover`, `contain`, or `fill` */
  objectFit: 'cover' | 'contain' | 'fill';
  /** Randomize photo order */
  shuffle: boolean;
  /** Show clock overlay on photos */
  showClock: boolean;
  /** Enable Ken Burns (slow pan/zoom) effect */
  kenBurns: boolean;
  /**
   * Palette for the clock overlay and empty states; one of the twelve shared full-screen palettes
   * (see [Themes](#full-screen) above). Unset = inherit the display default from Settings > Screen,
   * and Midnight if that is unset too
   */
  theme?: string;
  /**
   * Photo source: `local`, `immich` (requires keys in Settings > API keys), `onedrive` (a one-time
   * Microsoft sign-in), or `icloud` (a public shared album, no keys needed)
   */
  source?: 'local' | 'immich' | 'icloud' | 'onedrive';
  /** Filter to a specific Immich album */
  immichAlbumId?: string;
  /** Filter to a recognized person (face) in Immich */
  immichPersonId?: string;
  /**
   * Only show photos marked as favorites in Immich
   *
   * @default false
   */
  immichFavoritesOnly?: boolean;
  /**
   * Number of photos to load per refresh (10–200)
   *
   * @default 50
   */
  immichCount?: number;
  /**
   * iCloud shared album link (`icloud.com/sharedalbum/#TOKEN`) or bare token (iCloud source)
   *
   * Public share link (icloud.com/sharedalbum/#TOKEN) or bare token.
   */
  icloudAlbumUrl?: string;
  /**
   * OneDrive folder to pull photos from (OneDrive source)
   *
   * Graph driveItem ID of the OneDrive folder this module pulls from (source 'onedrive').
   */
  onedriveFolderId?: string;
  /**
   * Folder name as shown in the editor, display only, the ID above is authoritative
   *
   * Folder label captured at pick time — display only, the ID is authoritative.
   */
  onedriveFolderName?: string;
  /**
   * Number of photos to load per refresh (10–200)
   *
   * Photos per refresh for source 'onedrive'. Default 50.
   *
   * @default 50
   */
  onedriveCount?: number;
  /**
   * What to show: `photos`, `videos`, or `both`
   *
   * Default 'photos' — existing photo-only behavior.
   */
  mediaTypes?: SlideshowMediaTypes;
  /**
   * Longest a video slide can play before moving on (60 sec)
   *
   * Force-advance cap for video slides. Default 60000.
   */
  maxVideoDurationMs?: number;
}

// Video module config
export interface VideoConfig {
  /** Where the video comes from: `file` (media library) or `url` (direct link or YouTube) */
  source: 'file' | 'url';
  /**
   * Path to a video in the media library (file source)
   *
   * Relative path under data backgrounds (same store as photo slideshows).
   */
  file?: string;
  /**
   * Direct link to an MP4/WebM video, or any YouTube link (url source)
   *
   * Direct https mp4/webm URL. HLS is deliberately not supported yet.
   */
  url?: string;
  /** How the video fills the container: `cover`, `contain`, or `fill` */
  objectFit: 'cover' | 'contain' | 'fill';
  /**
   * Keep the video silent. Turning sound on also needs the display's autoplay setting (see below)
   *
   * Default true. Sound additionally requires the kiosk autoplay launcher flag.
   */
  muted: boolean;
  /** Start the video over when it ends */
  loop: boolean;
  /**
   * Stop playing after this many milliseconds (0 or unset = keep playing)
   *
   * Safety cap that force-advances a stalled clip; 0/undefined = uncapped (loop covers it).
   */
  maxDurationMs?: number;
}
