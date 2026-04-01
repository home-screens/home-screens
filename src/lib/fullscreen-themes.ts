/**
 * Shared color theme system for all fullscreen modules.
 *
 * Each theme is built from a single Tailwind gray scale so the tones
 * are internally consistent. Modules keep their own accent color for
 * identity — these tokens cover only the structural palette.
 */

import type { FullscreenTypographySize } from '@/types/config';

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
    bg: '#fafaf9',
    surface: '#ffffff',
    surfaceHover: '#f5f5f4',
    surfaceAlt: '#f5f5f4',
    text: '#1c1917',
    textSecondary: '#57534e',
    textMuted: '#a8a29e',
    border: '#e7e5e4',
    borderSubtle: '#f5f5f4',
    headerBg: 'rgba(250,250,249,0.85)',
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
    bg: '#f8fafc',
    surface: '#ffffff',
    surfaceHover: '#f1f5f9',
    surfaceAlt: '#f1f5f9',
    text: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#94a3b8',
    border: '#e2e8f0',
    borderSubtle: '#f1f5f9',
    headerBg: 'rgba(248,250,252,0.85)',
    cardShadow: '0 1px 4px rgba(0,0,0,0.06)',
    pastOpacity: 0.4,
    isDark: false,
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

// ── Typography & Density ─────────────────────

const TYPO_MULTIPLIERS: Record<FullscreenTypographySize, number> = {
  'small': 0.85,
  'medium': 1.0,
  'large': 1.15,
  'extra-large': 1.35,
  '2x-large': 1.6,
  '3x-large': 1.85,
};

export function getTypoMultiplier(size: FullscreenTypographySize | string): number {
  return TYPO_MULTIPLIERS[size as FullscreenTypographySize] ?? 1.0;
}

export function getDensityMultiplier(density: string): number {
  return density === 'cozy' ? 1.2 : 1.0;
}

// ── Exports ───────────────────────────────────

export const FULLSCREEN_THEMES: FullscreenTheme[] = [
  LINEN,
  PAPER,
  MIST,
  CHARCOAL,
  MIDNIGHT,
  SLATE,
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
