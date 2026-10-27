'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { initialOf } from '@/lib/notes-rules';
import { useFitFontSize } from '@/hooks/useFitFontSize';
import { useStepper } from '../useStepper';
import { PinGlyph, ageOf, authorOf } from '../shared';
import type { MaterialViewProps } from './types';

const FELT = '#171717';
const GROOVE = '#262626';
/** The oak frame, a share of the card's shorter side (16px on the 440 x 520 design). */
const FRAME_SHARE = 0.036;
/** Letter size in base ems, the mockup's 2.05em, and the smallest the fit may take it to. */
const LETTER_EM = 2.05;
const LETTER_MIN_EM = 0.8;
/** Line pitch in letter ems; every line is three grooves tall, so each one sits on a groove. */
const LINE_EM = 1.08;
const GROOVES_PER_LINE = 3;

/** White plastic, and the yellow set an important note is spelled in: face, then the two edges of its depth. */
const PLASTIC = {
  white: { face: '#f4f1ea', edges: ['#cfcac0', '#9b968d'] },
  yellow: { face: '#ffd84d', edges: ['#c9a63a', '#8d7224'] },
} as const;

function plasticShadow(edges: readonly [string, string]): string {
  return `0 0.02em 0 ${edges[0]}, 0 0.04em 0 ${edges[1]}, 0 0.06em 0.06em rgba(0, 0, 0, 0.7)`;
}

/**
 * Letterboard: black felt with fine grooves in an oak frame, one note at a
 * time spelled in white plastic capitals (yellow for an important note).
 * Steps like Spotlight. The text wraps by word and shrinks to fit the felt;
 * past the smallest letters it is cut short with an ellipsis. The grooves
 * are laid from the first line's baseline, so every line sits on one.
 */
export function LetterboardView({ ctx, all, stepSeconds, padding, width, height }: MaterialViewProps) {
  const { note, position } = useStepper(all, stepSeconds);
  const minLetter = ctx.fontPx * LETTER_MIN_EM;
  const { boxRef, contentRef, fontSize } = useFitFontSize(
    ctx.fontPx * LETTER_EM,
    note ? `${note.id}:${note.text}` : '',
    minLetter,
  );
  // Whole pixels, so the grooves repeat evenly and land on every line.
  const pitch = Math.max(3, Math.round((fontSize * LINE_EM) / GROOVES_PER_LINE));
  const lineHeight = pitch * GROOVES_PER_LINE;
  const groove = Math.max(1, Math.round(pitch / 9));
  const atFloor = fontSize <= minLetter + 0.01;

  const probeRef = useRef<HTMLSpanElement>(null);
  const [layout, setLayout] = useState({ grooveY: 0, rows: 0 });
  // The first line's baseline (a zero-height inline box sits on it), so the
  // grooves can be laid from there; and how many whole lines the felt holds,
  // for the cut when even the smallest letters overflow. Offsets are layout
  // pixels, so a zoomed editor canvas reads the same as the wall.
  const measure = useCallback(() => {
    const probe = probeRef.current;
    const box = boxRef.current;
    if (!probe || !box) return;
    const grooveY = ((probe.offsetTop % pitch) + pitch) % pitch;
    const rows = Math.max(1, Math.floor((box.clientHeight + 1) / lineHeight));
    setLayout((l) => (l.grooveY === grooveY && l.rows === rows ? l : { grooveY, rows }));
  }, [boxRef, pitch, lineHeight]);
  const hasNote = note !== null;
  useLayoutEffect(measure, [measure, note?.id, note?.text, fontSize, atFloor, ctx.showAuthor, ctx.showAge, padding]);
  // A resize or the face arriving moves the first line without a new note.
  useEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!hasNote || !box || !content || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(content);
    let live = true;
    document.fonts?.ready.then(() => { if (live) measure(); });
    return () => { live = false; ro.disconnect(); };
  }, [boxRef, contentRef, measure, hasNote]);

  if (!note) return null;
  const author = authorOf(note, ctx.members, ctx.t);
  const age = ageOf(note, ctx);
  const plastic = note.important ? PLASTIC.yellow : PLASTIC.white;
  const frame = Math.round(Math.min(28, Math.max(8, Math.min(width, height) * FRAME_SHARE)));
  const credit = [ctx.showAuthor ? author.name : '', age].filter(Boolean).join(' · ');
  return (
    <div
      data-testid="notes-note"
      data-important={note.important ? '' : undefined}
      data-pinned={note.pinned ? '' : undefined}
      className="relative flex flex-col h-full min-h-0 overflow-hidden"
      style={{
        // Longhands: the `border` shorthand resets `border-image`, so a
        // re-render that changed the width would drop the oak to flat tan.
        borderWidth: frame,
        borderStyle: 'solid',
        borderColor: '#c69c6d',
        borderImage: 'linear-gradient(135deg, #d9b183, #a97c4d 50%, #c69c6d) 1',
        backgroundColor: FELT,
        backgroundImage: `repeating-linear-gradient(180deg, ${GROOVE} 0 ${groove}px, ${FELT} ${groove}px ${pitch}px)`,
        backgroundPosition: `0 ${layout.grooveY}px`,
        boxShadow: 'inset 0 0 50px rgba(0, 0, 0, 0.6)',
        padding,
      }}
    >
      <div
        ref={boxRef}
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
        // Centred while it fits; `safe` keeps the first line in view when it does not.
        style={{ justifyContent: 'safe center' }}
      >
        <div
          ref={contentRef}
          style={{
            fontSize,
            lineHeight: `${lineHeight}px`,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: plastic.face,
            textShadow: plasticShadow(plastic.edges),
            whiteSpace: 'pre-line',
            overflowWrap: 'break-word',
            ...(atFloor && layout.rows > 0
              ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: layout.rows, overflow: 'hidden' }
              : null),
          }}
        >
          <span ref={probeRef} aria-hidden="true" className="inline-block" style={{ width: 0, height: 0 }} />
          {note.text}
        </div>
      </div>
      <div
        className="flex items-center shrink-0 min-w-0 uppercase"
        style={{ gap: '0.42em', marginTop: '0.6em', fontSize: '0.95em', lineHeight: 1.2, letterSpacing: '0.1em', color: '#cfcac0' }}
      >
        {ctx.showAuthor && (
          <span
            data-testid="notes-author"
            data-author={author.id ?? 'someone'}
            title={author.name}
            className="shrink-0"
            style={{
              background: '#f4f1ea',
              color: '#111',
              borderRadius: '0.26em',
              padding: '0.09em 0.44em 0',
              boxShadow: '0 0.09em 0.09em rgba(0, 0, 0, 0.6)',
            }}
          >
            {author.color ? initialOf(author.name) : '?'}
          </span>
        )}
        {credit && <span className="truncate">{credit}</span>}
        {note.pinned && <PinGlyph size="0.85em" />}
        <span data-testid="notes-step" className="ml-auto shrink-0 whitespace-nowrap tabular-nums" style={{ opacity: 0.7 }}>
          {ctx.t('notes.of', { index: position + 1, total: all.length })}
        </span>
      </div>
    </div>
  );
}
