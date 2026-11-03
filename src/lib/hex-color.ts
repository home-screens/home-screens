/**
 * Shared hex → RGB parsing. Calendar colors arrive from several producers
 * (Google Calendar, iCal config swatches, Apple CalDAV) in 3-, 6-, or
 * 8-digit hex; every consumer that needs channel values goes through this
 * one parser so format handling can't drift between call sites. Returns
 * `null` for anything unparseable (named colors, junk) — callers pick
 * their own fallback.
 */
export function parseHexToRgb(color: string): [number, number, number] | null {
  let hex = color.startsWith('#') ? color.slice(1) : color;
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  // 8-digit #rrggbbaa: ignore the alpha channel.
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return null;
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/**
 * Hex plus rgb()/rgba() functional notation, the two notations every color
 * control in the app produces, and the two every consumer can reason about
 * (contrast picks, alpha math). The channels may be comma- or space-separated,
 * since a theme file or a hand edit writes either. Anything else (named
 * colors, hsl(), gradients, color-mix) returns `null`; callers keep their
 * fallback, and `ColorPicker` refuses the input rather than storing a value
 * the renderers cannot read.
 */
export function parseCssColorToRgb(color: string | undefined): [number, number, number] | null {
  if (!color) return null;
  const c = color.trim();
  const fn = c.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  return parseHexToRgb(c);
}

/**
 * The same colour, see-through: an `rgba()` at `alpha` for hex and
 * rgb()/rgba() inputs (an rgba() input's own alpha is multiplied in, so a
 * 40% card at 50% is 20%), and a `color-mix()` for anything the parser
 * refuses (a named colour or hsl() hand-written into config.json), which
 * lets the browser apply the alpha instead of the property being dropped.
 *
 * Every tinted fill, ring, glow and track derived from a user-chosen colour
 * goes through here. A colour picker accepts `rgb(255, 0, 0)` as well as
 * hex, and a hex-suffix idiom like `${accent}33` turns such a value into
 * invalid CSS that silently paints nothing.
 */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseCssColorToRgb(color);
  const clamped = Math.min(1, Math.max(0, alpha));
  if (!rgb) return `color-mix(in srgb, ${color} ${Number((clamped * 100).toFixed(1))}%, transparent)`;
  const own = parseCssColorAlpha(color) ?? 1;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Number((own * clamped).toFixed(3))})`;
}

/**
 * The one named colour the style panel actually meets: nine modules ship
 * `backgroundColor: 'transparent'`. CSS defines it as rgba(0, 0, 0, 0), which
 * is what the colour controls need to edit from — but only they do.
 * `parseCssColorToRgb` deliberately keeps refusing it, so a renderer asking
 * "what colour is this card" still gets null and keeps its own fallback
 * instead of quietly deciding the card is black.
 */
function isTransparentKeyword(color: string): boolean {
  return color.trim().toLowerCase() === 'transparent';
}

/**
 * How see-through a colour is, 0 to 1, from either notation. A colour that
 * carries no alpha is fully opaque, which is what both notations mean by
 * leaving it out; `transparent` is the opposite end of the same scale.
 * `null` for anything unparseable, like the parser above.
 */
export function parseCssColorAlpha(color: string | undefined): number | null {
  if (!color) return null;
  if (isTransparentKeyword(color)) return 0;
  if (parseCssColorToRgb(color) === null) return null;
  const c = color.trim();
  const fn = c.match(/^rgba?\(\s*\d+\s*[, ]\s*\d+\s*[, ]\s*\d+\s*[,/]\s*([\d.]+)\s*\)$/i);
  if (fn) return Number(fn[1]);
  const hex = c.startsWith('#') ? c.slice(1) : c;
  if (/^[0-9a-f]{8}$/i.test(hex)) return parseInt(hex.slice(6, 8), 16) / 255;
  return 1;
}

/**
 * A colour split into the two things a picker edits separately: the channels
 * its swatch shows, and how see-through it is. `transparent` comes back as
 * black at zero alpha, so the swatch stops drawing white for it and the
 * see-through slider has a colour to turn up.
 */
export function parseEditableColor(
  color: string | undefined,
): { rgb: [number, number, number]; alpha: number } | null {
  if (!color) return null;
  if (isTransparentKeyword(color)) return { rgb: [0, 0, 0], alpha: 0 };
  const rgb = parseCssColorToRgb(color);
  if (!rgb) return null;
  return { rgb, alpha: parseCssColorAlpha(color) ?? 1 };
}

/**
 * The same colour at a different alpha.
 *
 * Fully opaque comes back as the plain hex people recognize, anything else as
 * `rgba()`, which is the one see-through notation every renderer downstream
 * can read. Two decimals, because a slider otherwise stores
 * `rgba(0, 0, 0, 0.4300000000000001)` into the layout.
 */
export function withCssColorAlpha(color: string, alpha: number): string | null {
  const rgb = parseEditableColor(color)?.rgb;
  if (!rgb) return null;
  const clamped = Math.min(1, Math.max(0, alpha));
  if (clamped === 1) {
    return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  }
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Number(clamped.toFixed(2))})`;
}
