import { memo, type CSSProperties } from 'react';
import { NOTE_INK_PALETTES, NOTE_PEN_WIDTHS, drawingLinePath, type NoteSurface } from '@/lib/note-drawing';
import { NOTE_PAGE, type NoteDrawing } from '@/types/notes';

/**
 * A drawn note, as a picture of its lines. One piece for the wall, the phone
 * and the editor: it fills the box it is given (4 wide by 3 tall, centred)
 * and draws each line in the ink its surface gives that pen, so the same
 * drawing is chalk on the chalkboard and marker on the whiteboard. On a
 * `card` or `paper` surface the first pen is the text colour around it.
 */
export const NoteDrawingArt = memo(function NoteDrawingArt({ drawing, surface = 'card', label, className, style }: {
  drawing: NoteDrawing;
  surface?: NoteSurface;
  /** What a screen reader says in place of the picture ("Drawing"). */
  label: string;
  className?: string;
  style?: CSSProperties;
}) {
  const palette = NOTE_INK_PALETTES[surface];
  return (
    <svg
      role="img"
      aria-label={label}
      data-testid="note-drawing-art"
      viewBox={`0 0 ${NOTE_PAGE.width} ${NOTE_PAGE.height}`}
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible', ...style }}
    >
      {drawing.lines.map((line, i) => (
        <path key={i} d={drawingLinePath(line.p)} stroke={palette[line.c]} strokeWidth={NOTE_PEN_WIDTHS[line.w]} />
      ))}
    </svg>
  );
});
