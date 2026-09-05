import type { ModuleType } from '@/types/config';
import type { LucideIcon } from 'lucide-react';
import {
  Clock, CalendarDays, CloudSun, Hourglass, Laugh, Type, ImageIcon,
  Quote, ListTodo, StickyNote, HandMetal,
  Newspaper, TrendingUp, Bitcoin, BookOpen, History,
  Moon, Sunrise, Image, QrCode, BarChart3, Car, Trophy, Wind,
  ListChecks, CloudRain, CalendarRange, Trash2, Medal, Sparkles, CloudSunRain,
  Calendar, Globe, UtensilsCrossed, ClipboardList, Columns3, LayoutGrid,
  Star, Shapes, Video,
} from 'lucide-react';
import { DEFAULT_ACCENT_COLOR } from './meal-constants';
import { FETCH_KEY_REGISTRY } from './fetch-keys';
import { resolveLucideIcon } from './lucide-resolver';
import { pluginStateKey } from '@/lib/plugin-state-keys';
import { DEFAULT_CALENDAR_ACCENT } from '@/lib/calendar-color';
import type { ProvidedStateKey } from '@/lib/shared-state-types';
import type { TranslateFn } from '@/i18n/types';

type ModuleCategory =
  | 'Full Screen'
  | 'Time & Date'
  | 'Weather & Environment'
  | 'News & Finance'
  | 'Knowledge & Fun'
  | 'Personal'
  | 'Health & Fitness'
  | 'Media & Display'
  | 'Travel';

