import { parseHexToRgb } from '@/lib/hex-color';

/**
 * The calendar modules' one contrast toolbox: text-on-fill picks (WCAG
 * ratio guarded, YIQ fallback) and the dark-theme color adjustments the
 * event surfaces use. Every "which ink is legible on this color?" question
 * across both calendar modules goes through this file so the answers can't
 * drift between surfaces.
 */

/** The blue every calendar surface falls back to when an event has no source color. */
export const DEFAULT_EVENT_COLOR = '#3B82F6';

const PILL_DARK_TEXT = '#1b1b1f';

/**
 * Auto-contrast text color for a solid pill background: light calendar
 * colors (yellows, limes) get near-black text, dark ones white. YIQ
 * luminance `((299R + 587G + 114B) / 1000) >= 160` picks dark; anything
 * unparseable (named colors, junk) falls back to white like the mockup's
 * "always white" policy.
 */
export function pickPillTextColor(hex: string | undefined): string {
  const rgb = hex ? parseHexToRgb(hex) : null;
  if (!rgb) return '#fff';
  const [r, g, b] = rgb;
  return (299 * r + 587 * g + 114 * b) / 1000 >= 160 ? PILL_DARK_TEXT : '#fff';
}

/**
 * Hex plus rgb()/rgba() functional notation, which is what ModuleStyle
 * backgrounds are stored as. Anything else (named colors, gradients,
 * color-mix) returns null — callers keep their fallback.
 */
function parseCssColorToRgb(color: string | undefined): [number, number, number] | null {
  if (!color) return null;
  const fn = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  return parseHexToRgb(color);
}

function wcagLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = wcagLuminance(a);
  const lb = wcagLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Text color for content sitting on a translucent accent tint. The tint
 * hue, the text color, and the surface under both are all independently
 * user-configurable, so no static pairing is safe: estimate the tint's
 * effective surface (accent at `tintAlpha` over the module background),
 * keep `preferred` while it clears 3:1 against that estimate, and fall
 * back to the same YIQ black/white pick as pickPillTextColor when it
 * doesn't. A translucent module background is treated as its own RGB (the
 * wallpaper behind it is unknowable); unparseable inputs keep `preferred`.
 */
export function pickTintedTextColor(preferred: string, accentColor: string, moduleBackground: string | undefined, tintAlpha = 0.25): string {
  const accent = parseHexToRgb(accentColor);
  const ground = parseCssColorToRgb(moduleBackground);
  const text = parseCssColorToRgb(preferred);
  if (!accent || !ground || !text) return preferred;
  const surface = [0, 1, 2].map(
    (i) => Math.round(accent[i] * tintAlpha + ground[i] * (1 - tintAlpha)),
  ) as [number, number, number];
  if (contrastRatio(text, surface) >= 3) return preferred;
  const [r, g, b] = surface;
  return (299 * r + 587 * g + 114 * b) / 1000 >= 160 ? PILL_DARK_TEXT : '#fff';
}

/**
 * Calendar-color time text for the clean multi-week pills. The pill surface
 * is white at 10% over the module background, and raw mid-saturation
 * calendar colors often land under 3:1 on it — mix toward white in 25%
 * steps until the color clears 3:1 (6 steps bounded, ~82% of the way to
 * white). Lightening only buys contrast on a dark surface: the module
 * background is free-form, so on a light one every step moves the color
 * closer to the surface instead of away from it. When the loop exhausts
 * without clearing 3:1, fall back to the same YIQ black/white pick as
 * pickPillTextColor rather than returning the worst candidate.
 * Unparseable calendar colors fall back to white; unparseable module
 * backgrounds estimate against the default charcoal.
 */
export function pickGridTimeColor(calendarColor: string, moduleBackground: string | undefined): string {
  const rgb = parseHexToRgb(calendarColor);
  if (!rgb) return '#fff';
  const ground = parseCssColorToRgb(moduleBackground) ?? [38, 40, 46];
  const surface = [0, 1, 2].map((i) => Math.round(255 * 0.1 + ground[i] * 0.9)) as [number, number, number];
  let c: [number, number, number] = rgb;
  for (let i = 0; i < 6 && contrastRatio(c, surface) < 3; i++) {
    c = c.map((v) => Math.round(v + (255 - v) * 0.25)) as [number, number, number];
  }
  if (contrastRatio(c, surface) < 3) {
    const [r, g, b] = surface;
    return (299 * r + 587 * g + 114 * b) / 1000 >= 160 ? PILL_DARK_TEXT : '#fff';
  }
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** `parseHexToRgb` with the calendar's blue fallback instead of null. */
export function parseHexToRgbOrBlue(color: string): [number, number, number] {
  return parseHexToRgb(color) ?? [59, 130, 246]; // DEFAULT_EVENT_COLOR
}

/** Approximate CSS saturate(0.85) brightness(1.1) — desaturate toward luminance, then brighten. */
export function darkAdjustRgb(r: number, g: number, b: number): [number, number, number] {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [
    Math.min(255, Math.round((lum + 0.85 * (r - lum)) * 1.1)),
    Math.min(255, Math.round((lum + 0.85 * (g - lum)) * 1.1)),
    Math.min(255, Math.round((lum + 0.85 * (b - lum)) * 1.1)),
  ];
}
