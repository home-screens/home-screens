/**
 * Shared color theme system for all fullscreen modules.
 *
 * Each theme is built from a single Tailwind gray scale so the tones
 * are internally consistent. Modules keep their own accent color for
 * identity — these tokens cover only the structural palette.
 */

import type { FullscreenTypographySize } from '@/types/config';

/**
 * How a calendar event block is painted. Only the calendar reads this; the
 * other fullscreen modules have no events and ignore it.
 *
 * - `wash`   the original look: a faint tint of the source color behind a
 *            solid left bar. Every pre-existing theme keeps this.
 * - `glass`  a translucent, blurred card with a colored hairline and no bar.
 * - `solid`  a fully saturated fill with light text — the most legible
 *            treatment from across a room.
 * - `rule`   the theme surface with a colored edge and no tint at all, so a
 *            busy week stays quiet.
 */
export type FullscreenEventStyle = 'wash' | 'glass' | 'solid' | 'rule';

export interface FullscreenThemeTokens {
  bg: string;
  surface: string;
  surfaceHover: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderSubtle: string;
  headerBg: string;
  cardShadow: string;
  pastOpacity: number;
  isDark: boolean;

  // ── Optional atmosphere layer ────────────────
  // Everything below is optional: a theme that sets none of it renders
  // exactly as themes did before these tokens existed.

  /**
   * Static CSS background layers (gradients) painted over `bg`. Sizes are
   * percentages so one declaration holds up in portrait and landscape and
   * across every fullscreen module. Deliberately static — an animated
   * background would cost the Pi a repaint per frame, forever.
   */
  bgImage?: string;
  /**
   * The theme's own default accent. A user-set `accentColor` still wins, so
   * adding this to a theme never overrides a choice someone already made.
   */
  accent?: string;
  /** Text color on top of `accent` (and, for `solid` events, on the fill). */
  onAccent?: string;
  /** How event blocks are painted. Unset = `wash`, the original look. */
  eventStyle?: FullscreenEventStyle;
  /** Backdrop blur for frosted surfaces, e.g. `'18px'`. Header, all-day bar
   *  and list rows only — never the dozens of blocks in a time grid. */
  surfaceBlur?: string;
  /**
   * Alpha of the today-column wash. The shipped default (0.16 dark / 0.10
   * light) is a quarter-width slab down the whole board, which drowns any
   * atmosphere layer; themes with a `bgImage` set this far lower and let the
   * accent circle and now-line carry the day instead.
   */
  todayFill?: number;
}

export interface FullscreenTheme {
  id: string;
  name: string;
  group: 'light' | 'dark';
  tokens: FullscreenThemeTokens;
}

// ── Light Themes ──────────────────────────────

const LINEN: FullscreenTheme = {
  id: 'linen',
  name: 'Linen',
  group: 'light',
  tokens: {
    bg: '#f5f1ea',
    surface: '#fdfcf9',
    surfaceHover: '#ede8e0',
    surfaceAlt: '#ede8e0',
    text: '#1c1917',
    textSecondary: '#57534e',
    textMuted: '#a8a29e',
    border: '#ddd7cd',
    borderSubtle: '#ede8e0',
    headerBg: 'rgba(245,241,234,0.85)',
    cardShadow: '0 1px 4px rgba(0,0,0,0.06)',
    pastOpacity: 0.4,
    isDark: false,
  },
};

const PAPER: FullscreenTheme = {
  id: 'paper',
  name: 'Paper',
  group: 'light',
  tokens: {
    bg: '#fafafa',
    surface: '#ffffff',
    surfaceHover: '#f5f5f5',
    surfaceAlt: '#f5f5f5',
    text: '#171717',
    textSecondary: '#525252',
    textMuted: '#a3a3a3',
    border: '#e5e5e5',
    borderSubtle: '#f5f5f5',
    headerBg: 'rgba(250,250,250,0.85)',
    cardShadow: '0 1px 4px rgba(0,0,0,0.06)',
    pastOpacity: 0.4,
    isDark: false,
  },
};

const MIST: FullscreenTheme = {
  id: 'mist',
  name: 'Mist',
  group: 'light',
  tokens: {
    bg: '#eff4fb',
    surface: '#f8fafd',
    surfaceHover: '#e3eaf4',
    surfaceAlt: '#e3eaf4',
    text: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#94a3b8',
    border: '#d0d9e6',
    borderSubtle: '#e3eaf4',
    headerBg: 'rgba(239,244,251,0.85)',
    cardShadow: '0 1px 4px rgba(0,0,0,0.06)',
    pastOpacity: 0.4,
    isDark: false,
  },
};

