/**
 * How the full-screen calendar paints an event surface, resolved from the
 * active theme's `eventStyle`. Pure functions with no React or DOM needs, so
 * the editor's theme preview can paint its miniature blocks through the very
 * same code the kiosk uses and the two can never drift.
 */

import type { CSSProperties } from 'react';
import { parseHexToRgb } from '@/lib/hex-color';
import type { FullscreenEventStyle, FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import { resolveFullscreenAccent } from '@/lib/fullscreen-themes';

/** The slice of the calendar's scale object that painting depends on. */
export interface EventPaint {
  isDark: boolean;
  eventStyle: FullscreenEventStyle;
}

/**
 * The accent the calendar painted before themes carried one: orange, lifted
 * a step on dark backgrounds. Still the fallback for the six original themes.
 */
export function calendarFallbackAccent(isDark: boolean): string {
  return isDark ? '#F97316' : '#EA580C';
}

/** The calendar's resolved accent: user color, then theme accent, then orange. */
export function resolveCalendarAccent(accentColor: string | undefined, tokens: FullscreenThemeTokens): string {
  return resolveFullscreenAccent(accentColor, tokens, calendarFallbackAccent(tokens.isDark));
}

// ─── Color helpers (safe alpha + dark-mode adjustment) ───

function parseHexToRgbOrBlue(color: string): [number, number, number] {
  return parseHexToRgb(color) ?? [59, 130, 246]; // fallback blue-500
}

function darkAdjustRgb(r: number, g: number, b: number): [number, number, number] {
  // Approximate CSS saturate(0.85) brightness(1.1) — desaturate toward luminance, then brighten
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [
    Math.min(255, Math.round((lum + 0.85 * (r - lum)) * 1.1)),
    Math.min(255, Math.round((lum + 0.85 * (g - lum)) * 1.1)),
    Math.min(255, Math.round((lum + 0.85 * (b - lum)) * 1.1)),
  ];
}

/** Safely compose a source color + alpha, with optional dark-mode desaturation. */
export function eventBg(color: string, alpha: number, isDark: boolean): string {
  let [r, g, b] = parseHexToRgbOrBlue(color);
  if (isDark) [r, g, b] = darkAdjustRgb(r, g, b);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Return a solid source color, adjusted for dark mode. */
export function eventBorder(color: string, isDark: boolean): string {
  if (!isDark) return color;
  const [r, g, b] = darkAdjustRgb(...parseHexToRgbOrBlue(color));
  return `rgb(${r},${g},${b})`;
}

/** A user-picked accent gets a small lift on dark themes so it does not sink
 *  into the background; a theme's own accent is already tuned and skips this. */
export function brightenForDark(color: string): string {
  const [r, g, b] = parseHexToRgbOrBlue(color);
  return `rgb(${Math.min(255, Math.round(r * 1.15))},${Math.min(255, Math.round(g * 1.15))},${Math.min(255, Math.round(b * 1.15))})`;
}

/**
 * The shapes an event surface comes in:
 * - `block` a positioned box in a time grid (schedule, day timeline)
 * - `chip`  a small all-day pill
 * - `card`  a full-width card (agenda)
 * - `row`   the week list's full-width row, bare under `wash`
 * - `pill`  the month grid's one-line entry, bare under `wash`; it gains a
 *           fill under the other styles but never a real border, so the
 *           grid's per-pill height budget holds for every theme
 */
export type EventSurfaceVariant = 'block' | 'chip' | 'card' | 'row' | 'pill';

export interface EventSurfaceOptions {
  washAlpha?: number;
  barWidth?: string;
  radius?: number | string;
  /** Stacked overlap needs opaque cards, or events read through each other. */
  opaque?: boolean;
}

/**
 * The paint for one event surface. Every view calls this instead of composing
 * a background and border itself, so a theme changes the look of all five
 * views at once.
 *
 * Under `solid` the surface also owns its text: it sets `color` and rebinds
 * the three ink tokens for its subtree, so every line inside (time, place,
 * description, weather) inherits legible on-fill ink without each call site
 * knowing which style is active.
 *
 * The `wash` branch reproduces the pre-theme look exactly, which is why the
 * callers pass their own alpha and bar width: those were tuned per view and
 * must not drift now that they share a code path.
 */
export function eventSurface(
  color: string,
  paint: EventPaint,
  variant: EventSurfaceVariant,
  opts: EventSurfaceOptions = {},
): CSSProperties {
  const { isDark, eventStyle } = paint;
  const radius = opts.radius;

  // Stacked mode composites over the module background so an overlapping
  // card hides what is beneath it without losing the tint.
  const over = (bg: string) => (opts.opaque ? `linear-gradient(${bg}, ${bg}), var(--cal-bg)` : bg);

  if (eventStyle === 'solid') {
    // `eventBorder` lightens source colors on dark themes, so a solid fill
    // there wants dark text, not white.
    const ink = isDark ? '#10100f' : '#ffffff';
    const inkSoft = isDark ? 'rgba(16,16,15,0.72)' : 'rgba(255,255,255,0.82)';
    return {
      background: eventBorder(color, isDark),
      borderRadius: radius,
      color: ink,
      '--cal-text-primary': ink,
      '--cal-text-secondary': inkSoft,
      '--cal-text-tertiary': inkSoft,
    } as CSSProperties;
  }

  if (eventStyle === 'glass') {
    const hairline = eventBg(color, isDark ? 0.5 : 0.4, isDark);
    return {
      background: over(eventBg(color, isDark ? 0.22 : 0.24, isDark)),
      borderRadius: radius,
      // The month grid budgets a fixed height per pill, so its hairline is
      // an inset ring rather than a border that would grow the box.
      ...(variant === 'pill'
        ? { boxShadow: `inset 0 0 0 1px ${hairline}` }
        : { border: `1px solid ${hairline}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)' }),
    };
  }

  if (eventStyle === 'rule') {
    return {
      background: over('var(--cal-surface)'),
      borderLeft: `${opts.barWidth ?? '3px'} solid ${eventBorder(color, isDark)}`,
      borderRadius: radius,
    };
  }

  // wash — the original look, per variant.
  if (variant === 'pill' || variant === 'row') return { borderRadius: radius };
  if (variant === 'card') {
    return {
      background: over('var(--cal-surface)'),
      borderLeft: `${opts.barWidth ?? '4px'} solid ${color}`,
      boxShadow: 'var(--cal-card-shadow)',
      borderRadius: radius,
    };
  }
  if (variant === 'chip') {
    const alpha = opts.washAlpha ?? 0.13;
    return {
      background: eventBg(color, alpha, isDark),
      border: `1px solid ${eventBg(color, alpha + 0.07, isDark)}`,
      color: eventBorder(color, isDark),
      borderRadius: radius,
    };
  }
  return {
    borderLeft: `${opts.barWidth ?? '3px'} solid ${eventBorder(color, isDark)}`,
    background: over(eventBg(color, opts.washAlpha ?? 0.09, isDark)),
    borderRadius: radius,
  };
}
