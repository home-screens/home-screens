'use client';

import { useRef, type CSSProperties, type ReactNode } from 'react';
import type { Note } from '@/types/notes';
import { DIVIDER, ink } from '@/lib/constants';
import { NoteRow, TINTED_LIST_STYLE } from './NoteRow';
import { useFitCount } from './useFitCount';
import { MORE_LINE_EM, MoreLine, PinGlyph, fitKeyOf, type NotesContext } from './shared';

function Column({ ctx, heading, notes, hidden, emptyText, pinnedColumn, style }: {
  ctx: NotesContext;
  heading: ReactNode;
  notes: Note[];
  /** Notes the cap left out of this column. */
  hidden: number;
  emptyText?: string;
  pinnedColumn: boolean;
  style?: CSSProperties;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const visible = useFitCount(
    listRef,
    fitKeyOf(notes, ctx.fontPx, ctx.showAuthor, ctx.showAge),
    hidden > 0 ? 0 : ctx.fontPx * MORE_LINE_EM,
  );
  const drawn = visible === null ? notes : notes.slice(0, visible);
  return (
    <div className="flex flex-col min-w-0 min-h-0" style={style}>
      <h3
        className="flex items-center font-bold uppercase shrink-0"
        style={{ gap: '0.4em', margin: '0 0 0.5em', fontSize: '0.66em', letterSpacing: '0.08em', color: ink(0.5) }}
      >
        {heading}
      </h3>
      <ul ref={listRef} className="flex flex-col flex-1 min-h-0 overflow-hidden" style={TINTED_LIST_STYLE}>
        {notes.length === 0 && emptyText && (
          <li style={{ fontSize: '0.8em', color: ink(0.35) }}>{emptyText}</li>
        )}
        {drawn.map((note, i) => (
          <NoteRow key={note.id} note={note} ctx={ctx} last={i === drawn.length - 1} showPin={!pinnedColumn} />
        ))}
      </ul>
      <MoreLine n={hidden + notes.length - drawn.length} t={ctx.t} />
    </div>
  );
}

/**
 * Pinned and new: two columns for a wide card. The standing notices on the
 * left, everything else newest first on the right (capped by the note
 * limit). With nothing pinned the left column says so and keeps its width.
 */
export function PinnedNewView({ ctx, all, max }: { ctx: NotesContext; all: Note[]; max: number }) {
  const pinned = all.filter((n) => n.pinned);
  const rest = all.filter((n) => !n.pinned);
  const fresh = rest.slice(0, max);
  return (
    <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
      <Column
        ctx={ctx}
        heading={<><PinGlyph size="1.2em" />{ctx.t('notes.pinned')}</>}
        notes={pinned}
        hidden={0}
        emptyText={ctx.t('notes.nothingPinned')}
        pinnedColumn
        style={{ paddingRight: '0.75em' }}
      />
      <Column
        ctx={ctx}
        heading={ctx.t('notes.new')}
        notes={fresh}
        hidden={rest.length - fresh.length}
        pinnedColumn={false}
        style={{ paddingLeft: '0.75em', borderLeft: `1px solid ${DIVIDER.visible}` }}
      />
    </div>
  );
}
