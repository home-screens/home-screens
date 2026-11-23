import { getThemeTokens, onAccentFor, relativeLuminance, type FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import { parseCssColorToRgb, withCssColorAlpha } from '@/lib/hex-color';

/**
 * What a fullscreen photo module's theme paints around the photo. The module
 * and its editor section both resolve through here, so the editor's Clock
 * Background controls start where the preview is.
 */

/**
 * The theme a fullscreen photo module paints with: its own, else the
 * display's full-screen theme, else Midnight.
 *
 * The one full-screen module whose last-resort theme is dark. The others
 * fall through to `getThemeTokens`, which defaults to `linen`, and the
 * per-display override UI advertises linen as the default for that reason.
 * Photos are the exception on purpose: the frame this theme paints (the
 * letterbox bars, the empty and loading screens, the clock backdrop) sits
 * against a photograph, and a pale frame around a photo reads as a mistake
 * where a dark one reads as a mount. A household that wants linen here sets
 * it, per module or per display, and this only applies when neither is set.
 */
export function photoThemeTokens(theme: string | undefined, fullscreenTheme: string | undefined): FullscreenThemeTokens {
  return getThemeTokens(theme ?? inheritedPhotoTheme(fullscreenTheme).theme);
}

/**
 * The theme a fullscreen photo module without one of its own paints with, and
 * whether Settings chose it. The editor's Default tile is labelled from this,
 * so it names Midnight only when Midnight is what the wall will draw.
 */
export function inheritedPhotoTheme(fullscreenTheme: string | undefined): { theme: string; fromSettings: boolean } {
  return fullscreenTheme !== undefined
    ? { theme: fullscreenTheme, fromSettings: true }
    : { theme: 'midnight', fromSettings: false };
}

/** The clock overlay settings these rules read. */
export interface ClockBackdropSettings {
  /** How solid the backdrop is, 0-100; unset is the backdrop's own. */
  clockBackdrop?: number;
  /** The backdrop's color; unset is white or black by theme. */
  clockBackdropColor?: string;
}

/** What the clock overlay paints: its backdrop, and the text written on it. */
export interface ClockOverlayPaint {
  /** CSS background, or undefined for no backdrop at all. */
  background: string | undefined;
  /** The time. */
  text: string;
  /** AM/PM and the date. */
  textSecondary: string;
}

/**
 * How solid a backdrop is at the bottom edge and 60% of the way up before it
 * fades out at the top, when the module sets no strength. A light backdrop
 * carries dark text and needs more body than a dark one carrying light text
 * to hold it over a busy photo.
 */
const BACKDROP_SHAPE = {
  light: { bottom: 0.72, middle: 0.38 },
  dark: { bottom: 0.55, middle: 0.25 },
} as const;

/** How see-through the AM/PM and date are next to the time on a picked color. */
const PICKED_SECONDARY_ALPHA = 0.8;

/**
 * The backdrop's color and the text that goes on it. Unpicked, it runs the
 * opposite way from the theme's own text, because the photo underneath can be
 * any brightness: white under a light theme's dark text, black under a dark
 * theme's light text. A picked color gets whichever of dark or light text
 * reads best on it instead, since the theme's text was never chosen for it.
 */
function resolveBackdrop(theme: FullscreenThemeTokens, color: string | undefined) {
  // The pick as plain hex whatever notation it was stored in (the color box
  // also takes rgb() and hex without a #). Its own alpha is dropped: Clock
  // Background is what sets how solid the backdrop is.
  const picked = color ? withCssColorAlpha(color, 1) : null;
  const rgb = parseCssColorToRgb(picked ?? undefined);
  if (!picked || !rgb) {
    return {
      rgb: theme.isDark ? '0,0,0' : '255,255,255',
      light: !theme.isDark,
      text: theme.text,
      textSecondary: theme.textSecondary,
    };
  }
  const ink = onAccentFor(picked);
  return {
    rgb: rgb.join(','),
    light: (relativeLuminance(ink) ?? 1) < 0.5,
    text: ink,
    textSecondary: withCssColorAlpha(ink, PICKED_SECONDARY_ALPHA) ?? ink,
  };
}

/** The color an unpicked backdrop is, for the editor's swatch. */
export function autoClockBackdropColor(theme: FullscreenThemeTokens): string {
  return theme.isDark ? '#000000' : '#ffffff';
}

/** The Clock background percentage the backdrop draws when the module sets none. */
export function defaultClockBackdrop(theme: FullscreenThemeTokens, color: string | undefined): number {
  return Math.round(BACKDROP_SHAPE[resolveBackdrop(theme, color).light ? 'light' : 'dark'].bottom * 100);
}

/**
 * The clock overlay's backdrop and text. The Clock background percentage is
 * how solid the bottom edge is. Below the backdrop's own strength the fade
 * keeps its shape and only thins; above it the middle of the fade climbs as
 * well, so 100 is a solid band behind the clock rather than a solid edge
 * under a fade the digits still sit in.
 */
export function clockOverlayPaint(theme: FullscreenThemeTokens, settings: ClockBackdropSettings): ClockOverlayPaint {
  const { rgb, light, text, textSecondary } = resolveBackdrop(theme, settings.clockBackdropColor);
  const shape = BACKDROP_SHAPE[light ? 'light' : 'dark'];
  const strength = settings.clockBackdrop;
  const bottom = Number.isFinite(strength) ? Math.min(1, Math.max(0, strength! / 100)) : shape.bottom;
  if (bottom === 0) return { background: undefined, text, textSecondary };
  const middle = bottom <= shape.bottom
    ? shape.middle * (bottom / shape.bottom)
    : shape.middle + (1 - shape.middle) * ((bottom - shape.bottom) / (1 - shape.bottom));
  return {
    background: `linear-gradient(to top, rgba(${rgb},${alpha(bottom)}) 0%, rgba(${rgb},${alpha(middle)}) 60%, transparent 100%)`,
    text,
    textSecondary,
  };
}

function alpha(value: number): number {
  return Math.round(value * 1000) / 1000;
}
