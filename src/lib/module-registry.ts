import type { ModuleType } from '@/types/config';
import type { LucideIcon } from 'lucide-react';
import {
  Clock, CalendarDays, CloudSun, Hourglass, Laugh, Type, ImageIcon,
  Quote, ListTodo, StickyNote, HandMetal,
  Newspaper, TrendingUp, Bitcoin, BookOpen, History,
  Moon, Sunrise, Image, QrCode, BarChart3, Car, Trophy, Wind,
  ListChecks, CloudRain, CalendarRange, Trash2, Medal, Sparkles,
  Calendar, Globe, UtensilsCrossed, ClipboardList, Columns3,
} from 'lucide-react';
import { DEFAULT_MODULE_SIZES } from './constants';
import { resolveLucideIcon } from './lucide-resolver';

type ModuleCategory =
  | 'Time & Date'
  | 'Weather & Environment'
  | 'News & Finance'
  | 'Knowledge & Fun'
  | 'Personal'
  | 'Media & Display'
  | 'Travel';

export const MODULE_CATEGORIES: ModuleCategory[] = [
  'Time & Date',
  'Weather & Environment',
  'News & Finance',
  'Knowledge & Fun',
  'Personal',
  'Media & Display',
  'Travel',
];

export interface ModuleDefinition {
  type: ModuleType;
  label: string;
  icon: LucideIcon;
  category: ModuleCategory | string; // built-in or custom plugin category
  defaultConfig: Record<string, unknown>;
  defaultSize: { w: number; h: number };
  defaultStyle?: Partial<import('@/types/config').ModuleStyle>;
  // Plugin-specific fields
  configSchema?: import('@/types/plugins').PluginConfigSchema;
  dataRequirements?: import('@/types/plugins').PluginDataRequirement[];
}

const registry = new Map<ModuleType, ModuleDefinition>();

function registerModule(definition: ModuleDefinition): void {
  registry.set(definition.type, definition);
}

/** Register a plugin module from its manifest. Resolves icon string → component via lucide-resolver. */
export function registerPluginModule(manifest: import('@/types/plugins').PluginManifest): void {
  const moduleType: ModuleType = `plugin:${manifest.moduleType}`;
  const icon = resolveLucideIcon(manifest.icon);
  registry.set(moduleType, {
    type: moduleType,
    label: manifest.name,
    icon,
    category: manifest.category,
    defaultConfig: manifest.defaultConfig ?? {},
    defaultSize: manifest.defaultSize ?? { w: 400, h: 300 },
    defaultStyle: manifest.defaultStyle,
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

// Register all modules
registerModule({
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
  defaultSize: DEFAULT_MODULE_SIZES.clock,
});

registerModule({
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
  },
  defaultSize: DEFAULT_MODULE_SIZES.calendar,
});

registerModule({
  type: 'fullscreen-calendar',
  label: 'Full-Screen Calendar',
  icon: Columns3,
  category: 'Time & Date',
  defaultConfig: {
    view: 'schedule',
    density: 'cozy',
    typographySize: 'medium',
    accentColor: '#EA580C',
    dimPastEvents: true,
    shadeWeekends: true,
    showWeather: true,
    showNowLine: true,
    darkMode: false,
    scheduleDaysToShow: 0,
    scheduleHourStart: 6,
    scheduleHourEnd: 22,
    weekCollapsePastDays: true,
    monthShowWeekNumbers: false,
    monthMaxEventsPerCell: 0,
    dayHourStart: 6,
    dayHourEnd: 22,
    dayShowLocation: true,
    agendaDaysAhead: 14,
    agendaHideEmptyDays: false,
  },
  defaultSize: DEFAULT_MODULE_SIZES['fullscreen-calendar'],
  defaultStyle: { padding: 0, borderRadius: 0, backdropBlur: 0, backgroundColor: 'transparent', borderWidth: 0, shadowSize: 0 },
  dataRequirements: ['calendar', 'weather'],
});

registerModule({
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
  defaultSize: DEFAULT_MODULE_SIZES['multi-month'],
  defaultStyle: { fontSize: 26 },
});

registerModule({
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
  defaultSize: DEFAULT_MODULE_SIZES.weather,
});


registerModule({
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
  defaultSize: DEFAULT_MODULE_SIZES.countdown,
});

registerModule({
  type: 'dad-joke',
  label: 'Dad Joke',
  icon: Laugh,
  category: 'Knowledge & Fun',
  defaultConfig: {
    refreshIntervalMs: 60000,
  },
  defaultSize: DEFAULT_MODULE_SIZES['dad-joke'],
});

registerModule({
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
  defaultSize: DEFAULT_MODULE_SIZES.text,
});

registerModule({
  type: 'image',
  label: 'Image',
  icon: ImageIcon,
  category: 'Media & Display',
  defaultConfig: {
    src: '',
    objectFit: 'cover',
    alt: '',
  },
  defaultSize: DEFAULT_MODULE_SIZES.image,
});

registerModule({
  type: 'quote',
  label: 'Quote of the Day',
  icon: Quote,
  category: 'Knowledge & Fun',
  defaultConfig: {
    refreshIntervalMs: 300000,
  },
  defaultSize: DEFAULT_MODULE_SIZES.quote,
});

registerModule({
  type: 'todo',
  label: 'To-Do List',
  icon: ListTodo,
  category: 'Personal',
  defaultConfig: {
    title: 'To Do',
    items: [],
  },
  defaultSize: DEFAULT_MODULE_SIZES.todo,
});

registerModule({
  type: 'sticky-note',
  label: 'Sticky Note',
  icon: StickyNote,
  category: 'Personal',
  defaultConfig: {
    content: 'Write something here...',
    noteColor: '#fef08a',
  },
  defaultSize: DEFAULT_MODULE_SIZES['sticky-note'],
});

registerModule({
  type: 'greeting',
  label: 'Greeting',
  icon: HandMetal,
  category: 'Personal',
  defaultConfig: {
    name: 'Friend',
  },
  defaultSize: DEFAULT_MODULE_SIZES.greeting,
});

registerModule({
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
  },
  defaultSize: DEFAULT_MODULE_SIZES.news,
});

registerModule({
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
  defaultSize: DEFAULT_MODULE_SIZES['stock-ticker'],
});

registerModule({
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
  defaultSize: DEFAULT_MODULE_SIZES.crypto,
});

registerModule({
  type: 'word-of-day',
  label: 'Word of the Day',
  icon: BookOpen,
  category: 'Knowledge & Fun',
  defaultConfig: {},
  defaultSize: DEFAULT_MODULE_SIZES['word-of-day'],
});

registerModule({
  type: 'history',
  label: 'This Day in History',
  icon: History,
  category: 'Knowledge & Fun',
  defaultConfig: {
    refreshIntervalMs: 3600000,
    rotationIntervalMs: 10000,
  },
  defaultSize: DEFAULT_MODULE_SIZES.history,
});

registerModule({
  type: 'moon-phase',
  label: 'Moon Phase',
  icon: Moon,
  category: 'Weather & Environment',
  defaultConfig: {
    showIllumination: true,
    showMoonTimes: true,
  },
  defaultSize: DEFAULT_MODULE_SIZES['moon-phase'],
  dataRequirements: ['location'],
});

registerModule({
  type: 'sunrise-sunset',
  label: 'Sunrise / Sunset',
  icon: Sunrise,
  category: 'Weather & Environment',
  defaultConfig: {
    view: 'default',
    showDayLength: true,
    showGoldenHour: false,
  },
  defaultSize: DEFAULT_MODULE_SIZES['sunrise-sunset'],
  dataRequirements: ['location'],
});

registerModule({
  type: 'photo-slideshow',
  label: 'Photo Slideshow',
  icon: Image,
  category: 'Media & Display',
  defaultConfig: {
    directory: '',
    intervalMs: 30000,
    transition: 'fade',
    objectFit: 'cover',
    refreshIntervalMs: 600000,
  },
  defaultSize: DEFAULT_MODULE_SIZES['photo-slideshow'],
});

registerModule({
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
  defaultSize: DEFAULT_MODULE_SIZES['qr-code'],
});

registerModule({
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
  },
  defaultSize: DEFAULT_MODULE_SIZES['year-progress'],
});