// Sandstone and Bloom carry an atmosphere layer (a static gradient over
// `bg`); Vellum between them is flat on purpose, since a printed page has no
// glow. Gradient sizes are percentages of the module box, so the same
// declaration holds in portrait and landscape.

const SANDSTONE: FullscreenTheme = {
  id: 'sandstone',
  name: 'Sandstone',
  group: 'light',
  tokens: {
    bg: '#f4efe5',
    bgImage:
      'radial-gradient(102% 41% at 100% 0%, rgba(194,65,12,0.10), transparent 60%), '
      + 'radial-gradient(83% 36% at 0% 100%, rgba(180,140,90,0.16), transparent 62%)',
    surface: '#fffdf8',
    surfaceHover: '#f6f1e7',
    surfaceAlt: '#ece5d8',
    text: '#231b13',
    textSecondary: '#6b5b4a',
    textMuted: '#a3927e',
    border: '#dccfba',
    borderSubtle: '#ebe3d5',
    headerBg: 'rgba(244,239,229,0.86)',
    cardShadow: '0 1px 5px rgba(90,60,30,0.09)',
    pastOpacity: 0.4,
    isDark: false,
    accent: '#C2410C',
    onAccent: '#ffffff',
    eventStyle: 'solid',
    todayFill: 0.055,
  },
};

const VELLUM: FullscreenTheme = {
  id: 'vellum',
  name: 'Vellum',
  group: 'light',
  tokens: {
    bg: '#faf7f0',
    surface: '#ffffff',
    surfaceHover: '#f6f2e9',
    surfaceAlt: '#f3efe6',
    text: '#12100e',
    textSecondary: '#5c574f',
    textMuted: '#9b958a',
    // Near-ink structural rules are the point of this one: the board reads
    // like a printed page rather than a stack of cards.
    border: '#26221e',
    borderSubtle: '#ddd8cc',
    headerBg: 'rgba(250,247,240,0.90)',
    cardShadow: 'none',
    pastOpacity: 0.35,
    isDark: false,
    accent: '#B91C1C',
    onAccent: '#ffffff',
    eventStyle: 'rule',
    todayFill: 0.05,
  },
};

const BLOOM: FullscreenTheme = {
  id: 'bloom',
  name: 'Bloom',
  group: 'light',
  tokens: {
    bg: '#f6f4fc',
    bgImage:
      'radial-gradient(88% 36% at 0% 0%, rgba(124,92,214,0.20), transparent 58%), '
      + 'radial-gradient(83% 36% at 100% 96%, rgba(236,132,177,0.22), transparent 60%)',
    surface: 'rgba(255,255,255,0.72)',
    surfaceHover: 'rgba(255,255,255,0.88)',
    surfaceAlt: 'rgba(255,255,255,0.45)',
    text: '#1e1730',
    textSecondary: '#5c5375',
    textMuted: '#948caa',
    border: 'rgba(70,50,120,0.16)',
    borderSubtle: 'rgba(70,50,120,0.09)',
    headerBg: 'rgba(246,244,252,0.80)',
    cardShadow: '0 2px 10px rgba(70,50,120,0.10)',
    pastOpacity: 0.4,
    isDark: false,
    accent: '#7C5CD6',
    onAccent: '#ffffff',
    eventStyle: 'glass',
    surfaceBlur: '16px',
    todayFill: 0.055,
  },
};

// ── Dark Themes ───────────────────────────────

const CHARCOAL: FullscreenTheme = {
  id: 'charcoal',
  name: 'Charcoal',
  group: 'dark',
  tokens: {
    bg: '#1c1917',
    surface: '#292524',
    surfaceHover: '#2e2926',
    surfaceAlt: '#211f1d',
    text: '#fafaf9',
    textSecondary: '#a8a29e',
    textMuted: '#78716c',
    border: '#44403c',
    borderSubtle: '#292524',
    headerBg: 'rgba(28,25,23,0.80)',
    cardShadow: 'none',
    pastOpacity: 0.35,
    isDark: true,
  },
};

const MIDNIGHT: FullscreenTheme = {
  id: 'midnight',
  name: 'Midnight',
  group: 'dark',
  tokens: {
    bg: '#0a0a0a',
    surface: '#171717',
    surfaceHover: '#1f1f1f',
    surfaceAlt: '#141414',
    text: '#fafafa',
    textSecondary: '#a3a3a3',
    textMuted: '#525252',
    border: '#262626',
    borderSubtle: '#171717',
    headerBg: 'rgba(10,10,10,0.80)',
    cardShadow: 'none',
    pastOpacity: 0.35,
    isDark: true,
  },
};