export const MODULE_CATEGORIES: ModuleCategory[] = [
  'Full Screen',
  'Time & Date',
  'Weather & Environment',
  'News & Finance',
  'Knowledge & Fun',
  'Personal',
  'Health & Fitness',
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
  'Health & Fitness': 'healthAndFitness',
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
   * True for modules that render bare, without ModuleWrapper's card chrome
   * (currently only display-control among builtins).
   *
   * A cardless module receives `style` and does nothing with it, so the whole
   * Style section is hidden in the editor and the card-only fields (the title
   * strip) are dropped from defaultStyle at placement — nothing could render
   * them. Plugins are bare too, but they are NOT cardless: they re-implement
   * the card from `style` themselves, so they keep the section.
   */
  cardless?: boolean;
  /**
   * True for modules that size their type off their measured box
   * (`useScaledFontSize` / `useFitFontSize`), where `Style > Font size` is a
   * bias on that measured size rather than the literal size. In every other
   * module it is the literal base size every `em` hangs off.
   *
   * The editor reads this to say which of the two the slider is doing. A
   * `meta` ratchet derives the true set from the import graph and fails when
   * this flag and the code disagree in either direction, so it cannot drift.
   */
  autoSizesText?: boolean;
  /**
   * Style fields this module paints from its own settings instead of from
   * `style`, so the matching Style controls are hidden in the editor and the
   * style E2E matrix does not probe them. The sticky note is the case: its
   * paper colour is its own Note colour setting and its ink is fixed dark for
   * that paper, so Style > Background and Style > Text color could never reach
   * it. Hiding them is the honest answer; honouring them would repaint every
   * existing note, which carries the never-painted white default (plan 50,
   * item 20).
   */
  ownsStyleFields?: ReadonlyArray<keyof import('@/types/config').ModuleStyle>;
  /**
   * True for modules that act on a specific display and therefore need to know
   * which display they are rendering as (`renderDisplayId`).
   *
   * Declared here rather than branched on by type in the renderer, so a new
   * module of this shape cannot be silently left out of the wiring.
   */
  rendersAsDisplay?: boolean;
  /**
   * True for modules that write back to their own instance in the config, or
   * that behave differently on a real display than in a preview. They receive
   * `displayId` / `screenId` / `moduleId`.
   *
   * The todo module needs the address to locate itself when POSTing a toggle;
   * the meal planners use its presence as the "on a real display" signal for
   * tap-to-open-recipe; the video module and the slideshows use it the same way
   * to autoplay only on a real display. The editor supplies none of it, which
   * is what makes the preview fall back to safe behaviour.
   */
  needsInstanceAddress?: boolean;
  /**
   * True for modules that render a built-in title of their own (a fixed
   * header like "Traffic", or a configurable one like todo's). The editor shows
   * a hint under Card Title so users know the two would stack, and points at
   * the module's Show Title toggle.
   */
  hasOwnTitle?: boolean;
  /**
   * Shared-state keys this module type publishes (see shared-state-store.ts).
   * Declaring either field marks the type as a state producer: the editor
   * offers the "run in background" toggle and lists these keys in the
   * visibility-condition picker. Runtime keys can't be enumerated statically,
   * so producers must advertise them here.
   */
  providesState?: ProvidedStateKey[];
  /**
   * One plain sentence saying what the module is for. Built-ins resolve
   * through the `editor.registry.descriptions.*` dictionary (see
   * `resolveModuleDescription`); this field carries a plugin's manifest
   * description, which the host cannot translate.
   */
  description?: string;
  /** For producers whose keys depend on instance config (e.g. an entity list). */
  deriveProvidedKeys?: (config: Record<string, unknown>) => ProvidedStateKey[];
  /**
   * True when the plugin exports a `stateProvider` (manifest `exports.stateProvider`):
   * the host mounts one instance per plugin, keyed on demand, independent of any
   * on-screen module instance. These `providesState` keys must stay discoverable
   * even with zero instances placed — see `collectStateProviderKeys`.
   */
  hasStateProvider?: boolean;
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
  /**
   * The module lists 'location' in `dataRequirements` but renders fine
   * without one (affirmations only reads the hemisphere for its season
   * words). Skips the editor's "this module needs your location" row and
   * the empty-state link; coordinates are still injected when known.
   */
  locationOptional?: boolean;
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
  runtime?: { deriveProvidedKeys?: ModuleDefinition['deriveProvidedKeys']; hasStateProvider?: boolean },
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
    description: manifest.description,
    providesState,
    deriveProvidedKeys,
    hasStateProvider: Boolean(runtime?.hasStateProvider),
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

/**
 * The user-facing name of a module type, the same everywhere it is shown
 * (palette, canvas, property panel, templates, search). Built-ins resolve
 * through the `editor.registry.types.*` dictionary; plugin modules keep their
 * manifest label verbatim (translated by the plugin author or intentionally
 * English). Anything unregistered (a plugin that failed to load) falls back
 * to the raw type so it is still identifiable.
 */
/**
 * Whether `Style` can reach a module at all: through ModuleWrapper's card, or
 * through the module applying `style` itself (plugins do). A `fillsCanvas`
 * module paints the whole canvas from its own theme and a `cardless` one
 * ignores the prop, so for both the answer is no and the editor hides the
 * section. The style E2E matrix takes its population from the same answer, so
 * "offered in the editor" and "proven to reach the module" are one predicate.
 */
export function styleReachesModule(def: Pick<ModuleDefinition, 'fillsCanvas' | 'cardless'> | undefined): boolean {
  return !def?.fillsCanvas && !def?.cardless;
}

export function resolveModuleLabel(type: ModuleType, t: TranslateFn): string {
  const def = registry.get(type);
  if (type.startsWith('plugin:')) return def?.label || type;
  return def ? t(`registry.types.${type}`) : type;
}

/**
 * One plain sentence saying what a module is for, shown under the module name
 * in the property panel and as the palette's hover tooltip. Built-ins resolve
 * through `editor.registry.descriptions.*`; plugins use their manifest
 * description verbatim (the host has no translations for it).
 */
export function resolveModuleDescription(type: ModuleType, t: TranslateFn): string {
  const def = registry.get(type);
  if (!def) return '';
  if (type.startsWith('plugin:')) return def.description ?? '';
  return t(`registry.descriptions.${type}`);
}

/**
 * Extra words the palette search matches on top of the name — the terms a
 * parent actually types ("trash", "picture", "birthday"). Never rendered.
 */
export function resolveModuleKeywords(type: ModuleType, t: TranslateFn): string {
  const def = registry.get(type);
  if (!def || type.startsWith('plugin:')) return '';
  return t(`registry.keywords.${type}`);
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

/**
 * A fresh news module follows one well-known feed. `addModule` swaps this for
 * the locale's own default preset (`defaultPresetForLocale`); it stands as the
 * en-US answer and as the fallback for configs seeded outside the editor.
 */
const DEFAULT_NEWS_FEED: import('@/types/config').NewsFeedSource = {
  id: 'default-bbc', url: 'https://feeds.bbci.co.uk/news/rss.xml', label: 'BBC News',
};

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
      // Empty = follow the theme's own accent (see FullscreenThemeTokens.accent).
      // A hex here would outrank every themed accent, since a set accentColor
      // is treated as a deliberate user choice.
      accentColor: '',
      dimPastEvents: true,
      shadeWeekends: true,
      weatherPlacement: 'header',
      showNowLine: true,
      todayHighlightStyle: 'full',
      eventOverlap: 'columns',
      wrapEventTitles: false,
      eventTapDetails: false,
      eventTapStyle: 'sheet',
      startDay: 'sunday',
      darkMode: false,
      showCountdown: false,
      showProgressBar: false,
      countdownAllDay: false,
      emptyDayText: '',
      hourWindow: 'fixed',
      rollingHours: 8,
      scheduleDaysToShow: 0,
      scheduleHourStart: 6,
      scheduleHourEnd: 22,
      scheduleShowDescription: false,
      scheduleStartAnchor: 'today',
      weekCollapsePastDays: true,
      weekShowDescription: false,
      showMeals: false,
      showChores: false,
      familyShowEveryoneRow: true,
      upNextLaterCount: 3,
      upNextShowEarlier: true,
      upNextShowTomorrow: true,
      freeTimeHourStart: 7,
      freeTimeHourEnd: 22,
      freeTimeShowTomorrow: true,
      monthShowWeekNumbers: false,
      monthMaxEventsPerCell: 0,
      dayHourStart: 6,
      dayHourEnd: 22,
      dayShowLocation: true,
      dayShowDescription: false,
      agendaDaysAhead: 14,
      agendaHideEmptyDays: false,
      agendaShowFinishedToday: false,
      agendaShowDescription: false,
      agendaSeparators: 'none',
      showLegend: 'off',
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
      weekProgress: 'chips',
      layout: 'by-time',
      showPoints: true,
      showStreaks: true,
      showTimeOfDay: true,
      allowDisplayComplete: true,
      darkMode: true,
      density: 'cozy',
      // Chore names are 30px on a 1080-wide panel at medium; the rows and
      // everything else on the board size themselves to the panel.
      typographySize: 'medium',
      // Empty = follow the theme's own accent (see FullscreenThemeTokens.accent).
      accentColor: '',
    },
    defaultSize: { w: 1080, h: 1920 },
    defaultStyle: FULLSCREEN_STYLE,
    fillsCanvas: true,
  },
  {
    type: 'fullscreen-meal-planner',
    needsInstanceAddress: true,
    label: 'Full-Screen Meal Planner',
    icon: UtensilsCrossed,
    category: 'Full Screen',
    defaultConfig: {
      view: 'week',
      density: 'cozy',
      typographySize: 'medium',
      // Empty = follow the theme's own accent (see FullscreenThemeTokens.accent).
      accentColor: '',
      showPrepTime: true,
      showTags: true,
      showEmoji: true,
      showDifficulty: false,
      tapRecipeAction: 'off',
      showTitle: true,
    },
    defaultSize: { w: 1080, h: 1920 },
    defaultStyle: FULLSCREEN_STYLE,
    fillsCanvas: true,
  },
  {
    type: 'fullscreen-weather',
    label: 'Full-Screen Weather',
    icon: CloudSunRain,
    category: 'Full Screen',
    defaultConfig: {
      view: 'panorama',
      density: 'snug',
      typographySize: 'medium',
      accentColor: '',
      skyLayer: 'auto',
      animateConditions: true,
      showNowcast: true,
      showAlerts: true,
      showTime: true,
      showRibbon: true,
      showStatRail: true,
      daysToShow: 7,
    },
    defaultSize: { w: 1080, h: 1920 },
    defaultStyle: FULLSCREEN_STYLE,
    fillsCanvas: true,
    // Gives the module hourly, forecast, minutely, alerts, units, locationName
    // and coordinates in one shot — see module-props.ts `needsWeather`.
    dataRequirements: ['weather'],
  },
  {
    type: 'fullscreen-photo',
    needsInstanceAddress: true,
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
      mediaTypes: 'photos',
      maxVideoDurationMs: 60_000,
    },
    defaultSize: { w: 1080, h: 1920 },
    defaultStyle: FULLSCREEN_STYLE,
    fillsCanvas: true,
  },
  {
    type: 'fullscreen-news',
    label: 'Full-Screen News',
    icon: Newspaper,
    category: 'Full Screen',
    defaultConfig: {
      feeds: [DEFAULT_NEWS_FEED],
      view: 'story',
      refreshIntervalMs: FETCH_KEY_REGISTRY['fullscreen-news']?.ttlMs ?? 300_000,
      rotateIntervalMs: 15000,
      maxItems: 12,
      showDescription: true,
      showSource: true,
      showTimestamp: true,
      showImages: true,
      showTime: true,
      typographySize: 'medium',
      accentColor: '',
      maxAgeHours: 0,
      blockedWords: '',
      requiredWords: '',
      preserveOrder: false,
      tapAction: 'qr',
    },
    defaultSize: { w: 1080, h: 1920 },
    defaultStyle: FULLSCREEN_STYLE,
    fillsCanvas: true,
  },

  // -- Time & Date --
  {
    type: 'clock',
    autoSizesText: true,
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
      elapsedFormat: 'units',
      elapsedPrecision: 'auto',
    },
    defaultSize: { w: 640, h: 280 },
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
      weeksToShow: 6,
      gridMaxEventsPerCell: 4,
      startDay: 'sunday',
      gridTheme: 'banner',
      accentColor: DEFAULT_CALENDAR_ACCENT,
      dailyShowDescription: false,
      agendaShowDescription: false,
      agendaShowFinishedToday: false,
      eventTapDetails: false,
      eventTapStyle: 'sheet',
      showCountdown: false,
      showProgressBar: false,
      emptyDayText: '',
      agendaSeparators: 'none',
      showLegend: 'off',
      dimPastEvents: false,
      showNowRule: false,
    },
    defaultSize: { w: 540, h: 340 },
  },
  {
    type: 'countdown',
    autoSizesText: true,
    label: 'Countdown',
    icon: Hourglass,
    category: 'Time & Date',
    defaultConfig: {
      events: [],
      showPastEvents: false,
      scale: 1,
      view: 'all',
      format: 'flip',
      precision: 'auto',
    },
    defaultSize: { w: 380, h: 360 },
  },
  {
    type: 'date',
    autoSizesText: true,
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
    defaultSize: { w: 380, h: 280 },
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
    autoSizesText: true,
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
      showCurrentMonthLabel: true,
      todayStyle: 'filled',
      accentColor: DEFAULT_CALENDAR_ACCENT,
      // New calendars fill their card. Existing ones have no such key, and
      // `fitToBox` reads as off there, so nothing already on a wall moves.
      fitToBox: true,
    },
    defaultSize: { w: 400, h: 700 },
    defaultStyle: { fontSize: 26 },
  },

  // -- Weather & Environment --
  {
    type: 'weather',
    autoSizesText: true,
    label: 'Weather',
    icon: CloudSun,
    category: 'Weather & Environment',
    hasOwnTitle: true,
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
      showLocation: false,
      showTitle: true,
    },
    defaultSize: { w: 640, h: 360 },
    // 'location' so the editor knows the module is location-bound (status
    // row, empty-state link) and coordinates ride the shared props.
    dataRequirements: ['weather', 'location'],
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
      showAstroDark: false,
      theme: 'simple',
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
      refreshIntervalMs: FETCH_KEY_REGISTRY['air-quality']?.ttlMs ?? 300_000,
    },
    defaultSize: { w: 350, h: 250 },
    dataRequirements: ['location'],
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
      refreshIntervalMs: FETCH_KEY_REGISTRY['rain-map']?.ttlMs ?? 600_000,
      mapStyle: 'dark',
    },
    defaultSize: { w: 500, h: 500 },
    dataRequirements: ['location'],
  },

  // -- News & Finance --
  {
    type: 'news',
    autoSizesText: true,
    label: 'News Headlines',
    icon: Newspaper,
    category: 'News & Finance',
    hasOwnTitle: true,
    defaultConfig: {
      feeds: [DEFAULT_NEWS_FEED],
      view: 'headline',
      refreshIntervalMs: FETCH_KEY_REGISTRY['news']?.ttlMs ?? 300_000,
      rotateIntervalMs: 10000,
      maxItems: 10,
      showTimestamp: false,
      showDescription: false,
      tickerSpeed: 5,
      accentColor: undefined,
      showTitle: true,
      showSource: true,
      showImages: true,
      descriptionLines: 2,
      singleLineTitles: false,
      showCounter: true,
      highlightBreaking: false,
      showNewMarker: false,
      cardColumns: 2,
      tickerSeparator: 'dot',
      maxAgeHours: 0,
      blockedWords: '',
      requiredWords: '',
      preserveOrder: false,
      tapAction: 'qr',
    },
    defaultSize: { w: 540, h: 420 },
  },
  {
    type: 'stock-ticker',
    label: 'Stock Ticker',
    icon: TrendingUp,
    category: 'News & Finance',
    defaultConfig: {
      symbols: 'AAPL,GOOGL,MSFT',
      refreshIntervalMs: FETCH_KEY_REGISTRY['stock-ticker']?.ttlMs ?? 30_000,
      view: 'cards',
      tickerSpeed: 5,
      showSparkline: true,
      sparklineMode: 'day',
      sparklineTheme: 'classic',
      sparklineLabels: false,
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
      refreshIntervalMs: FETCH_KEY_REGISTRY['crypto']?.ttlMs ?? 30_000,
      view: 'cards',
      tickerSpeed: 5,
      showSparkline: true,
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
      refreshIntervalMs: FETCH_KEY_REGISTRY['sports']?.ttlMs ?? 60_000,
    },
    defaultSize: { w: 480, h: 340 },
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
      refreshIntervalMs: FETCH_KEY_REGISTRY['standings']?.ttlMs ?? 300_000,
    },
    defaultSize: { w: 500, h: 500 },
  },

  // -- Knowledge & Fun --
  {
    type: 'dad-joke',
    autoSizesText: true,
    label: 'Dad Joke',
    icon: Laugh,
    category: 'Knowledge & Fun',
    defaultConfig: {
      refreshIntervalMs: FETCH_KEY_REGISTRY['dad-joke']?.ttlMs ?? 60_000,
      accentColor: '#000000',
      showDividers: true,
    },
    defaultSize: { w: 500, h: 200 },
  },
  {
    type: 'quote',
    autoSizesText: true,
    label: 'Quote of the Day',
    icon: Quote,
    category: 'Knowledge & Fun',
    defaultConfig: {
      refreshIntervalMs: FETCH_KEY_REGISTRY['quote']?.ttlMs ?? 3_600_000,
      accentColor: '#000000',
    },
    defaultSize: { w: 500, h: 200 },
  },
  {
    type: 'word-of-day',
    autoSizesText: true,
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
    autoSizesText: true,
    label: 'This Day in History',
    icon: History,
    category: 'Knowledge & Fun',
    hasOwnTitle: true,
    defaultConfig: {
      refreshIntervalMs: FETCH_KEY_REGISTRY['history']?.ttlMs ?? 3_600_000,
      rotationIntervalMs: 10000,
      accentColor: '#000000',
      showDividers: true,
      showTitle: true,
    },
    defaultSize: { w: 500, h: 200 },
  },

  // -- Personal --
  {
    type: 'todo',
    autoSizesText: true,
    needsInstanceAddress: true,
    label: 'To-Do List',
    icon: ListTodo,
    category: 'Personal',
    hasOwnTitle: true,
    defaultConfig: {
      title: 'To Do',
      showTitle: true,
      items: [],
      accentColor: '#000000',
      interactive: false,
    },
    defaultSize: { w: 440, h: 420 },
  },
  {
    type: 'sticky-note',
    autoSizesText: true,
    ownsStyleFields: ['textColor', 'backgroundColor'],
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
    autoSizesText: true,
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
    hasOwnTitle: true,
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
      refreshIntervalMs: FETCH_KEY_REGISTRY['todoist']?.ttlMs ?? 60_000,
      title: 'Todoist',
      showTitle: true,
    },
    defaultSize: { w: 440, h: 420 },
  },
  {
    type: 'garbage-day',
    label: 'Garbage Day',
    icon: Trash2,
    category: 'Personal',
    hasOwnTitle: true,
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
      showTitle: true,
    },
    defaultSize: { w: 350, h: 320 },
  },
  {
    type: 'affirmations',
    autoSizesText: true,
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
    locationOptional: true,
  },
  {
    type: 'meal-planner',
    needsInstanceAddress: true,
    label: 'Meal Planner',
    icon: UtensilsCrossed,
    category: 'Personal',
    hasOwnTitle: true,
    defaultConfig: {
      view: 'week',
      showEmoji: true,
      showPrepTime: true,
      showTags: true,
      accentColor: DEFAULT_ACCENT_COLOR,
      tapRecipeAction: 'off',
      showTitle: true,
    },
    defaultSize: { w: 500, h: 600 },
  },
  {
    type: 'chore-chart',
    label: 'Chore Chart',
    icon: ClipboardList,
    category: 'Personal',
    hasOwnTitle: true,
    defaultConfig: {
      view: 'board',
      weekStartDay: 'monday',
      showPoints: true,
      showStreaks: true,
      showTimeOfDay: true,
      allowDisplayComplete: true,
      accentColor: DEFAULT_ACCENT_COLOR,
      showTitle: true,
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
    defaultSize: { w: 540, h: 360 },
  },
  {
    type: 'video',
    needsInstanceAddress: true,
    label: 'Video',
    icon: Video,
    category: 'Media & Display',
    defaultConfig: {
      source: 'file',
      file: '',
      url: '',
      objectFit: 'cover',
      muted: true,
      loop: true,
    },
    defaultSize: { w: 540, h: 360 },
    defaultStyle: { padding: 0 },
  },
  {
    type: 'photo-slideshow',
    needsInstanceAddress: true,
    label: 'Photo Slideshow',
    icon: Image,
    category: 'Media & Display',
    defaultConfig: {
      source: 'local',
      directory: '',
      intervalMs: 30000,
      transition: 'fade',
      objectFit: 'cover',
      refreshIntervalMs: FETCH_KEY_REGISTRY['photo-slideshow']?.ttlMs ?? 600_000,
      mediaTypes: 'photos',
      maxVideoDurationMs: 60_000,
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
    defaultSize: { w: 540, h: 360 },
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
    rendersAsDisplay: true,
    label: 'Display Control',
    icon: LayoutGrid,
    category: 'Media & Display',
    cardless: true,
    defaultConfig: {
      layout: 'panel',
      defaultTarget: 'self',
      // Off by default: a kid tapping Sleep on the kitchen panel should only
      // sleep the kitchen panel. The editor turns the target row on.
      allowRetargeting: false,
      compact: false,
    },
    // Four word-and-icon buttons plus the brightness slider. The widget sizes
    // its type and spacing to whatever box it is given, so this is a
    // comfortable starting box rather than a floor.
    defaultSize: { w: 440, h: 320 },
  },

  // -- Travel --
  {
    type: 'traffic',
    label: 'Traffic / Commute',
    icon: Car,
    category: 'Travel',
    hasOwnTitle: true,
    defaultConfig: {
      routes: [],
      refreshIntervalMs: FETCH_KEY_REGISTRY['traffic']?.ttlMs ?? 300_000,
      showTitle: true,
    },
    defaultSize: { w: 450, h: 300 },
  },
];

MODULE_DEFINITIONS.forEach(registerModule);

