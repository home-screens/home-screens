import type { ModuleType } from '@/types/config';
import type { LucideIcon } from 'lucide-react';
import {
  Clock, CalendarDays, CloudSun, Hourglass, Laugh, Type, ImageIcon,
  Quote, ListTodo, StickyNote, HandMetal,
  Newspaper, TrendingUp, Bitcoin, BookOpen, History,
  Moon, Sunrise, Image, QrCode, BarChart3, Car, Trophy, Wind,
  ListChecks, CloudRain, CalendarRange, Trash2, Medal, Sparkles,
  Calendar, Globe, UtensilsCrossed, ClipboardList, Columns3, LayoutGrid,
  Star, Shapes,
} from 'lucide-react';
import { DEFAULT_ACCENT_COLOR } from './meal-constants';
import { resolveLucideIcon } from './lucide-resolver';
import { pluginStateKey } from '@/lib/plugin-state-keys';
import type { ProvidedStateKey } from '@/lib/shared-state-types';

type ModuleCategory =
  | 'Full Screen'
  | 'Time & Date'
  | 'Weather & Environment'
  | 'News & Finance'
  | 'Knowledge & Fun'
  | 'Personal'
  | 'Media & Display'
  | 'Travel';

export const MODULE_CATEGORIES: ModuleCategory[] = [
  'Full Screen',
  'Time & Date',
  'Weather & Environment',
  'News & Finance',
  'Knowledge & Fun',
  'Personal',
  'Media & Display',
  'Travel',
];

const CATEGORY_SLUG_MAP: Record<ModuleCategory, string> = {
  'Full Screen': 'fullScreen',
  'Time & Date': 'timeAndDate',
  'Weather & Environment': 'weatherAndEnvironment',
  'News & Finance': 'newsAndFinance',
  'Knowledge & Fun': 'knowledgeAndFun',
  'Personal': 'personal',
  'Media & Display': 'mediaAndDisplay',
  'Travel': 'travel',
};

/**
 * Returns the camelCase slug for a built-in category (used as the i18n key
 * suffix under `editor.registry.categories.*`), or `null` for plugin-defined
 * categories that don't match a built-in.
 */
export function categorySlug(category: string): string | null {
  return (CATEGORY_SLUG_MAP as Record<string, string>)[category] ?? null;
}

// Re-exported for existing importers; the type lives in shared-state-types.ts
// so plugin types and the loader can share it without a registry import cycle.
export type { ProvidedStateKey } from '@/lib/shared-state-types';

export interface ModuleDefinition {
  type: ModuleType;
  label: string;
  icon: LucideIcon;
  category: ModuleCategory | string; // built-in or custom plugin category
  defaultConfig: Record<string, unknown>;
  defaultSize: { w: number; h: number };
  defaultStyle?: Partial<import('@/types/config').ModuleStyle>;
  /** When true, the module snaps to full canvas size (position 0,0) on add. */
  fillsCanvas?: boolean;
  /**
   * Shared-state keys this module type publishes (see shared-state-store.ts).
   * Declaring either field marks the type as a state producer: the editor
   * offers the "run in background" toggle and lists these keys in the
   * visibility-condition picker. Runtime keys can't be enumerated statically,
   * so producers must advertise them here.
   */
  providesState?: ProvidedStateKey[];
  /** For producers whose keys depend on instance config (e.g. an entity list). */
  deriveProvidedKeys?: (config: Record<string, unknown>) => ProvidedStateKey[];
  // Plugin-specific fields
  configSchema?: import('@/types/plugins').PluginConfigSchema;
  /**
   * Shared data feeds injected as props by ScreenRenderer. Note for
   * 'calendar' consumers: the shared feed's window widens to the start of
   * the month when a grid view is on any screen, so modules rendering an
   * upcoming-only list must filter with `isEventUpcoming` (calendar-utils)
   * rather than assume the feed starts at "now". This is also where a
   * window hint would live if plugin modules ever need to widen the fetch
   * themselves (getCalendarFetchWindow currently recognizes only the two
   * built-in calendar module types).
   */
  dataRequirements?: import('@/types/plugins').PluginDataRequirement[];
}