const SLATE: FullscreenTheme = {
  id: 'slate',
  name: 'Slate',
  group: 'dark',
  tokens: {
    bg: '#0f172a',
    surface: '#1e293b',
    surfaceHover: '#243044',
    surfaceAlt: '#172034',
    text: '#f8fafc',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    border: '#334155',
    borderSubtle: '#1e293b',
    headerBg: 'rgba(15,23,42,0.80)',
    cardShadow: 'none',
    pastOpacity: 0.35,
    isDark: true,
  },
};

const AURORA: FullscreenTheme = {
  id: 'aurora',
  name: 'Aurora',
  group: 'dark',
  tokens: {
    bg: '#070b18',
    bgImage:
      'radial-gradient(102% 42% at 4% -8%, rgba(20,184,166,0.42), transparent 60%), '
      + 'radial-gradient(93% 40% at 108% 20%, rgba(124,58,237,0.44), transparent 58%), '
      + 'radial-gradient(116% 49% at 40% 114%, rgba(56,189,248,0.26), transparent 64%)',
    surface: 'rgba(255,255,255,0.055)',
    surfaceHover: 'rgba(255,255,255,0.09)',
    surfaceAlt: 'rgba(255,255,255,0.035)',
    text: '#f4f7ff',
    textSecondary: '#a9b5cf',
    textMuted: '#6b7794',
    border: 'rgba(255,255,255,0.13)',
    borderSubtle: 'rgba(255,255,255,0.07)',
    headerBg: 'rgba(7,11,24,0.62)',
    cardShadow: '0 6px 22px rgba(0,0,0,0.45)',
    pastOpacity: 0.35,
    isDark: true,
    accent: '#5EEAD4',
    onAccent: '#04211d',
    eventStyle: 'glass',
    surfaceBlur: '18px',
    todayFill: 0.07,
  },
};

const OBSIDIAN: FullscreenTheme = {
  id: 'obsidian',
  name: 'Obsidian',
  group: 'dark',
  tokens: {
    bg: '#000000',
    bgImage:
      'radial-gradient(139% 52% at 50% -16%, rgba(255,255,255,0.11), transparent 68%), '
      + 'radial-gradient(83% 36% at 50% 116%, rgba(245,195,126,0.09), transparent 64%)',
    surface: 'rgba(255,255,255,0.095)',
    surfaceHover: 'rgba(255,255,255,0.13)',
    surfaceAlt: 'rgba(255,255,255,0.045)',
    text: '#f7f7f5',
    textSecondary: '#9c9a94',
    textMuted: '#5e5c57',
    border: 'rgba(255,255,255,0.14)',
    borderSubtle: 'rgba(255,255,255,0.065)',
    headerBg: 'rgba(0,0,0,0.66)',
    cardShadow: 'none',
    pastOpacity: 0.3,
    isDark: true,
    accent: '#F5C37E',
    onAccent: '#1a1206',
    eventStyle: 'rule',
    surfaceBlur: '20px',
    todayFill: 0.07,
  },
};

const HORIZON: FullscreenTheme = {
  id: 'horizon',
  name: 'Horizon',
  group: 'dark',
  tokens: {
    bg: '#0b1020',
    // One long dusk: navy at the masthead sinking to ember at the footer.
    bgImage: 'linear-gradient(180deg, #070c1c 0%, #131b38 38%, #3c2a44 72%, #6b3b34 100%)',
    surface: 'rgba(255,255,255,0.07)',
    surfaceHover: 'rgba(255,255,255,0.11)',
    surfaceAlt: 'rgba(255,255,255,0.04)',
    text: '#fdf6ee',
    textSecondary: '#c1b6c4',
    textMuted: '#877d90',
    border: 'rgba(255,255,255,0.15)',
    borderSubtle: 'rgba(255,255,255,0.075)',
    headerBg: 'rgba(7,12,28,0.66)',
    cardShadow: '0 6px 22px rgba(0,0,0,0.40)',
    pastOpacity: 0.34,
    isDark: true,
    accent: '#FDBA74',
    onAccent: '#2a1608',
    eventStyle: 'glass',
    surfaceBlur: '18px',
    todayFill: 0.07,
  },
};

// ── Typography & Density ─────────────────────

const TYPO_MULTIPLIERS: Record<FullscreenTypographySize, number> = {
  'small': 0.85,
  'medium': 1.0,
  'large': 1.15,
  'extra-large': 1.35,
  '2x-large': 1.6,
  '3x-large': 1.85,
  '4x-large': 2.15,
};

export function getTypoMultiplier(size: FullscreenTypographySize | string): number {
  return TYPO_MULTIPLIERS[size as FullscreenTypographySize] ?? 1.0;
}

export function getDensityMultiplier(density: string): number {
  return density === 'cozy' ? 1.2 : 1.0;
}

// ── Exports ───────────────────────────────────

