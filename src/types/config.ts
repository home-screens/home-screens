export type BuiltinModuleType =
  | 'clock'
  | 'calendar'
  | 'weather'
  | 'countdown'
  | 'dad-joke'
  | 'text'
  | 'image'
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
  | 'meal-planner'
  | 'iframe'
  | 'chore-chart'
  | 'fullscreen-calendar'
  | 'fullscreen-chore-chart'
  | 'fullscreen-meal-planner'
  | 'fullscreen-photo';

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

export interface ModuleInstance {
  id: string;
  type: ModuleType;
  position: ModulePosition;
  size: ModuleSize;
  zIndex: number;
  config: Record<string, unknown>;
  style: ModuleStyle;
  schedule?: ModuleSchedule;
}

export interface BackgroundRotation {
  enabled: boolean;
  source?: 'unsplash' | 'nasa-apod' | 'immich';
  query: string;
  intervalMinutes: number;
  immichAlbumId?: string;
  immichPersonId?: string;
  immichFavoritesOnly?: boolean;
}

export interface Screen {
  id: string;
  name: string;
  enabled?: boolean;
  backgroundImage: string;
  backgroundRotation?: BackgroundRotation;
  modules: ModuleInstance[];
}

export interface WeatherSettings {
  provider: 'openweathermap' | 'weatherapi' | 'pirateweather' | 'noaa' | 'open-meteo';
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
}

export interface ICalSource {
  id: string;
  type: 'ical';
  name: string;
  url: string;
  color: string;
  enabled: boolean;
}

export interface CalendarSettings {
  googleCalendarId: string;
  googleCalendarIds: string[];
  icalSources: ICalSource[];
  maxEvents: number;
  daysAhead: number;
  holidayCountry?: string; // ISO 3166-1 alpha-2 country code (e.g. 'US')
}

export interface SleepSettings {
  enabled: boolean;
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
  alerts?: AlertSettings;
  telemetryEnabled?: boolean;
  fullscreenTheme?: string;
  pauseEnabled?: boolean;
  pauseTimeoutSeconds?: number;
  backupReminder?: BackupReminderSettings;
}

export interface Profile {
  id: string;
  name: string;
  screenIds: string[];
  schedule?: ModuleSchedule;
}

export interface ScreenConfiguration {
  version: number;
  settings: GlobalSettings;
  screens: Screen[];
  profiles?: Profile[];
}

// Default style for new modules
export const DEFAULT_MODULE_STYLE: ModuleStyle = {
  opacity: 1,
  borderRadius: 12,
  padding: 16,
  backgroundColor: 'rgba(0, 0, 0, 0.4)',
  textColor: '#ffffff',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 16,
  backdropBlur: 12,
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.15)',
  shadowSize: 8,
};

// Clock module config
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
  // View-specific
  showNumerals: boolean;        // analog: hour numbers on face
  animateFlip: boolean;         // flip: show flip animation on digit change
  accentColor: string;          // shared accent for several views
  worldZones: WorldClockZone[]; // world: additional timezones (max 3)
  referenceTime: string;        // elapsed: ISO timestamp or time string
  referenceLabel: string;       // elapsed: label ("market open", "shift start")
  countUp: boolean;             // elapsed: count up (true) or down (false)
}

// Fullscreen calendar module config (Skylight-inspired ambient display)
export type FullscreenCalendarView = 'schedule' | 'week-list' | 'month-grid' | 'day-timeline' | 'agenda';
export type CalendarDensity = 'cozy' | 'snug';
export type FullscreenTypographySize =
  | 'small' | 'medium' | 'large' | 'extra-large' | '2x-large' | '3x-large';
export interface FullscreenCalendarConfig {
  view: FullscreenCalendarView;
  density: CalendarDensity;
  typographySize: FullscreenTypographySize;
  accentColor: string;
  dimPastEvents: boolean;
  shadeWeekends: boolean;
  showWeather: boolean;
  showNowLine: boolean;
  sourceFilter?: string[];
  darkMode: boolean;
  theme?: string;

  // Schedule view
  scheduleDaysToShow: number;       // 1-7, 0 = auto
  scheduleHourStart: number;        // 0-23
  scheduleHourEnd: number;          // 1-24

  // Week list view
  weekCollapsePastDays: boolean;

  // Month grid view
  monthShowWeekNumbers: boolean;
  monthMaxEventsPerCell: number;    // 0 = auto

  // Day timeline view
  dayHourStart: number;
  dayHourEnd: number;
  dayShowLocation: boolean;

  // Agenda view
  agendaDaysAhead: number;          // 7-30
  agendaHideEmptyDays: boolean;
}

// Calendar module config
export type CalendarViewMode = 'daily' | 'agenda' | 'week' | 'month';