const registry = new Map<ModuleType, ModuleDefinition>();

function registerModule(definition: ModuleDefinition): void {
  registry.set(definition.type, definition);
}

/**
 * Register a plugin module from its manifest. Resolves icon string → component
 * via lucide-resolver. `runtime` carries values that can't live in the static
 * JSON manifest — currently `deriveProvidedKeys`, a function exported by the
 * plugin's IIFE bundle for config-driven state-key derivation.
 *
 * This is the namespacing choke point for advertised state keys: runtime
 * publishes always go through `plugin:<id>:` (see the SDK's publishState), so
 * both static `providesState` keys and `deriveProvidedKeys` results are
 * prefixed the same way here — otherwise the editor's condition picker would
 * offer keys that can never exist in the store. Malformed entries are dropped
 * rather than trusted (the dev-plugin path skips validateManifest).
 */
export function registerPluginModule(
  manifest: import('@/types/plugins').PluginManifest,
  runtime?: { deriveProvidedKeys?: ModuleDefinition['deriveProvidedKeys'] },
): void {
  const moduleType: ModuleType = `plugin:${manifest.moduleType}`;
  const icon = resolveLucideIcon(manifest.icon);

  const namespaceEntries = (entries: unknown): ProvidedStateKey[] =>
    (Array.isArray(entries) ? entries : [])
      .filter((e): e is ProvidedStateKey =>
        !!e && typeof e === 'object'
        && typeof (e as ProvidedStateKey).key === 'string'
        && typeof (e as ProvidedStateKey).label === 'string')
      .map((e) => ({ ...e, key: pluginStateKey(manifest.id, e.key) }));

  const providesState = manifest.providesState !== undefined
    ? namespaceEntries(manifest.providesState)
    : undefined;

  const rawDerive = runtime?.deriveProvidedKeys;
  const deriveProvidedKeys = rawDerive
    ? (config: Record<string, unknown>): ProvidedStateKey[] =>
        // Throws propagate — collectProvidedStateKeys try/catches third-party derivers.
        namespaceEntries(rawDerive(config))
    : undefined;

  registry.set(moduleType, {
    type: moduleType,
    label: manifest.name,
    icon,
    category: manifest.category,
    defaultConfig: manifest.defaultConfig ?? {},
    defaultSize: manifest.defaultSize ?? { w: 400, h: 300 },
    defaultStyle: manifest.defaultStyle,
    providesState,
    deriveProvidedKeys,
    configSchema: manifest.configSchema,
    dataRequirements: manifest.dataRequirements,
  });
}

/** Unregister a module (used when uninstalling plugins). */
export function unregisterModule(type: ModuleType): void {
  registry.delete(type);
}

export function getModuleDefinition(type: ModuleType): ModuleDefinition | undefined {
  return registry.get(type);
}

/** @internal */
export function getAllModuleDefinitions(): ModuleDefinition[] {
  return Array.from(registry.values());
}

/** Returns built-in categories plus any unique custom categories from registered plugins, sorted alphabetically after built-ins. */
export function getActiveCategories(): string[] {
  const custom = new Set<string>();
  for (const def of registry.values()) {
    if (!MODULE_CATEGORIES.includes(def.category as ModuleCategory)) {
      custom.add(def.category);
    }
  }
  return [...MODULE_CATEGORIES, ...[...custom].sort()];
}

export function getModulesByCategory(): Map<string, ModuleDefinition[]> {
  const categories = getActiveCategories();
  const grouped = new Map<string, ModuleDefinition[]>();
  for (const cat of categories) {
    grouped.set(cat, []);
  }
  for (const def of registry.values()) {
    let arr = grouped.get(def.category);
    if (!arr) {
      arr = [];
      grouped.set(def.category, arr);
    }
    arr.push(def);
  }
  return grouped;
}

// ---------------------------------------------------------------------------
// Built-in module definitions
// ---------------------------------------------------------------------------

