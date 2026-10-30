import type { CSSProperties } from 'react';

/**
 * A page with a folded corner and two lines of writing: the mark for anything
 * the family writes by hand. The phone's Notes tab, its empty board and the
 * calendar's day notes on the wall all draw it, so a kid learns one picture.
 */
export const NOTE_ICON_PATH = 'M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3zM15 3v6h6M8 13h8M8 17h5';

/** The note mark in `currentColor`, sized by `style` (1em square by default). */
export function NoteGlyph({ strokeWidth = 2, style }: { strokeWidth?: number; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ width: '1em', height: '1em', flexShrink: 0, ...style }}
    >
      <path d={NOTE_ICON_PATH} />
    </svg>
  );
}