export const FULLSCREEN_THEMES: FullscreenTheme[] = [
  // Light block first, then dark — the pickers render in array order.
  LINEN,
  PAPER,
  MIST,
  SANDSTONE,
  VELLUM,
  BLOOM,
  CHARCOAL,
  MIDNIGHT,
  SLATE,
  AURORA,
  OBSIDIAN,
  HORIZON,
];

const THEME_MAP = new Map(FULLSCREEN_THEMES.map((t) => [t.id, t]));

/** Resolve a theme ID to its tokens. Falls back to Linen. */
export function getThemeTokens(themeId: string | undefined): FullscreenThemeTokens {
  return (THEME_MAP.get(themeId ?? 'linen') ?? LINEN).tokens;
}

/** Map legacy darkMode boolean to a theme ID. */
export function migrateFromDarkMode(darkMode: boolean | undefined): string {
  return darkMode ? 'charcoal' : 'linen';
}

/**
 * The accent a fullscreen module paints with: a user-set `accentColor` wins,
 * then the theme's own accent, then the module's historical default. Every
 * module and its config section resolve through this one function so the
 * editor's swatch can never disagree with the kiosk.
 */
export function resolveFullscreenAccent(
  accentColor: string | undefined,
  tokens: FullscreenThemeTokens,
  fallback: string,
): string {
  return accentColor || tokens.accent || fallback;
}

const ON_ACCENT_LIGHT = '#ffffff';
const ON_ACCENT_DARK = '#1c1917';

function parseColorChannels(color: string): [number, number, number] | null {
  const c = color.trim();
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = c.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

/** WCAG relative luminance of a hex or rgb() colour; null when it cannot be parsed. */
export function relativeLuminance(color: string): number | null {
  const ch = parseColorChannels(color);
  if (!ch) return null;
  const [r, g, b] = ch.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The ink that reads on top of `accent`: white on a saturated accent, dark
 * ink on a light one (amber, peach, mint). Picks whichever of the two has
 * the higher WCAG contrast against the accent; unparsable colours get white.
 */
export function onAccentFor(accent: string): string {
  const l = relativeLuminance(accent);
  if (l === null) return ON_ACCENT_LIGHT;
  const lightInk = relativeLuminance(ON_ACCENT_LIGHT) as number;
  const darkInk = relativeLuminance(ON_ACCENT_DARK) as number;
  const contrastLight = (lightInk + 0.05) / (l + 0.05);
  const contrastDark = (l + 0.05) / (darkInk + 0.05);
  return contrastDark > contrastLight ? ON_ACCENT_DARK : ON_ACCENT_LIGHT;
}

/**
 * The text colour for `resolveFullscreenAccent`'s result. A theme's own
 * `onAccent` wins while the theme's own accent is in use; a user-set accent
 * (or the module fallback) gets an ink computed from its luminance.
 */
export function resolveFullscreenOnAccent(
  accentColor: string | undefined,
  tokens: FullscreenThemeTokens,
  fallback: string,
): string {
  if (!accentColor && tokens.accent && tokens.onAccent) return tokens.onAccent;
  return onAccentFor(resolveFullscreenAccent(accentColor, tokens, fallback));
}

/** The `backdrop-filter` value for a theme's frosted surfaces: a real blur
 *  only when the theme asks for one. `blur(0px)` is not free — it still
 *  promotes a backdrop render surface on the Pi for no visual change. */
export function surfaceBackdrop(tokens: FullscreenThemeTokens): string {
  return tokens.surfaceBlur ? `blur(${tokens.surfaceBlur})` : 'none';
}

/**
 * Build CSS custom properties from theme tokens with a module-specific prefix.
 * Returns a mapping like `{ '--prefix-bg': theme.bg, ... }` for the common
 * structural tokens. Modules can spread in extra properties alongside these.
 */
export function buildThemeCSSVars(
  prefix: string,
  theme: FullscreenThemeTokens,
): Record<string, string> {
  return {
    [`--${prefix}-bg`]: theme.bg,
    [`--${prefix}-surface`]: theme.surface,
    [`--${prefix}-text`]: theme.text,
    [`--${prefix}-text-2`]: theme.textSecondary,
    [`--${prefix}-text-3`]: theme.textMuted,
    [`--${prefix}-border`]: theme.border,
    [`--${prefix}-border-sub`]: theme.borderSubtle,
    [`--${prefix}-card-shadow`]: theme.cardShadow,
    [`--${prefix}-past-op`]: String(theme.pastOpacity),
    // `none` keeps both properties valid for themes with no atmosphere layer.
    [`--${prefix}-bg-image`]: theme.bgImage ?? 'none',
    [`--${prefix}-surface-backdrop`]: surfaceBackdrop(theme),
  };
}
