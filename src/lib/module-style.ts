import { DEFAULT_MODULE_STYLE } from '@/types/config';

/** Convert a CSS color to rgba with a given alpha, so backdrop-filter blur
 *  shows through instead of being hidden by an opaque background. Hex and
 *  rgb()/rgba() convert directly; anything else falls back to `color-mix`. */
export function colorWithAlpha(color: string, alpha: number): string {
  const short = color.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) {
    const [, r, g, b] = short;
    return `rgba(${parseInt(r + r, 16)}, ${parseInt(g + g, 16)}, ${parseInt(b + b, 16)}, ${alpha})`;
  }
  const hex = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) {
    const [, r, g, b] = hex;
    return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
  }
  const rgba = color.match(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/);
  if (rgba) return `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${parseFloat(rgba[4]) * alpha})`;
  const rgb = color.match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  // Anything else (a named color or hsl() hand-written into config.json) used
  // to come back fully opaque, which turned a translucent fill solid. color-mix
  // applies the alpha without needing to parse the color ourselves.
  return `color-mix(in srgb, ${color} ${alpha * 100}%, transparent)`;
}

/** The title strip's rendered size: titleFontSize when it is a usable number,
 *  else the module font size. Shared by ModuleWrapper and the editor's Title
 *  Size slider so the panel readout always matches what actually renders
 *  (a hand-edited 0 or negative value must not display as-is). */
export function resolveTitleFontSize(style: { titleFontSize?: number; fontSize: number }): number {
  const tfs = style.titleFontSize;
  return typeof tfs === 'number' && Number.isFinite(tfs) && tfs > 0 ? tfs : style.fontSize;
}

/**
 * Font size for text drawn inside a viewBox'd SVG, biased by the module's
 * `Style > Font size`.
 *
 * SVG text is authored in user-space units, so it already scales with the card
 * — which is right, and is why these were left as bare numbers. It also made
 * them the one place the font-size setting could not reach: raising it grew the
 * HTML around a sun arc and nothing on the arc, and did nothing at all to an
 * analog clock face.
 *
 * The ratio of the style size against the default, so at the default it is
 * exactly 1 and every dial already set renders the same pixels. This is the
 * one place a pixel size acts as a ratio, and it is safe here only because
 * these modules never fit their text to the box: their `fontSize` is the
 * literal size, not a floor, so the ratio is the same choice the user made in
 * pixels. A hand-edited 0 or nonsense value falls back to 1 rather than
 * collapsing the text to nothing.
 */
export function svgFontSize(userUnits: number, styleFontSize: number): string {
  const bias = Number.isFinite(styleFontSize) && styleFontSize > 0
    ? styleFontSize / DEFAULT_MODULE_STYLE.fontSize
    : 1;
  return `${userUnits * bias}px`;
}

/**
 * `textScale` as a factor, for the modules that fit their text to their box.
 * Absent is 1. A hand-edited value outside 50..200 is clamped rather than
 * trusted, and a nonsense value is 1, so a bad config can never render text
 * at nothing or at a hundred times the box.
 */
export function resolveTextScale(style: { textScale?: number }): number {
  const pct = style.textScale;
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return 1;
  return Math.min(200, Math.max(50, pct)) / 100;
}

/** Build the box-shadow CSS value for a module card. */
export function buildModuleShadow(shadowSize: number, scale = 1): string {
  if (shadowSize <= 0) return 'none';
  const offset = Math.round((shadowSize / 2) * scale);
  const blur = shadowSize * scale;
  const ambient = Math.round((shadowSize / 2) * scale);
  return `inset 0 ${scale}px 0 rgba(255, 255, 255, 0.12), 0 ${offset}px ${blur}px rgba(0, 0, 0, 0.8), 0 0 ${ambient}px rgba(255, 255, 255, 0.04)`;
}