export interface CalendarConfig {
  viewMode: CalendarViewMode;
  daysToShow: number;
  showTime: boolean;
  showLocation: boolean;
  maxEvents: number;
  showWeekNumbers: boolean;
  sourceFilter?: string[];  // undefined or empty = all sources (merged)
  accentColor?: string;     // Event indicator bar and today highlights; default '#3b82f6'
}

// Unified weather module config
export type WeatherView = 'current' | 'hourly' | 'daily' | 'combined' | 'compact' | 'table' | 'precipitation' | 'alerts';

export type WeatherIconSet = 'outline' | 'color';
export type WeatherProviderOption = 'global' | 'openweathermap' | 'weatherapi' | 'pirateweather' | 'noaa' | 'open-meteo';

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
}


// Countdown config
export type CountdownView = 'all' | 'next';

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
  scale: number; // 0.5 – 4, default 1
  view: CountdownView;
  holidayCountry?: string;
}

// Dad joke config
export interface DadJokeConfig {
  refreshIntervalMs: number;
  accentColor?: string;
  showDividers?: boolean;
}

// Text module config
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
  effect?: 'none' | 'typewriter' | 'fade-in' | 'gradient-sweep' | 'glow';
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
  // Icon prefix (emoji or short text)
  icon?: string;
  // Dynamic template variables ({{time}}, {{date}}, {{greeting}}, etc.)
  templateVariables?: boolean;
  // Marquee scrolling
  marquee?: boolean;
  marqueeSpeed?: number;
  marqueeDirection?: 'left' | 'right' | 'up' | 'down';
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
  completed: boolean;
}

export interface TodoConfig {
  title: string;
  items: TodoItem[];
  accentColor?: string;
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
}

// Crypto module config
export type CryptoView = 'cards' | 'ticker' | 'table' | 'compact';

export interface CryptoConfig {
  ids: string;
  refreshIntervalMs: number;
  view: CryptoView;
  cardScale?: number;
  tickerSpeed?: number;
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
export type SunriseSunsetView = 'default' | 'arc';

export interface SunriseSunsetConfig {
  view: SunriseSunsetView;
  showDayLength: boolean;
  showGoldenHour: boolean;
}

// Photo slideshow module config
export interface PhotoSlideshowConfig {
  directory: string;
  intervalMs: number;
  transition: 'fade' | 'none';
  objectFit: 'cover' | 'contain' | 'fill';
  refreshIntervalMs: number;
  source?: 'local' | 'immich';
  immichAlbumId?: string;
  immichPersonId?: string;
  immichFavoritesOnly?: boolean;
  immichCount?: number;
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
  startDay: 'sunday' | 'monday';
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
}

export interface MealPlannerConfig {
  view: MealPlannerView;
  slots: MealSlotType[];
  weekStartDay: 'sunday' | 'monday';
  showEmoji: boolean;
  showPrepTime: boolean;
  showTags: boolean;
  accentColor: string;
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
  showDayName: boolean;
  showYear: boolean;
  showWeekNumber: boolean;
  showDayOfYear: boolean;
  accentColor: string;
}

// Chore chart module config
export type ChoreChartView = 'board' | 'star-chart' | 'today' | 'progress' | 'compact';
export type ChoreTimeOfDay = 'morning' | 'afternoon' | 'evening' | 'anytime';
export type ChoreRotation = 'fixed' | 'rotate-daily' | 'rotate-weekly';
export type ChoreResetFrequency = 'daily' | 'weekly' | 'biweekly';

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
  timeOfDay: ChoreTimeOfDay;
  assigneeIds: string[];
  rotation: ChoreRotation;
}

export interface ChoreCompletion {
  choreId: string;
  memberId: string;
  date: string;
  completedAt: string;
}

export interface ChoreChartConfig {
  view: ChoreChartView;
  members: ChoreMember[];
  chores: ChoreDefinition[];
  weekStartDay: 'sunday' | 'monday';
  showPoints: boolean;
  showStreaks: boolean;
  showTimeOfDay: boolean;
  allowDisplayComplete: boolean;
  accentColor: string;
}

export interface FullscreenChoreChartConfig {
  weekStartDay: 'sunday' | 'monday';
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
  weekStartDay: 'sunday' | 'monday';
  slots: MealSlotType[];
  showPrepTime: boolean;
  showTags: boolean;
  showEmoji: boolean;
  showDifficulty: boolean;
  theme?: string;
}

// Fullscreen photo viewer module config
export type FullscreenPhotoTransition = 'fade' | 'slide' | 'zoom' | 'none';

export interface FullscreenPhotoConfig {
  directory: string;
  intervalMs: number;
  transition: FullscreenPhotoTransition;
  objectFit: 'cover' | 'contain' | 'fill';
  shuffle: boolean;
  showClock: boolean;
  kenBurns: boolean;
  theme?: string;
  source?: 'local' | 'immich';
  immichAlbumId?: string;
  immichPersonId?: string;
  immichFavoritesOnly?: boolean;
  immichCount?: number;
}

