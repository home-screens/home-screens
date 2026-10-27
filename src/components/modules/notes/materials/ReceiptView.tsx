'use client';

import { useRef } from 'react';
import type { MaterialViewProps } from './types';
import { useFitCount } from '../useFitCount';
import { ageOf, authorOf, fitKeyOf, type NotesContext } from '../shared';

const PAPER = '#f7f4ea';
const RULE = '#777777';
/** Depth of the torn band at each end, in base ems (the mockup's 12px at 24px type). */
const TEAR_EM = 0.5;
/** The receipt's type against the card's: the mockup's 0.62em. */
const PRINT_EM = 0.62;
/** Line height of a printed row. */
const ROW_LINE = 1.3;
/** Space between rows, in print ems. */
const ROW_GAP = 0.54;
/**
 * Printed lines a card must hold to keep the tally and the barcode. At the
 * fitted size every card holds about 24; only a card so small that the
 * module's minimum type wins holds fewer, and there the notes come first.
 */
const FULL_FOOTER_LINES = 20;
/** The widest the author column grows, in characters, before a name is cut. */
const NAME_COLUMN_MAX_CH = 14;

/**
 * The torn edges: paper teeth on a transparent band, so whatever is behind
 * the card shows between them. The top band's teeth point up, the bottom's
 * down.
 */
function tearBand(up: boolean): string {
  const [a, b] = up ? [45, 315] : [135, 225];
  const tile = `0 0 / ${TEAR_EM}em ${TEAR_EM}em repeat-x`;
  return `linear-gradient(${a}deg, ${PAPER} 50%, transparent 50%) ${tile}, linear-gradient(${b}deg, ${PAPER} 50%, transparent 50%) ${tile}`;
}

/** The printed date and time line, in the household's zone. */
function stampOf(ctx: NotesContext): string {
  try {
    const date = new Intl.DateTimeFormat(ctx.locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: ctx.timezone }).format(ctx.now);
    const time = new Intl.DateTimeFormat(ctx.locale, { hour: 'numeric', minute: '2-digit', timeZone: ctx.timezone }).format(ctx.now);
    return `${date} · ${time}`;
  } catch {
    return '';
  }
}

/** A barcode of thin and thick bars, in whole pixels so the bars stay crisp. */
function barcode(fontPx: number): string {
  const k = Math.max(1, Math.round(fontPx / 24));
  const stops = [[0, 2], [4, 5], [9, 12]]
    .map(([from, to]) => `#111 ${from * k}px ${to * k}px, transparent ${to * k}px`)
    .join(', ');
  return `repeating-linear-gradient(90deg, ${stops} ${14 * k}px)`;
}

function Dash() {
  return <div aria-hidden="true" className="shrink-0" style={{ borderTop: `2px dashed ${RULE}`, margin: '0.67em 0' }} />;
}

/**
 * Receipt: a till roll of thermal paper with torn ends, printed in monospace
 * capitals. The heading centred, the date and time, then one row per note
 * with the author in a right-hand column, [PIN] before pinned rows and ***
 * before important ones; a total, the pinned and important tally, a barcode
 * and a thank-you. Rows fit whole; the rest are counted on a row of their own.
 */
