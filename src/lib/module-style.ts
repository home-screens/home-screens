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
 * Font size for text drawn inside a viewBox'd SVG, scaled by the module's
 * Text size.
 *
 * SVG text is authored in user-space units, so it already scales with the card
 * (which is right, and is why these were left as bare numbers). It also made
 * them the one place the text-size setting could not reach: raising it grew
 * the HTML around a sun arc and nothing on the arc.
 *
 * The factor is `textScale` alone, never the stored pixel value. A module
 * carrying only the old pixel size renders its SVG labels exactly as it
 * always did (48px stored on a sun arc used to mean 48px HTML and unchanged
 * labels; tripling the labels on upgrade was a visible change nobody asked
 * for, and the labels' positions never moved with them). The first edit of
 * Text size writes `textScale`, and from then on the labels follow it along
 * with everything else.
 */
export function svgFontSize(userUnits: number, style: { textScale?: number }): string {
  return `${userUnits * resolveTextScale(style)}px`;
}

/**
 * The one text-size control, Text size, is a percent of what the module shows
 * on its own: the fitted size on a module that fits its text to its box, the
 * registry base pixel size everywhere else. The top covers every pixel value
 * a wall already stores (72 on a 16px base is 450%); the bottom is only "not
 * nothing", since a range input needs a minimum and 0% is invisible text.
 */
export const TEXT_SCALE_MIN = 10;
export const TEXT_SCALE_MAX = 450;

/** What a module or plugin needs to know about its own defaults. */
export interface TextSizeDefinition {
  /** Fits its text to its box (useScaledFontSize); 100% is the fitted size. */
  autoSizesText?: boolean;
  /**
   * For a module that can fit its text but lets each instance turn that off,
   * whether THIS instance does. Absent means every instance fits.
   */
  textFitEnabled?: (config: Record<string, unknown>) => boolean;
  defaultStyle?: Partial<ModuleStyle>;
}

/**
 * The definition as it applies to one instance: `autoSizesText` true only when
 * the module fits its text AND this instance has that on. The multi-month
 * calendar is the case: new ones fill their card, but one from before `fitToBox`
 * existed renders its literal pixel size, so its 100% is the base, not a fit
 * it never uses. Reading it as fitted showed 130% against a theoretical fit
 * and the next nudge of the slider shrank a 52px calendar to 34px.
 */
export function textSizeDefinitionFor(
  def: TextSizeDefinition | undefined,
  config: Record<string, unknown> | undefined,
): TextSizeDefinition | undefined {
  if (!def?.autoSizesText || !def.textFitEnabled) return def;
  return { ...def, autoSizesText: def.textFitEnabled(config ?? {}) };
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
 * The style a module renders with, applied once at the three render sites.
 *
 * With `textScale` present, `fontSize` becomes base times percent. That is
 * the text size on most modules, and on a module that fits its text to its
 * box it is the floor, whose hook scales the fitted size by the same percent
 * (see useScaledFontSize), so the whole module, card title included, follows
 * the one number. A module nobody has touched since Text size existed
 * carries only the pixel value and passes through untouched, rendering
 * exactly as it always did; the first edit writes `textScale` and resets
 * `fontSize` to the base so the two never disagree.
 */
export function resolveModuleStyle(style: ModuleStyle, def: TextSizeDefinition | undefined): ModuleStyle {
  const pct = style.textScale;
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return style;
  return { ...style, fontSize: moduleBaseFontSize(def) * resolveTextScale(style) };
}

/**
 * The percent the Text size slider shows: the stored `textScale`, or the old
 * pixel value as a percent of what the module shows on its own.
 *
 * On a fixed-size module that is the base: 34px on a 16px base reads 213%.
 * On a module that fits its text it is the fitted size the module publishes
 * (`fittedPx`), and the pixel value was a floor: one below the fit never
 * showed and reads 100%, one above it is what showed and reads its ratio, so
 * 35px on a card that fits 18px reads 194%. Until the fit is known it reads
 * 100%, which is the fit.
 */
export function displayTextPercent(style: ModuleStyle, def: TextSizeDefinition | undefined, fittedPx?: number): number {
  const clamp = (n: number) => Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, Math.round(n)));
  const pct = style.textScale;
  if (typeof pct === 'number' && Number.isFinite(pct)) return clamp(pct);
  if (def?.autoSizesText) {
    if (typeof fittedPx !== 'number' || !Number.isFinite(fittedPx) || fittedPx <= 0) return 100;
    return clamp(Math.max(100, (style.fontSize / fittedPx) * 100));
  }
  const derived = (style.fontSize / moduleBaseFontSize(def)) * 100;
  return Number.isFinite(derived) ? clamp(derived) : 100;
}

/** Build the box-shadow CSS value for a module card. */
export function buildModuleShadow(shadowSize: number, scale = 1): string {
  if (shadowSize <= 0) return 'none';
  const offset = Math.round((shadowSize / 2) * scale);
  const blur = shadowSize * scale;
  const ambient = Math.round((shadowSize / 2) * scale);
  return `inset 0 ${scale}px 0 rgba(255, 255, 255, 0.12), 0 ${offset}px ${blur}px rgba(0, 0, 0, 0.8), 0 0 ${ambient}px rgba(255, 255, 255, 0.04)`;
}