const FULLSCREEN_STYLE: Partial<import('@/types/config').ModuleStyle> = {
  padding: 0, borderRadius: 0, backdropBlur: 0, backgroundColor: 'transparent', borderWidth: 0, shadowSize: 0,
};

const MODULE_DEFINITIONS: ModuleDefinition[] = [
  // -- Full Screen --
  {
    type: 'fullscreen-calendar',
    label: 'Full-Screen Calendar',
    icon: Columns3,
    category: 'Full Screen',
    defaultConfig: {
      view: 'schedule',
      density: 'cozy',
      typographySize: 'medium',
      accentColor: '#EA580C',
      dimPastEvents: true,
      shadeWeekends: true,
      showWeather: true,
      showNowLine: true,
      todayHighlightStyle: 'full',
      eventOverlap: 'columns',
      wrapEventTitles: false,
      darkMode: false,
      scheduleDaysToShow: 0,
      scheduleHourStart: 6,
      scheduleHourEnd: 22,
      scheduleShowDescription: false,
      weekCollapsePastDays: true,
      weekShowDescription: false,
      monthShowWeekNumbers: false,
      monthMaxEventsPerCell: 0,
      dayHourStart: 6,
      dayHourEnd: 22,
      dayShowLocation: true,
      dayShowDescription: false,
      agendaDaysAhead: 14,
      agendaHideEmptyDays: false,
      agendaShowDescription: false,
    },
    defaultSize: { w: 1080, h: 1920 },
    defaultStyle: FULLSCREEN_STYLE,
    fillsCanvas: true,
    dataRequirements: ['calendar', 'weather'],
  },
  {
    type: 'fullscreen-chore-chart',
    label: 'Full-Screen Chore Chart',
    icon: ClipboardList,
    category: 'Full Screen',
    defaultConfig: {
      view: 'chores',
      showRewardsButton: false,
      weekStartDay: 'monday',
      showPoints: true,
      showStreaks: true,
      showTimeOfDay: true,
      allowDisplayComplete: true,
      darkMode: true,
      density: 'cozy',
      typographySize: 'medium',
      accentColor: DEFAULT_ACCENT_COLOR,
    },
    defaultSize: { w: 1080, h: 1920 },
    defaultStyle: FULLSCREEN_STYLE,
    fillsCanvas: true,
  },
  {
    type: 'fullscreen-meal-planner',
    label: 'Full-Screen Meal Planner',
    icon: UtensilsCrossed,
    category: 'Full Screen',
    defaultConfig: {
      view: 'week',
      density: 'cozy',
      typographySize: 'medium',
      accentColor: DEFAULT_ACCENT_COLOR,
      showPrepTime: true,
      showTags: true,
      showEmoji: true,
      showDifficulty: false,
    },
    defaultSize: { w: 1080, h: 1920 },
    defaultStyle: FULLSCREEN_STYLE,
    fillsCanvas: true,
  },
  {
    type: 'fullscreen-photo',
    label: 'Full-Screen Photo Viewer',
    icon: Image,
    category: 'Full Screen',
    defaultConfig: {
      source: 'local',
      directory: '',
      intervalMs: 30000,
      transition: 'fade',
      objectFit: 'cover',
      shuffle: false,
      showClock: true,
      kenBurns: false,
    },
    defaultSize: { w: 1080, h: 1920 },
    defaultStyle: FULLSCREEN_STYLE,
    fillsCanvas: true,
  },

  // -- Time & Date --
  {
    type: 'clock',
    label: 'Clock',
    icon: Clock,
    category: 'Time & Date',
    defaultConfig: {
      view: 'classic',
      format24h: false,
      showSeconds: true,
      showDate: true,
      dateFormat: 'EEEE, MMMM d',
      showWeekNumber: false,
      showDayOfYear: false,
      showNumerals: false,
      animateFlip: true,
      accentColor: '#22d3ee',
      worldZones: [],
      referenceTime: '',
      referenceLabel: '',
      countUp: true,
    },
    defaultSize: { w: 400, h: 200 },
  },
  {
    type: 'calendar',
    label: 'Calendar',
    icon: CalendarDays,
    category: 'Time & Date',
    defaultConfig: {
      viewMode: 'daily',
      daysToShow: 3,
      showTime: true,
      showLocation: false,
      maxEvents: 20,
      showWeekNumbers: false,
      accentColor: '#3b82f6',
      dailyShowDescription: false,
      agendaShowDescription: false,
    },
    defaultSize: { w: 500, h: 600 },
  },
  {
    type: 'countdown',
    label: 'Countdown',
    icon: Hourglass,
    category: 'Time & Date',
    defaultConfig: {
      events: [],
      showPastEvents: false,
      scale: 1,
      view: 'all',
    },
    defaultSize: { w: 500, h: 500 },
  },
  {
    type: 'date',
    label: 'Date',
    icon: Calendar,
    category: 'Time & Date',
    defaultConfig: {
      view: 'full',
      dateFormat: 'MMMM d',
      showDayName: true,
      showYear: false,
      showWeekNumber: false,
      showDayOfYear: false,
      accentColor: '#22d3ee',
    },
    defaultSize: { w: 400, h: 200 },
  },
  {
    type: 'year-progress',
    label: 'Year Progress',
    icon: BarChart3,
    category: 'Time & Date',
    defaultConfig: {
      showYear: true,
      showMonth: true,
      showWeek: true,
      showDay: true,
      showPercentage: true,
      accentColor: '#000000',
    },
    defaultSize: { w: 400, h: 300 },
  },
  {
    type: 'multi-month',
    label: 'Multi-Month Calendar',
    icon: CalendarRange,
    category: 'Time & Date',
    defaultConfig: {
      view: 'vertical',
      monthCount: 3,
      startDay: 'sunday',
      showWeekNumbers: false,
      highlightWeekends: true,
      showAdjacentDays: true,
    },
    defaultSize: { w: 400, h: 700 },
    defaultStyle: { fontSize: 26 },
  },

  // -- Weather & Environment --
  {
    type: 'weather',
    label: 'Weather',
    icon: CloudSun,
    category: 'Weather & Environment',
    defaultConfig: {
      view: 'hourly',
      iconSet: 'color',
      provider: 'global',
      hoursToShow: 8,
      showFeelsLike: true,
      daysToShow: 5,
      showHighLow: true,
      showPrecipitation: true,
      showPrecipAmount: false,
      showHumidity: false,
      showWind: false,
      hideWhenNoAlerts: false,
    },
    defaultSize: { w: 600, h: 300 },
  },
  {
    type: 'moon-phase',
    label: 'Moon Phase',
    icon: Moon,
    category: 'Weather & Environment',
    defaultConfig: {
      showIllumination: true,
      showMoonTimes: true,
    },
    defaultSize: { w: 300, h: 350 },
    dataRequirements: ['location'],
  },
  {
    type: 'sunrise-sunset',
    label: 'Sunrise / Sunset',
    icon: Sunrise,
    category: 'Weather & Environment',
    defaultConfig: {
      view: 'default',
      showDayLength: true,
      showGoldenHour: false,
    },
    defaultSize: { w: 400, h: 200 },
    dataRequirements: ['location'],
  },
  {
    type: 'air-quality',
    label: 'Air Quality',
    icon: Wind,
    category: 'Weather & Environment',
    defaultConfig: {
      showAQI: true,
      showPollutants: false,
      refreshIntervalMs: 900000,
    },
    defaultSize: { w: 350, h: 250 },
  },
  {
    type: 'rain-map',
    label: 'Rain Map',
    icon: CloudRain,
    category: 'Weather & Environment',
    defaultConfig: {
      latitude: 0,
      longitude: 0,
      zoom: 6,
      animationSpeedMs: 500,
      extraDelayLastFrameMs: 2000,
      colorScheme: 2,
      smooth: true,
      showSnow: true,
      opacity: 0.7,
      showTimestamp: true,
      showTimeline: true,
      refreshIntervalMs: 600000,
      mapStyle: 'dark',
    },
    defaultSize: { w: 500, h: 500 },
    dataRequirements: ['location'],
  },

  // -- News & Finance --
  {
    type: 'news',
    label: 'News Headlines',
    icon: Newspaper,
    category: 'News & Finance',
    defaultConfig: {
      feedUrl: '',
      view: 'headline',
      refreshIntervalMs: 300000,
      rotateIntervalMs: 10000,
      maxItems: 10,
      showTimestamp: false,
      showDescription: false,
      tickerSpeed: 5,
      accentColor: undefined,
    },
    defaultSize: { w: 500, h: 400 },
  },
  {
    type: 'stock-ticker',
    label: 'Stock Ticker',
    icon: TrendingUp,
    category: 'News & Finance',
    defaultConfig: {
      symbols: 'AAPL,GOOGL,MSFT',
      refreshIntervalMs: 60000,
      view: 'cards',
      tickerSpeed: 5,
    },
    defaultSize: { w: 400, h: 300 },
  },
  {
    type: 'crypto',
    label: 'Crypto Price',
    icon: Bitcoin,
    category: 'News & Finance',
    defaultConfig: {
      ids: 'bitcoin,ethereum',
      refreshIntervalMs: 60000,
      view: 'cards',
      tickerSpeed: 5,
    },
    defaultSize: { w: 400, h: 250 },
  },
  {
    type: 'sports',
    label: 'Sports Scores',
    icon: Trophy,
    category: 'News & Finance',
    defaultConfig: {
      view: 'scoreboard',
      leagues: ['nba', 'nfl'],
      refreshIntervalMs: 60000,
    },
    defaultSize: { w: 500, h: 300 },
  },
  {
    type: 'standings',
    label: 'Sports Standings',
    icon: Medal,
    category: 'News & Finance',
    defaultConfig: {
      view: 'table',
      league: 'nba',
      grouping: 'conference',
      teamsToShow: 0,
      showPlayoffLine: true,
      rotationIntervalMs: 10000,
      refreshIntervalMs: 300000,
    },
    defaultSize: { w: 500, h: 500 },
  },

  // -- Knowledge & Fun --
  {
    type: 'dad-joke',
    label: 'Dad Joke',
    icon: Laugh,
    category: 'Knowledge & Fun',
    defaultConfig: {
      refreshIntervalMs: 60000,
      accentColor: '#000000',
      showDividers: true,
    },
    defaultSize: { w: 500, h: 200 },
  },
  {
    type: 'quote',
    label: 'Quote of the Day',
    icon: Quote,
    category: 'Knowledge & Fun',
    defaultConfig: {
      refreshIntervalMs: 300000,
      accentColor: '#000000',
    },
    defaultSize: { w: 500, h: 200 },
  },
  {
    type: 'word-of-day',
    label: 'Word of the Day',
    icon: BookOpen,
    category: 'Knowledge & Fun',
    defaultConfig: {
      accentColor: '#000000',
      showDividers: true,
    },
    defaultSize: { w: 450, h: 200 },
  },
  {
    type: 'history',
    label: 'This Day in History',
    icon: History,
    category: 'Knowledge & Fun',
    defaultConfig: {
      refreshIntervalMs: 3600000,
      rotationIntervalMs: 10000,
      accentColor: '#000000',
      showDividers: true,
    },
    defaultSize: { w: 500, h: 200 },
  },

  // -- Personal --
  {
    type: 'todo',
    label: 'To-Do List',
    icon: ListTodo,
    category: 'Personal',
    defaultConfig: {
      title: 'To Do',
      items: [],
      accentColor: '#000000',
      interactive: false,
    },
    defaultSize: { w: 350, h: 400 },
  },
  {
    type: 'sticky-note',
    label: 'Sticky Note',
    icon: StickyNote,
    category: 'Personal',
    defaultConfig: {
      content: 'Write something here...',
      noteColor: '#fef08a',
    },
    defaultSize: { w: 300, h: 250 },
  },
  {
    type: 'greeting',
    label: 'Greeting',
    icon: HandMetal,
    category: 'Personal',
    defaultConfig: {
      name: 'Friend',
      accentColor: '#000000',
    },
    defaultSize: { w: 500, h: 150 },
  },
  {
    type: 'todoist',
    label: 'Todoist',
    icon: ListChecks,
    category: 'Personal',
    defaultConfig: {
      viewMode: 'list',
      groupBy: 'date',
      sortBy: 'default',
      projectFilter: '',
      labelFilter: '',
      showNoDueDate: true,
      showSubtasks: true,
      showLabels: true,
      showProject: true,
      showDescription: false,
      maxTasks: 30,
      refreshIntervalMs: 300000,
      title: 'Todoist',
    },
    defaultSize: { w: 400, h: 550 },
  },
  {
    type: 'garbage-day',
    label: 'Garbage Day',
    icon: Trash2,
    category: 'Personal',
    defaultConfig: {
      trashDay: 1,       // Monday
      trashFrequency: 'weekly',
      trashStartDate: '',
      trashColor: '#6ee7b7',
      recyclingDay: 1,
      recyclingFrequency: 'weekly',
      recyclingStartDate: '',
      recyclingColor: '#93c5fd',
      customDay: -1,     // disabled
      customFrequency: 'weekly',
      customStartDate: '',
      customColor: '#fbbf24',
      customLabel: 'Yard Waste',
      highlightMode: 'day-before',
    },
    defaultSize: { w: 350, h: 320 },
  },
  {
    type: 'affirmations',
    label: 'Affirmations',
    icon: Sparkles,
    category: 'Personal',
    defaultConfig: {
      view: 'elegant',
      categories: ['affirmations', 'compliments', 'motivational'],
      rotationIntervalMs: 15000,
      showCategoryLabel: false,
      timeAware: true,
      customEntries: [],
      accentColor: '#a78bfa',
    },
    defaultSize: { w: 500, h: 200 },
    dataRequirements: ['location'],
  },
  {
    type: 'meal-planner',
    label: 'Meal Planner',
    icon: UtensilsCrossed,
    category: 'Personal',
    defaultConfig: {
      view: 'week',
      showEmoji: true,
      showPrepTime: true,
      showTags: true,
      accentColor: DEFAULT_ACCENT_COLOR,
    },
    defaultSize: { w: 500, h: 600 },
  },
  {
    type: 'chore-chart',
    label: 'Chore Chart',
    icon: ClipboardList,
    category: 'Personal',
    defaultConfig: {
      view: 'board',
      weekStartDay: 'monday',
      showPoints: true,
      showStreaks: true,
      showTimeOfDay: true,
      allowDisplayComplete: true,
      accentColor: DEFAULT_ACCENT_COLOR,
    },
    defaultSize: { w: 500, h: 650 },
    defaultStyle: { fontSize: 24 },
  },

  // -- Media & Display --
  {
    type: 'text',
    label: 'Text',
    icon: Type,
    category: 'Media & Display',
    defaultConfig: {
      content: 'Hello, World!',
      alignment: 'center',
      orientation: 'horizontal',
      verticalAlign: 'center',
      effect: 'none',
      textTransform: 'none',
      letterSpacing: 0,
      gradientFrom: '#a78bfa',
      gradientTo: '#22d3ee',
      gradientAngle: 90,
    },
    defaultSize: { w: 400, h: 150 },
  },
  {
    type: 'image',
    label: 'Image',
    icon: ImageIcon,
    category: 'Media & Display',
    defaultConfig: {
      src: '',
      objectFit: 'cover',
      alt: '',
    },
    defaultSize: { w: 400, h: 300 },
  },
  {
    type: 'photo-slideshow',
    label: 'Photo Slideshow',
    icon: Image,
    category: 'Media & Display',
    defaultConfig: {
      source: 'local',
      directory: '',
      intervalMs: 30000,
      transition: 'fade',
      objectFit: 'cover',
      refreshIntervalMs: 600000,
    },
    defaultSize: { w: 500, h: 400 },
  },
  {
    type: 'qr-code',
    label: 'QR Code',
    icon: QrCode,
    category: 'Media & Display',
    defaultConfig: {
      mode: 'custom',
      data: '',
      label: '',
      ssid: '',
      password: '',
      authType: 'WPA',
      hiddenNetwork: false,
      showPassword: true,
      showNetworkName: true,
      fgColor: '#ffffff',
      bgColor: 'transparent',
    },
    defaultSize: { w: 300, h: 350 },
  },
  {
    type: 'iframe',
    label: 'Web Embed',
    icon: Globe,
    category: 'Media & Display',
    defaultConfig: {
      url: '',
      refreshIntervalMs: 0,
      scrollable: false,
      sandboxEnabled: false,
      sandbox: 'allow-scripts allow-forms allow-popups',
      title: '',
    },
    defaultSize: { w: 500, h: 400 },
    defaultStyle: { padding: 0 },
  },
  {
    type: 'icon',
    label: 'Icon',
    icon: Star,
    category: 'Media & Display',
    // `style: 'solid'` + `iconName: 'star'` is guaranteed to render against
    // fa-solid-900.woff2. Do not change `style` to 'regular' here without
    // first confirming the chosen icon ships in fa-regular-400.woff2 — a
    // mismatched style/icon combo renders the codepoint as fallback text.
    defaultConfig: {
      iconName: 'star',
      style: 'solid',
      color: '#fbbf24',
      iconBackground: 'transparent',
      rotation: 0,
      flip: 'none',
      animation: 'none',
      animationDuration: 2,
      scale: 0.7,
      autoFit: true,
    },
    defaultSize: { w: 240, h: 240 },
    defaultStyle: { padding: 12, backgroundColor: 'transparent', backdropBlur: 0, borderWidth: 0, shadowSize: 0 },
  },
  {
    type: 'shape',
    label: 'Shape & Divider',
    icon: Shapes,
    category: 'Media & Display',
    defaultConfig: {
      view: 'divider',

      fillMode: 'solid',
      color: '#ffffff',
      gradientFrom: '#a78bfa',
      gradientTo: '#22d3ee',
      gradientAngle: 90,

      orientation: 'horizontal',
      thickness: 2,
      lineStyle: 'solid',
      endStyle: 'fade',
      waveAmplitude: 18,
      waveFrequency: 4,
      dotCount: 5,
      dotSize: 4,
      doubleLineGap: 6,

      outline: false,
      strokeWidth: 2,
      cornerRadius: 12,
      sides: 6,
      starPoints: 5,
      starInnerRatio: 0.4,
      rotation: 0,
      arrowDirection: 'right',
      arrowHeadRatio: 0.35,

      softness: 0.55,
      intensity: 0.55,
      gridPattern: 'dots',
      gridSpacing: 24,
      gridDotSize: 2,

      frameStyle: 'rectangle',
      bracketLength: 25,
    },
    // 400×80 gives a comfortable 80px grab target on the editor canvas (the
    // grid is 20px; anything smaller than 2-3 cells is hard to drop accurately
    // and hard to drag once placed). The divider line renders thin at
    // `thickness: 2` inside the box — matches how Notion-style HRs work
    // (generous hit area, thin visible glyph).
    defaultSize: { w: 400, h: 80 },
    defaultStyle: { padding: 0, backgroundColor: 'transparent', backdropBlur: 0, borderWidth: 0, shadowSize: 0 },
  },
  {
    type: 'display-control',
    label: 'Display Control',
    icon: LayoutGrid,
    category: 'Media & Display',
    defaultConfig: {
      layout: 'panel',
      defaultTarget: 'self',
      allowRetargeting: true,
    },
    defaultSize: { w: 680, h: 320 },
  },

  // -- Travel --
  {
    type: 'traffic',
    label: 'Traffic / Commute',
    icon: Car,
    category: 'Travel',
    defaultConfig: {
      routes: [],
      refreshIntervalMs: 300000,
    },
    defaultSize: { w: 450, h: 300 },
  },
];

MODULE_DEFINITIONS.forEach(registerModule);

