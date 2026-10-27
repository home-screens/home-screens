'use client';

import { useRef } from 'react';
import type { Note } from '@/types/notes';
import { UI_SANS_STACK } from '@/lib/font-registry';
import { tiltFor } from '@/lib/notes-rules';
import { useFitCount } from '../useFitCount';
import { MORE_LINE_EM, ageOf, authorOf, fitKeyOf, type NoteAuthor } from '../shared';
import type { MaterialViewProps } from './types';

const PAPER = '#fffdf7';
const PAPER_IMPORTANT = '#ffe9e9';
const INK_IMPORTANT = '#991b1b';
/** A magnet for a note from nobody: plain grey. */
const PLAIN_MAGNET = '#9ca3af';
/** The aluminium edge, a share of the card's shorter side (10px on the 640 x 520 design). */
const FRAME_SHARE = 0.019;

/**
 * Columns from the content's width: three on the 640px design, two on a
 * narrow card, one on a sliver.
 */
function fridgeColumns(width: number): number {
  if (width > 0 && width < 320) return 1;
  if (width > 0 && width < 500) return 2;
  return 3;
}

/** A glossy round magnet: the colour lit from the top left, with its drop shadow. */
function Magnet({ color, place, author }: {
  color: string;
  place: 'center' | 'left' | 'right';
  /** Set on the magnet that stands for the author. */
  author?: NoteAuthor;
}) {
  return (
    <span
      data-testid={author ? 'notes-author' : undefined}
      data-author={author ? author.id ?? 'someone' : undefined}
      title={author?.name}
      aria-hidden={author ? undefined : true}
      className="absolute rounded-full"
      style={{
        top: '-0.53em',
        width: '1.32em',
        height: '1.32em',
        left: place === 'center' ? '50%' : place === 'left' ? '1.23em' : undefined,
        right: place === 'right' ? '1.23em' : undefined,
        transform: place === 'center' ? 'translateX(-50%)' : undefined,
        background: `radial-gradient(circle at 35% 35%, color-mix(in srgb, ${color} 45%, #fff), ${color} 55%, color-mix(in srgb, ${color} 55%, #000))`,
        boxShadow: '0 0.13em 0.18em rgba(0, 0, 0, 0.45), inset 0 -0.13em 0.18em rgba(0, 0, 0, 0.3), inset 0 0.13em 0.18em rgba(255, 255, 255, 0.6)',
      }}
    />
  );
}

/**
 * Fridge: brushed steel in an aluminium edge, the notes as white paper scraps
 * each held by a magnet in the author's colour. The pinned note spans the
 * row under two magnets; an important one is on pale red paper in dark red
 * ink. Each paper leans by a constant from its id (`tiltFor`), never
 * animated. Papers that do not fit are counted into "and N more".
 */
export function FridgeView({ ctx, shown, hidden, padding, width, height }: MaterialViewProps) {
  const frame = Math.round(Math.min(18, Math.max(6, Math.min(width, height) * FRAME_SHARE)));
  const columns = fridgeColumns(width - 2 * (frame + padding));
  const gridRef = useRef<HTMLDivElement>(null);
  const visible = useFitCount(
    gridRef,
    fitKeyOf(shown, ctx.fontPx, columns, ctx.showAuthor, ctx.showAge),
    hidden > 0 ? 0 : ctx.fontPx * MORE_LINE_EM,
  );
  const drawn = visible === null ? shown : shown.slice(0, visible);
  const more = hidden + shown.length - drawn.length;
  return (
    <div
      className="relative flex flex-col h-full min-h-0 overflow-hidden"
      style={{
        background: [
          'linear-gradient(180deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0) 40%, rgba(0, 0, 0, 0.12))',
          'repeating-linear-gradient(90deg, #b3b8be 0 1px, #c6cacf 1px 3px, #bcc1c6 3px 4px)',
        ].join(', '),
        // Longhands: the `border` shorthand resets `border-image`.
        borderWidth: frame,
        borderStyle: 'solid',
        borderColor: '#9aa0a6',
        borderImage: 'linear-gradient(180deg, #c9ced3, #868c93) 1',
        padding,
      }}
    >
      <div
        ref={gridRef}
        className="grid flex-1 min-h-0 overflow-hidden content-start"
        // The top padding is the first row's magnets, which stand above their
        // papers; the sides keep a leaning paper's corners inside the clip.
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: '0.92em 0.75em', padding: '0.56em 0.28em 0.34em' }}
      >
        {drawn.map((note) => (
          <FridgePaper key={note.id} note={note} ctx={ctx} />
        ))}
      </div>
      {more > 0 && (
        <div
          data-testid="notes-more"
          className="shrink-0 self-end whitespace-nowrap"
          style={{ fontFamily: UI_SANS_STACK, fontSize: '0.7em', fontWeight: 600, lineHeight: 1.4, paddingTop: '0.4em', color: '#2b2f33' }}
        >
          {ctx.t('notes.andMore', { n: more })}
        </div>
      )}
    </div>
  );
}

function FridgePaper({ note, ctx }: { note: Note; ctx: MaterialViewProps['ctx'] }) {
  const author = authorOf(note, ctx.members, ctx.t);
  const age = ageOf(note, ctx);
  const credit = [ctx.showAuthor ? author.name : '', age].filter(Boolean).join(' · ');
  // The colour stays when the module hides names, as Sticky's paper does;
  // only the name goes, and the magnet stops standing for the author.
  const magnet = author.color ?? PLAIN_MAGNET;
  const marker = ctx.showAuthor ? author : undefined;
  // A paper the width of the door leans less: the same angle would lift its far end a long way.
  const tilt = tiltFor(note.id) * (note.pinned ? 0.4 : 1);
  return (
    <div
      data-testid="notes-note"
      data-fit={note.id}
      data-important={note.important ? '' : undefined}
      data-pinned={note.pinned ? '' : undefined}
      className="relative flex flex-col min-w-0"
      style={{
        gridColumn: note.pinned ? '1 / -1' : undefined,
        background: note.important ? PAPER_IMPORTANT : PAPER,
        color: note.important ? INK_IMPORTANT : undefined,
        fontSize: '0.95em',
        lineHeight: 1.15,
        fontWeight: 600,
        minHeight: note.pinned ? '4.82em' : '6.14em',
        padding: note.pinned ? '1.14em 0.61em 0.53em' : '1.05em 0.61em 0.53em',
        boxShadow: '0 0.13em 0.26em rgba(0, 0, 0, 0.3)',
        transform: `rotate(${tilt}deg)`,
      }}
    >
      {note.pinned ? (
        <>
          <Magnet color={magnet} place="left" author={marker} />
          <Magnet color={magnet} place="right" />
        </>
      ) : (
        <Magnet color={magnet} place="center" author={marker} />
      )}
      <div
        className={note.pinned ? 'line-clamp-3' : 'line-clamp-4'}
        style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
      >
        {note.text}
      </div>
      {credit && (
        <div
          className="truncate"
          style={{ fontFamily: UI_SANS_STACK, fontSize: '0.7em', fontWeight: 600, lineHeight: 1.3, marginTop: '0.5em', color: '#555' }}
        >
          {credit}
        </div>
      )}
    </div>
  );
}
