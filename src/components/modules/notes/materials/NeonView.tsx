'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { UI_SANS_STACK } from '@/lib/font-registry';
import { useFitFontSize } from '@/hooks/useFitFontSize';
import { useStepper } from '../useStepper';
import { ageOf, authorOf } from '../shared';
import type { MaterialViewProps } from './types';

/** The tube for a note from nobody: plain white. */
const WHITE_TUBE = '#ffffff';
const SIGN_PINK = '#ff7ac6';
const SIGN_PINK_DEEP = '#ff3fa4';
const DANGER_TUBE = '#ff5a5a';
const PIN_TUBE = '#ffd27a';
/**
 * The note's size in base ems, and the smallest the fit may take it to. The
 * base is about 34px on the 640 x 420 design, so 1.24em is the mockup's 42px.
 */
const NOTE_EM = 1.24;
const NOTE_MIN_EM = 0.5;
const NOTE_LINE = 1.25;

/** A glowing tube: a white core, then three layers of the colour, in the text's own ems. */
function noteGlow(color: string): string {
  return `0 0 0.1em #fff, 0 0 0.29em ${color}, 0 0 0.67em ${color}, 0 0 1.33em ${color}`;
}

/** The small signs (the name, the heading, a mark): the colour as the core, three layers round it. */
function signGlow(core: string, outer: string): string {
  return `0 0 0.19em ${core}, 0 0 0.6em ${outer}, 0 0 1.35em ${outer}, 0 0 2.3em color-mix(in srgb, ${outer} 60%, transparent)`;
}

/**
 * Neon: a dark wall with one note at a time in glowing script, the author's
 * colour for the glow and a tube frame round the card, the author's name as
 * its own small sign and the heading as a pink one. Steps like Spotlight.
 * The glow is text-shadow and box-shadow only, never animated. A long note
 * shrinks to fit inside the frame, and past the smallest size is cut short.
 */