export function ReceiptView({ ctx, all, shown, hidden, title, showTitle, padding, height }: MaterialViewProps) {
  const printPx = ctx.fontPx * PRINT_EM;
  const fullFooter = height <= 0 || height / (printPx * ROW_LINE) >= FULL_FOOTER_LINES;
  const boxRef = useRef<HTMLDivElement>(null);
  // The "and N more" row is printed after the last row, inside the measured
  // box, so its height is always kept free.
  const visible = useFitCount(
    boxRef,
    fitKeyOf(shown, ctx.fontPx, ctx.showAuthor, ctx.showAge, showTitle, fullFooter),
    printPx * (ROW_LINE + ROW_GAP),
  );
  const drawn = visible === null ? shown : shown.slice(0, visible);
  const more = hidden + shown.length - drawn.length;

  const rows = drawn.map((note) => {
    const author = authorOf(note, ctx.members, ctx.t);
    return { note, name: ctx.showAuthor ? author.name : '', authorId: author.id, age: ageOf(note, ctx) };
  });
  const columnCh = Math.min(
    NAME_COLUMN_MAX_CH,
    Math.max(3, ...rows.map((r) => Math.max(Array.from(r.name).length, Array.from(r.age).length))),
  );
  const pinnedCount = all.filter((n) => n.pinned).length;
  const importantCount = all.filter((n) => n.important).length;
  const stamp = stampOf(ctx);

  return (
    // The paper starts halfway into each torn band, under the band's solid
    // half, so no hairline of the wall shows where band and paper meet.
    <div className="relative flex flex-col flex-1 min-h-0" style={{ padding: `${TEAR_EM / 2}em 0` }}>
      <div aria-hidden="true" className="absolute left-0 right-0 top-0" style={{ height: `${TEAR_EM}em`, background: tearBand(true) }} />
      <div aria-hidden="true" className="absolute left-0 right-0 bottom-0" style={{ height: `${TEAR_EM}em`, background: tearBand(false) }} />
      <div
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
        style={{
          backgroundColor: PAPER,
          boxShadow: 'inset 0 0 50px rgba(0, 0, 0, 0.05)',
          padding: `calc(${padding}px + 0.4em)`,
          fontSize: `${PRINT_EM}em`,
          lineHeight: ROW_LINE,
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
        }}
      >
        {showTitle && (
          <div className="shrink-0 text-center truncate" style={{ fontSize: '1.6em', fontWeight: 700, letterSpacing: '0.12em', lineHeight: 1.25 }}>
            {title}
          </div>
        )}
        {stamp && <div className="shrink-0 text-center truncate">{stamp}</div>}
        <Dash />
        <div ref={boxRef} className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ gap: `${ROW_GAP}em` }}>
          {rows.map(({ note, name, authorId, age }) => (
            <div
              key={note.id}
              data-testid="notes-note"
              data-fit={note.id}
              data-important={note.important ? '' : undefined}
              data-pinned={note.pinned ? '' : undefined}
              className="flex shrink-0 min-w-0"
              style={{ gap: '0.67em', fontWeight: note.important ? 700 : 400 }}
            >
              <span className="flex-1 min-w-0 line-clamp-4" style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                {note.pinned && '[PIN] '}
                {note.important && '*** '}
                {note.text}
              </span>
              {(name || age) && (
                <span className="shrink-0 text-right" style={{ width: `${columnCh + 0.5}ch` }}>
                  {name && (
                    <span data-testid="notes-author" data-author={authorId ?? 'someone'} className="block truncate">
                      {name}
                    </span>
                  )}
                  {age && <span className="block truncate" style={{ opacity: 0.6, fontWeight: 400 }}>{age}</span>}
                </span>
              )}
            </div>
          ))}
          {more > 0 && (
            <div data-testid="notes-more" data-fit="more" className="shrink-0 truncate">
              {ctx.t('notes.andMore', { n: more })}
            </div>
          )}
        </div>
        <Dash />
        <div className="flex justify-between shrink-0" style={{ gap: '0.67em', fontWeight: 700, fontSize: '1.15em' }}>
          <span className="truncate">{ctx.t('notes.receiptTotal')}</span>
          <span className="shrink-0 whitespace-nowrap">{ctx.t('notes.count', { count: all.length })}</span>
        </div>
        {fullFooter && (
          <>
            <div className="shrink-0 truncate" style={{ marginTop: '0.54em' }}>
              {ctx.t('notes.receiptSummary', { pinned: pinnedCount, important: importantCount })}
            </div>
            <div
              aria-hidden="true"
              className="shrink-0"
              style={{ height: '2.3em', width: '70%', margin: '1.07em auto 0', background: barcode(ctx.fontPx) }}
            />
          </>
        )}
        <div className="shrink-0 text-center truncate" style={{ marginTop: '0.54em' }}>
          {ctx.t('notes.receiptThanks')}
        </div>
      </div>
    </div>
  );
}