registerModule({
  type: 'traffic',
  label: 'Traffic / Commute',
  icon: Car,
  category: 'Travel',
  defaultConfig: {
    routes: [],
    refreshIntervalMs: 300000,
  },
  defaultSize: DEFAULT_MODULE_SIZES.traffic,
});

registerModule({
  type: 'sports',
  label: 'Sports Scores',
  icon: Trophy,
  category: 'News & Finance',
  defaultConfig: {
    view: 'scoreboard',
    leagues: ['nba', 'nfl'],
    refreshIntervalMs: 60000,
  },
  defaultSize: DEFAULT_MODULE_SIZES.sports,
});

registerModule({
  type: 'air-quality',
  label: 'Air Quality',
  icon: Wind,
  category: 'Weather & Environment',
  defaultConfig: {
    showAQI: true,
    showPollutants: false,
    refreshIntervalMs: 900000,
  },
  defaultSize: DEFAULT_MODULE_SIZES['air-quality'],
});

registerModule({
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
  defaultSize: DEFAULT_MODULE_SIZES.todoist,
});

registerModule({
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
  defaultSize: DEFAULT_MODULE_SIZES['rain-map'],
  dataRequirements: ['location'],
});

registerModule({
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
  defaultSize: DEFAULT_MODULE_SIZES['garbage-day'],
});

registerModule({
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
  defaultSize: DEFAULT_MODULE_SIZES.standings,
});

registerModule({
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
  defaultSize: DEFAULT_MODULE_SIZES.affirmations,
  dataRequirements: ['location'],
});

registerModule({
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
  defaultSize: DEFAULT_MODULE_SIZES.date,
});

registerModule({
  type: 'meal-planner',
  label: 'Meal Planner',
  icon: UtensilsCrossed,
  category: 'Personal',
  defaultConfig: {
    view: 'week',
    savedMeals: [],
    plan: [],
    slots: ['breakfast', 'lunch', 'dinner'],
    weekStartDay: 'monday',
    showEmoji: true,
    showPrepTime: true,
    showTags: true,
    accentColor: '#f59e0b',
  },
  defaultSize: DEFAULT_MODULE_SIZES['meal-planner'],
});

registerModule({
  type: 'chore-chart',
  label: 'Chore Chart',
  icon: ClipboardList,
  category: 'Personal',
  defaultConfig: {
    view: 'board',
    members: [],
    chores: [],
    weekStartDay: 'monday',
    showPoints: true,
    showStreaks: true,
    showTimeOfDay: true,
    allowDisplayComplete: true,
    accentColor: '#f59e0b',
  },
  defaultSize: DEFAULT_MODULE_SIZES['chore-chart'],
  defaultStyle: { fontSize: 24 },
});

registerModule({
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
  defaultSize: DEFAULT_MODULE_SIZES.iframe,
  defaultStyle: { padding: 0 },
});