export function NeonView({ ctx, all, stepSeconds, title, showTitle, padding, width, height }: MaterialViewProps) {
  const { note, position } = useStepper(all, stepSeconds);
  const minNote = ctx.fontPx * NOTE_MIN_EM;
  const { boxRef, contentRef, fontSize } = useFitFontSize(
    ctx.fontPx * NOTE_EM,
    note ? `${note.id}:${note.text}:${ctx.showAuthor}:${ctx.showAge}` : '',
    minNote,
  );
  const atFloor = fontSize <= minNote + 0.01;
  // At the smallest size the note is cut to the lines left above the
  // author's sign, so the sign never lands on the tube.
  const signRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(0);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!atFloor || !box) return;
    const sign = signRef.current;
    const signSpace = sign ? sign.offsetHeight + parseFloat(getComputedStyle(sign).marginTop) : 0;
    const next = Math.max(1, Math.floor((box.clientHeight - signSpace) / (fontSize * NOTE_LINE)));
    setRows((r) => (r === next ? r : next));
  }, [boxRef, atFloor, fontSize, note?.id, ctx.showAuthor, ctx.showAge]);
  if (!note) return null;
  const author = authorOf(note, ctx.members, ctx.t);
  const age = ageOf(note, ctx);
  const tube = author.color ?? WHITE_TUBE;

  // The tube sits `padding` in from the card's edge; the heading and the
  // counter sit just inside it, and the note keeps clear of both.
  const unit = Math.min(1.6, Math.max(0.6, Math.min(width, height) / 420 || 1));
  const tubeWidth = Math.max(2, Math.round(3 * unit));
  const tubeInset = Math.max(4, padding);
  const tubeGlow = Math.round(12 * unit);
  const clearY = tubeInset + tubeWidth + ctx.fontPx * 1.15;
  const clearX = tubeInset + tubeWidth + ctx.fontPx * 0.25;
  const marks = [
    note.important ? { key: 'important', text: ctx.t('notes.important'), color: DANGER_TUBE } : null,
    note.pinned ? { key: 'pinned', text: ctx.t('notes.pinnedOne'), color: PIN_TUBE } : null,
  ].filter((m) => m !== null);
  return (
    <div
      data-testid="notes-note"
      data-important={note.important ? '' : undefined}
      data-pinned={note.pinned ? '' : undefined}
      className="relative flex flex-col h-full min-h-0 overflow-hidden"
      style={{
        background: 'radial-gradient(110% 120% at 50% 60%, #171a26, #0a0b10 70%)',
        boxShadow: 'inset 0 0 0 2px rgba(255, 255, 255, 0.05)',
        padding: `${clearY}px ${clearX}px`,
      }}
    >
      <div
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          inset: tubeInset,
          borderRadius: Math.round(18 * unit),
          border: `${tubeWidth}px solid ${tube}`,
          opacity: 0.55,
          boxShadow: `0 0 ${tubeGlow}px ${tube}, inset 0 0 ${tubeGlow}px ${tube}`,
        }}
      />
      {showTitle && (
        <div
          // Never clipped: a clip would cut the glow off in a hard box.
          className="absolute whitespace-nowrap"
          style={{
            top: tubeInset + tubeWidth + 1,
            left: tubeInset + Math.round(10 * unit),
            fontSize: '0.64em',
            color: SIGN_PINK,
            textShadow: signGlow(SIGN_PINK, SIGN_PINK_DEEP),
          }}
        >
          {title.toLocaleLowerCase(ctx.locale)}
        </div>
      )}
      <div ref={boxRef} className="flex flex-col flex-1 min-h-0 items-center" style={{ justifyContent: 'safe center' }}>
        <div ref={contentRef} className="flex flex-col items-center text-center min-w-0" style={{ maxWidth: '92%' }}>
          <div
            style={{
              fontSize,
              lineHeight: NOTE_LINE,
              color: '#fff',
              textShadow: noteGlow(tube),
              whiteSpace: 'pre-line',
              overflowWrap: 'anywhere',
              // The padding keeps the glow inside the clip and the margin puts
              // the lines back; none below, where it would uncover the top of
              // the first line the clamp cut.
              ...(atFloor && rows > 0
                ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: rows, overflow: 'hidden', padding: '0.4em 0.4em 0', margin: '-0.4em -0.4em 0' }
                : null),
            }}
          >
            {note.text}
          </div>
          {(ctx.showAuthor || age || marks.length > 0) && (
            <div
              ref={signRef}
              className="flex items-baseline justify-center flex-wrap"
              style={{ marginTop: '1.28em', columnGap: '0.6em', fontSize: '0.6em', lineHeight: 1.4 }}
            >
              {marks.map((m) => (
                <span key={m.key} data-testid={m.key === 'important' ? 'notes-important' : undefined} style={{ color: m.color, textShadow: signGlow(m.color, m.color) }}>
                  {m.text}
                </span>
              ))}
              {ctx.showAuthor && (
                <span data-testid="notes-author" data-author={author.id ?? 'someone'} style={{ color: tube, textShadow: signGlow(tube, tube) }}>
                  {author.name}
                </span>
              )}
              {age && (
                <span style={{ fontFamily: UI_SANS_STACK, fontSize: '0.7em', color: 'rgba(255, 255, 255, 0.55)' }}>{age}</span>
              )}
            </div>
          )}
        </div>
      </div>
      <span
        data-testid="notes-step"
        className="absolute whitespace-nowrap tabular-nums"
        style={{
          right: tubeInset + Math.round(8 * unit),
          bottom: tubeInset + tubeWidth,
          fontFamily: UI_SANS_STACK,
          fontSize: '0.39em',
          color: 'rgba(255, 255, 255, 0.4)',
        }}
      >
        {ctx.t('notes.of', { index: position + 1, total: all.length })}
      </span>
    </div>
  );
}
