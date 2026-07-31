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

// Fallback for settings.calendar.daysAhead. The calendar API route and the
// client-side fetch-window computation (getCalendarFetchWindow callers) must
// agree on this value: clients omit timeMax from the URL whenever the default
// window already covers their grids, assuming the server fills in the same
// default.
export const DEFAULT_CALENDAR_DAYS_AHEAD = 7;

// How often the editor polls GET /api/display/shared-state while a condition
// panel is open. That poll doubles as the "an editor is watching" signal, so
// the hub's interest TTL below is derived from it rather than restated: the
// two live in different files (a client hook and the server command store) and
// drifted apart would silently degrade live shared-state values to the 30s
// heartbeat with nothing erroring.
export const SHARED_STATE_POLL_MS = 5_000;

// Interest expires after three poll intervals, i.e. it survives two missed
// polls. Derived, so raising the poll cadence cannot strand the flag.
export const SHARED_STATE_INTEREST_TTL_MS = 3 * SHARED_STATE_POLL_MS;


// Grid snap size (in display pixels)
export const GRID_SIZE = 20;

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

// Default module sizes live on each entry in the module registry
// (`src/lib/module-registry.ts`) — call `getModuleDefinition(type).defaultSize`.
// Moved out of this file so there's one source of truth per module, and so
// plugin-registered modules participate in the same lookup without an extra
// carve-out.

// Semantic text opacity tiers for consistent visual hierarchy across modules.
// 5-tier system: primary → heading → secondary → dim → tertiary
//   primary   (1.0)  — main content, large values, active elements
//   heading   (0.8)  — section headings (restrained, not harsh white)
//   secondary (0.6)  — labels, day names, descriptions
//   dim       (0.45) — supplementary data (low temps, feels-like, percentages)
//   tertiary  (0.35) — muted metadata, timestamps, decorative text
export const TEXT_OPACITY = {
  primary: 1,
  heading: 0.8,
  secondary: 0.6,
  dim: 0.45,
  tertiary: 0.35,
} as const;

// Divider/separator color tiers for consistent structural elements across modules.
//   subtle  (0.05) — faint list grouping, barely-there separators
//   default (0.08) — standard dividers and borders
//   visible (0.10) — section separators within modules
//   strong  (0.15) — emphasized borders, prominent separators
export const DIVIDER = {
  subtle: 'rgba(255,255,255,0.05)',
  default: 'rgba(255,255,255,0.08)',
  visible: 'rgba(255,255,255,0.10)',
  strong: 'rgba(255,255,255,0.15)',
} as const;

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
