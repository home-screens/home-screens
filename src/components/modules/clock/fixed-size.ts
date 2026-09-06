import type { CSSProperties } from 'react';

/**
 * Styles for a fixed-size clock (`sizeMode: 'fixed'`), where nothing may read
 * the box: a text line never wraps to its width and a block never shrinks to
 * fit it, so the clock is the same size in any box and the box only places
 * it. In fit mode both are empty and the views render exactly as they did,
 * including the shrink that fits a wide face into a narrow box there.
 *
 * Prose (the word and fuzzy phrases, the elapsed words format) still wraps
 * in fixed mode, at a width in ems of its own size rather than of the box;
 * the views set that inline.
 */
export function noWrap(fitToBox: boolean): CSSProperties {
  return fitToBox ? {} : { whiteSpace: 'nowrap' };
}

export function noShrink(fitToBox: boolean): CSSProperties {
  return fitToBox ? {} : { flexShrink: 0 };
}
