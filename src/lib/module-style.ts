/** Convert a CSS color to rgba with a given alpha, so backdrop-filter blur
 *  shows through instead of being hidden by an opaque background. */
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
  return color;
}

/** The title strip's rendered size: titleFontSize when it is a usable number,
 *  else the module font size. Shared by ModuleWrapper and the editor's Title
 *  Size slider so the panel readout always matches what actually renders
 *  (a hand-edited 0 or negative value must not display as-is). */
export function resolveTitleFontSize(style: { titleFontSize?: number; fontSize: number }): number {
  const tfs = style.titleFontSize;
  return typeof tfs === 'number' && Number.isFinite(tfs) && tfs > 0 ? tfs : style.fontSize;
}

/** Build the box-shadow CSS value for a module card. */
export function buildModuleShadow(shadowSize: number, scale = 1): string {
  if (shadowSize <= 0) return 'none';
  const offset = Math.round((shadowSize / 2) * scale);
  const blur = shadowSize * scale;
  const ambient = Math.round((shadowSize / 2) * scale);
  return `inset 0 ${scale}px 0 rgba(255, 255, 255, 0.12), 0 ${offset}px ${blur}px rgba(0, 0, 0, 0.8), 0 0 ${ambient}px rgba(255, 255, 255, 0.04)`;
}
