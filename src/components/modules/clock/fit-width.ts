/**
 * Fit-to-width sizing for the clock views that draw the time on one line
 * (classic, neon, split, flip, bar). Each view's base size comes from the box
 * height (`useScaledFontSize`); when the box is narrower than the time string
 * at that size, the string used to clip at the edges. These helpers estimate
 * the line's width at the base size so the view can scale everything down by
 * `fitFactor` until it fits, and never past the base size when the box widens.
 *
 * Width is estimated from glyph classes rather than measured. A measured fit
 * would need a render, an observer and a correction pass each time the digits
 * change; an estimate lands in the first paint and only needs the box width.
 * The per-glyph widths are a little generous for the tabular, light-weight
 * digits every shipped face renders, so a mismatch shrinks the digits a hair
 * rather than clipping them.
 */

/** Width of a tabular digit, in em. */
export const DIGIT_EM = 0.6;
/** Width of a colon, in em. */
export const COLON_EM = 0.32;
/** Width of a space, in em. */
export const SPACE_EM = 0.28;
/** Width of an uppercase letter (AM/PM), in em. */
export const UPPER_EM = 0.68;
/** Width of any other glyph (lowercase, punctuation), in em. */
export const OTHER_EM = 0.52;
/** Room kept between the time and the box edges, both sides together, in px. */
export const FIT_INSET_PX = 24;
/** Never shrink below this share of the base size; a box that narrow is unreadable anyway. */
export const MIN_FIT_FACTOR = 0.15;

function glyphWidthEm(ch: string): number {
  if (ch >= '0' && ch <= '9') return DIGIT_EM;
  if (ch === ':') return COLON_EM;
  if (ch === ' ') return SPACE_EM;
  if (ch >= 'A' && ch <= 'Z') return UPPER_EM;
  return OTHER_EM;
}

/** Estimated rendered width of `text` at `fontSize` px, plus per-glyph letter spacing. */
export function estimateTextWidth(text: string, fontSize: number, letterSpacingEm = 0): number {
  let em = 0;
  for (const ch of text) em += glyphWidthEm(ch) + letterSpacingEm;
  return em * fontSize;
}

/**
 * The factor (0..1] that scales content of `contentWidth` px into a box of
 * `boxWidth` px with `inset` px to spare. 1 when it already fits or the box is
 * not measured yet (0), so nothing shrinks before the first measurement.
 */
export function fitFactor(contentWidth: number, boxWidth: number, inset = FIT_INSET_PX): number {
  if (!boxWidth || !contentWidth) return 1;
  const available = boxWidth - inset;
  if (available <= 0) return MIN_FIT_FACTOR;
  return Math.max(MIN_FIT_FACTOR, Math.min(1, available / contentWidth));
}

/**
 * The size a view measures its line at before asking `fitFactor` to shrink
 * it. The factor is `available / width` and `width` grows with the size, so
 * a factor taken at the scaled size cancels the scale outright: once the
 * line was as wide as the box, Text size did nothing at all in six views.
 *
 * Up to 100% the scaled size is measured, so a clock at or below the size it
 * picks on its own still shrinks to its box exactly as it always has. Above
 * 100% the auto size is measured instead: the factor then fits what the
 * module would show on its own, and the Text size the user set multiplies on
 * top of that and may overflow the box, which is what a size above 100% asks
 * for. The two agree at 100%, so the slider has no step in it.
 */
export function fitBaseSize(scaledFontSize: number, autoFontSize: number): number {
  return Math.min(scaledFontSize, autoFontSize);
}

export interface TimeLineSuffix {
  /** The AM/PM text, without the leading space the view renders. */
  text: string;
  /** Suffix font size as a fraction of the time's. */
  scale: number;
  /** Gap before the suffix, in em of the suffix's own size. */
  marginEm: number;
}

/**
 * Width of a one-line time (`9:51:37`) followed by an optional smaller AM/PM
 * suffix that shares its baseline. Used by classic, neon and bar.
 */
export function timeLineWidth(
  time: string,
  fontSize: number,
  letterSpacingEm: number,
  suffix?: TimeLineSuffix | null,
): number {
  let width = estimateTextWidth(time, fontSize, letterSpacingEm);
  if (suffix && suffix.text) {
    const size = fontSize * suffix.scale;
    width += estimateTextWidth(` ${suffix.text}`, size, letterSpacingEm) + suffix.marginEm * size;
  }
  return width;
}

/** Card width, colon width and card gap as fractions of the flip card size. */
export const FLIP_CARD_EM = 0.65;
export const FLIP_COLON_EM = 0.2;
export const FLIP_GAP_EM = 0.04;
export const FLIP_MIN_GAP_PX = 2;

/** Width of a flip-clock row of `cards` digit cards and `colons` separators. */
export function flipRowWidth(cardSize: number, cards: number, colons: number): number {
  const gap = Math.max(cardSize * FLIP_GAP_EM, FLIP_MIN_GAP_PX);
  return cards * cardSize * FLIP_CARD_EM + colons * cardSize * FLIP_COLON_EM + (cards + colons - 1) * gap;
}

/** Digit width, colon width (fractions of the digit size) and the flex gap of the seven-segment row. */
export const DIGITAL_DIGIT_EM = 0.6;
export const DIGITAL_COLON_EM = 0.25;
export const DIGITAL_GAP_PX = 4;

/** Width of a seven-segment row of `digits` digits and `colons` separators. */
export function digitalRowWidth(digitSize: number, digits: number, colons: number): number {
  return digits * digitSize * DIGITAL_DIGIT_EM + colons * digitSize * DIGITAL_COLON_EM + (digits + colons - 1) * DIGITAL_GAP_PX;
}

export interface SplitLine {
  text: string;
  fontSize: number;
  letterSpacingEm?: number;
}

/**
 * Width of the split view's row: the time column, the gap and hairline
 * divider, then the widest line of the date column.
 */
export function splitRowWidth(
  time: SplitLine,
  gap: number,
  dateLines: SplitLine[],
): number {
  const timeWidth = estimateTextWidth(time.text, time.fontSize, time.letterSpacingEm ?? 0);
  const dateWidth = dateLines.reduce(
    (widest, line) => Math.max(widest, estimateTextWidth(line.text, line.fontSize, line.letterSpacingEm ?? 0)),
    0,
  );
  const divider = 1;
  return timeWidth + gap + divider + (dateLines.length ? gap + dateWidth : 0);
}
