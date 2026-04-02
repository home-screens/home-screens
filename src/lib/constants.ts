// Default display dimensions (portrait 1080p)
export const DEFAULT_DISPLAY_WIDTH = 1080;
export const DEFAULT_DISPLAY_HEIGHT = 1920;

// Orientation-agnostic resolution presets.
// `short` is the smaller dimension, `long` is the larger.
// Portrait: width = short, height = long.  Landscape: width = long, height = short.
export const RESOLUTION_PRESETS = [
  { label: '720p HD', short: 720, long: 1280 },
  { label: '1080p Full HD', short: 1080, long: 1920 },
  { label: '1440p QHD', short: 1440, long: 2560 },
  { label: '4K UHD', short: 2160, long: 3840 },
] as const;

/** Derive the wlr-randr transform value from orientation + flip. */
export function deriveDisplayTransform(
  orientation: 'portrait' | 'landscape',
  flipped: boolean,
): 'normal' | '90' | '180' | '270' {
  if (orientation === 'portrait') return flipped ? '270' : '90';
  return flipped ? '180' : 'normal';
}

// Config file path
export const CONFIG_FILE_PATH = 'data/config.json';

// Backgrounds directory
export const BACKGROUNDS_DIR = 'public/backgrounds';

// Weather refresh interval (5 minutes)
export const WEATHER_REFRESH_MS = 5 * 60 * 1000;

// Calendar refresh interval (5 minutes)
export const CALENDAR_REFRESH_MS = 5 * 60 * 1000;


// Grid snap size (in display pixels)
export const GRID_SIZE = 20;

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

// Default module sizes
export const DEFAULT_MODULE_SIZES: Record<string, { w: number; h: number }> = {
  clock: { w: 400, h: 200 },
  calendar: { w: 500, h: 600 },
  weather: { w: 600, h: 300 },
  countdown: { w: 500, h: 500 },
  'dad-joke': { w: 500, h: 200 },
  text: { w: 400, h: 150 },
  image: { w: 400, h: 300 },
  quote: { w: 500, h: 200 },
  todo: { w: 350, h: 400 },
  'sticky-note': { w: 300, h: 250 },
  greeting: { w: 500, h: 150 },
  news: { w: 500, h: 400 },
  'stock-ticker': { w: 400, h: 300 },
  crypto: { w: 400, h: 250 },
  'word-of-day': { w: 450, h: 200 },
  history: { w: 500, h: 200 },
  'moon-phase': { w: 300, h: 350 },
  'sunrise-sunset': { w: 400, h: 200 },
  'photo-slideshow': { w: 500, h: 400 },
  'qr-code': { w: 300, h: 350 },
  'year-progress': { w: 400, h: 300 },
  traffic: { w: 450, h: 300 },
  sports: { w: 500, h: 300 },
  'air-quality': { w: 350, h: 250 },
  todoist: { w: 400, h: 550 },
  'rain-map': { w: 500, h: 500 },
  'multi-month': { w: 400, h: 700 },
  'garbage-day': { w: 350, h: 320 },
  standings: { w: 500, h: 500 },
  affirmations: { w: 500, h: 200 },
  date: { w: 400, h: 200 },
  'meal-planner': { w: 500, h: 600 },
  iframe: { w: 500, h: 400 },
  'chore-chart': { w: 500, h: 650 },
  'fullscreen-calendar': { w: 1080, h: 1920 },
  'fullscreen-chore-chart': { w: 1080, h: 1920 },
  'fullscreen-meal-planner': { w: 1080, h: 1920 },
  'fullscreen-photo': { w: 1080, h: 1920 },
};

// Semantic text opacity tiers for consistent visual hierarchy across modules
export const TEXT_OPACITY = {
  primary: 1,
  secondary: 0.6,
  tertiary: 0.35,
} as const;

// Standard divider color for consistent borders/separators across modules
export const DIVIDER_COLOR = 'rgba(255,255,255,0.08)';

/** Check whether a user-configured accent color is actually set (not the default black). */
export function hasAccentColor(color: string | undefined): color is string {
  return !!color && color !== '#000000';
}

/**
 * Resolve accent color from a module config, returning the color, whether it's
 * active, and a pre-built gradient background style for the common 135° pattern.
 */
export function resolveAccent(config: { accentColor?: string }): {
  accentColor: string;
  hasAccent: boolean;
  gradientStyle: React.CSSProperties;
} {
  const accentColor = config.accentColor ?? '#000000';
  const hasAccent = hasAccentColor(accentColor);
  const gradientStyle: React.CSSProperties = hasAccent
    ? { background: `linear-gradient(135deg, ${accentColor}15, ${accentColor}08)` }
    : {};
  return { accentColor, hasAccent, gradientStyle };
}
