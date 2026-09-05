import { DEFAULT_MODULE_STYLE, type ModuleStyle } from '@/types/config';

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
 * The one text-size control, Text size, is a percent of the module's normal
 * size: the fitted size on a module that fits its text to its box, the base
 * pixel size on every other module. The range covers every pixel value a wall
 * already stores (8..72 on a 16px base is 50%..450%), so nothing is lost when
 * an old value is read as a percent.
 */
export const TEXT_SCALE_MIN = 50;
export const TEXT_SCALE_MAX = 450;

/** What a module or plugin needs to know about its own defaults. */
export interface TextSizeDefinition {
  autoSizesText?: boolean;
  defaultStyle?: Partial<ModuleStyle>;
}

/** The pixel size a module's Text size is 100% of: its registry default. */
export function moduleBaseFontSize(def: TextSizeDefinition | undefined): number {
  const px = def?.defaultStyle?.fontSize;
  return typeof px === 'number' && Number.isFinite(px) && px > 0 ? px : DEFAULT_MODULE_STYLE.fontSize;
}

/**
 * `textScale` as a factor. Absent is 1. A hand-edited value outside the
 * range is clamped rather than trusted, and a nonsense value is 1, so a bad
 * config can never render text at nothing or at a hundred times the box.
 */
export function resolveTextScale(style: { textScale?: number }): number {
  const pct = style.textScale;
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return 1;
  return Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, pct)) / 100;
}

/**
 * The style a module renders with.
 *
 * `textScale` is the only text-size control the editor offers, but the file
 * keeps `fontSize` too, and a module nobody has touched since the percent
 * existed has only the pixel value. That value keeps its meaning: on a module
 * that fits its text to its box it is the floor (the hook applies it), and
 * everywhere else it is the size, so an untouched module renders exactly as it
 * always did. Once `textScale` is present it wins, as a percent of the base,
 * and the editor resets `fontSize` to the base in the same edit so the two
 * never disagree. Fitting modules are returned as they are: their hook reads
 * both fields itself, and multiplying here would apply the scale twice.
 */
export function resolveModuleStyle(style: ModuleStyle, def: TextSizeDefinition | undefined): ModuleStyle {
  if (def?.autoSizesText) return style;
  const pct = style.textScale;
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return style;
  return { ...style, fontSize: moduleBaseFontSize(def) * resolveTextScale(style) };
}

/**
 * The percent the Text size slider shows: the stored `textScale`, or, for a
 * module that has only the old pixel value, that value as a percent of the
 * base, so a wall with 34px stored on a 16px module reads 212% and renders
 * 34px. A fitting module with only the pixel value reads 100%: in any card
 * larger than its floor that is what it shows.
 */
export function displayTextPercent(style: ModuleStyle, def: TextSizeDefinition | undefined): number {
  const pct = style.textScale;
  if (typeof pct === 'number' && Number.isFinite(pct)) return Math.round(Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, pct)));
  if (def?.autoSizesText) return 100;
  const derived = Math.round((style.fontSize / moduleBaseFontSize(def)) * 100);
  return Number.isFinite(derived) ? Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, derived)) : 100;
}

/** Build the box-shadow CSS value for a module card. */
export function buildModuleShadow(shadowSize: number, scale = 1): string {
  if (shadowSize <= 0) return 'none';
  const offset = Math.round((shadowSize / 2) * scale);
  const blur = shadowSize * scale;
  const ambient = Math.round((shadowSize / 2) * scale);
  return `inset 0 ${scale}px 0 rgba(255, 255, 255, 0.12), 0 ${offset}px ${blur}px rgba(0, 0, 0, 0.8), 0 0 ${ambient}px rgba(255, 255, 255, 0.04)`;
}
