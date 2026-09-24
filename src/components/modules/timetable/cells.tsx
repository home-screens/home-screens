'use client';

/**
 * The five cell shapes a week card draws, and the chips that sit inside them.
 *
 * Every one of these renders a cell the layout library has already settled:
 * what to print, which treatment it gets and how many rows it covers are all
 * decided in `timetable-layout.ts`. The only decisions left here are colour,
 * size and the words.
 *
 * Three colour rules shape the file:
 *
 * - A subject tint is mixed into the card's own background rather than into
 *   black, so a light card tints toward white and a dark one toward black
 *   without a second set of values.
 * - Everything muted is `ink()`, which mixes the card's text colour instead of
 *   assuming the text is white.
 * - A chip filled with the card's ink (a course badge, a packing chip) takes
 *   `onInk` for its text, which is the legible opposite of that ink.
 */

import type { CSSProperties, ReactNode } from 'react';
import { Backpack, Pencil, Utensils } from 'lucide-react';
import { subjectIcon } from '@/components/timetable/subject-icons';
import type { TimeFormat } from '@/types/config';
import {
  CARD_TEXT,
  estimateTextPx,
  FOLD_GAP_EM,
  smallPrintPx,
  type CareCardCell,
  type FoldedCardCell,
  type FreeCardCell,
  type LessonCardCell,
  type LunchCardCell,
} from '@/lib/timetable-layout';
import { ink } from '@/lib/constants';
import { formatClockTime } from '@/lib/clock-time';
import { useLocale, useTranslate } from '@/i18n';
import { hyphenateSubjectName } from '@/lib/timetable-subjects';

/** Style object that may also carry the subject colour custom property. */
type CellStyle = CSSProperties & Record<`--${string}`, string | number>;

/** What every cell needs to know about the card it is drawn on. */
export interface CardTokens {
  /** The card's background: what a subject colour is tinted into. */
  background: string;
  /** Legible text for a chip filled with the card's own ink. */
  onInk: string;
  /** The card is tight, so cells lose their padding and their decorations. */
  narrow: boolean;
  /** The size the card is drawn at, which every floor below is capped to. */
  base: number;
  /** How much width a cell has in each kind of column, in CSS pixels. */
  columnPx: { focus: number; quiet: number };
  /** Lines a label is held to when drawn, per kind of column. */
  clamp: { focus: number; quiet: number };
  timeFormat: TimeFormat;
}

/**
 * A size in em of the card, with a pixel floor under it and the card's own
 * size over it.
 *
 * The floor is there because small print on a five-across card would otherwise
 * fall under what reads from a few steps away. The ceiling is there because a
 * floor with no ceiling takes over: on a short card the day names were drawn
 * at nearly three times the size of the lessons they annotate, so the card's
 * least important text was its biggest. The arithmetic is the layout's, so the
 * size a card budgets for a line is the size that line is drawn at.
 */
export function atLeast(px: number, em: number, base: number): string {
  return `${smallPrintPx(base, { px, em }).toFixed(2)}px`;
}

/** Text that gives up its end rather than its middle, or a leading digit. */
const ELLIPSIS: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' };

/** A label held to the lines the card budgeted for it, losing its tail if longer. */
export function clampLines(lines: number): CSSProperties {
  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: Math.max(1, Math.round(lines)),
    overflow: 'hidden',
  } as CSSProperties;
}

/**
 * A line in a cell's stack that keeps its own height.
 *
 * A flex item's automatic minimum size only holds while its overflow is
 * visible, so clipping a line to give it an ellipsis also made it squashable:
 * in a cell shorter than its contents the label was flattened and cut top and
 * bottom instead of the cell overflowing where the fit can see it.
 */
const KEEPS_HEIGHT: CSSProperties = { flexShrink: 0 };

/** How much of the subject colour a lesson cell carries, and its inset edge. */
const TINT = { focus: 34, quiet: 27 } as const;
const EDGE = { focus: 60, quiet: 42 } as const;

/**
 * The subject's picture, tinted halfway toward the card's ink so it reads as
 * part of the cell rather than a second colour fighting the tint.
 */
export function SubjectIcon({ name, em }: { name: string; em: number }) {
  const Icon = subjectIcon(name);
  return (
    <Icon
      size={`${em}em`}
      aria-hidden="true"
      style={{ color: 'color-mix(in srgb, var(--c) 55%, currentcolor)', flexShrink: 0 }}
    />
  );
}

/** The box every cell shares: centred, clipped, and never wider than its column. */
function blockStyle(tokens: CardTokens): CSSProperties {
  return {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    padding: tokens.narrow ? '0.08em 0.03em' : '0.1em 0.18em',
    lineHeight: 1.08,
  };
}

/** The roomy left-aligned treatment the focus column gets when it has the width. */
const RICH_BOX: CSSProperties = {
  alignItems: 'flex-start',
  textAlign: 'left',
  padding: '0.16em 0.45em',
};

/** What to pack for this lesson, on a chip the colour of the card's ink. */
export function BringChip({ text, tokens }: { text: string; tokens: CardTokens }) {
  return (
    <span
      data-testid="timetable-bring"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.28em',
        marginTop: `${CARD_TEXT.chip.gapEm}em`,
        padding: '0.12em 0.5em',
        borderRadius: 999,
        fontSize: atLeast(CARD_TEXT.chip.px, CARD_TEXT.chip.em, tokens.base),
        fontWeight: 700,
        whiteSpace: 'nowrap',
        background: ink(0.9),
        color: tokens.onInk,
        maxWidth: '100%',
      }}
    >
      <Backpack size="1em" aria-hidden="true" />
      <span style={ELLIPSIS}>{text}</span>
    </span>
  );
}

/** The course group this lesson is in, when it differs from the usual one. */
function CourseBadge({ course, tokens }: { course: string; tokens: CardTokens }) {
  return (
    <span
      style={{
        marginLeft: '0.25em',
        padding: '0.1em 0.35em',
        borderRadius: '0.3em',
        fontSize: atLeast(CARD_TEXT.badge.px, CARD_TEXT.badge.em, tokens.base),
        fontWeight: 800,
        letterSpacing: '0.04em',
        verticalAlign: '0.35em',
        background: ink(0.88),
        color: tokens.onInk,
        // Two letters are one thing. It sits inside a label that has to be
        // allowed to break, and it inherited that: "LK" broke between its own
        // letters and the two halves were painted over the name above them.
        whiteSpace: 'nowrap',
        overflowWrap: 'normal',
      }}
    >
      {course}
    </span>
  );
}

/** The one colour a test is marked in, on every surface: amber, with dark ink on it. */
const TEST_COLOR = '#fbbf24';
const TEST_INK = '#1c1917';

/** A pencil in the corner of a lesson with a test that day. */
function TestFlag({ base }: { base: number }) {
  return (
    <span
      data-testid="timetable-test-flag"
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '0.2em',
        right: '0.2em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '1.25em',
        height: '1.25em',
        borderRadius: '50%',
        fontSize: atLeast(15, 0.56, base),
        background: TEST_COLOR,
        color: TEST_INK,
        boxShadow: '0 0 0 2px rgba(0,0,0,0.3)',
      }}
    >
      <Pencil size="0.75em" strokeWidth={2.6} />
    </span>
  );
}

/** The word under a lesson that is off by a note, or the test's name under one that has a test. */
function NoteLine({ text, color, base }: { text: string; color: string; base: number }) {
  return (
    <div
      style={{
        marginTop: '0.14em',
        fontSize: atLeast(14, 0.5, base),
        fontWeight: 750,
        color,
        whiteSpace: 'nowrap',
        maxWidth: '100%',
        ...ELLIPSIS,
        ...KEEPS_HEIGHT,
      }}
    >
      {text}
    </div>
  );
}

/** The week letter, on a lesson the other week changes. */
function WeekBadge({ letter, base }: { letter: string; base: number }) {
  return (
    <span
      data-testid="timetable-week-badge"
      style={{
        position: 'absolute',
        right: '0.25em',
        bottom: '0.25em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '1.35em',
        height: '1.35em',
        borderRadius: '0.35em',
        fontSize: atLeast(15, 0.56, base),
        fontWeight: 800,
        lineHeight: 1,
        boxShadow: `inset 0 0 0 1.5px ${ink(0.7)}`,
      }}
    >
      {letter}
    </span>
  );
}

/**
 * The label as it is drawn.
 *
 * A name the language knows the seams of carries an invisible mark at each
 * one, so it breaks where the word is made rather than wherever the line
 * happens to fill. A name nobody listed, which is most of what a household
 * types, comes back untouched.
 */
function drawnLabel(
  label: string,
  labelStyleKind: 'code' | 'name',
  locale: string,
  /** The width the label is drawn in, and the size it is drawn at, in pixels. */
  availablePx: number,
  fontPx: number,
): { text: string; seamed: boolean } {
  if (labelStyleKind !== 'name') return { text: label, seamed: false };
  const text = hyphenateSubjectName(label, locale);
  if (text === label) return { text, seamed: false };
  // A seam only helps while the parts it makes fit the column. `hyphens:
  // manual` forbids every dictionary break, so where a part is still too wide
  // the browser falls back to breaking anywhere with no hyphen at all, which
  // reads worse than the syllable breaks it would have made on its own.
  const longest = Math.max(...text.split(/[­​]/).map((part) => part.length));
  if (estimateTextPx(longest, fontPx) > availablePx) return { text: label, seamed: false };
  return { text, seamed: true };
}

/** The subject label: a short code, or the name with the room under it. */
function labelStyle(
  labelStyleKind: 'code' | 'name',
  scale: number,
  seamed: boolean,
  lines: number,
): CSSProperties {
  if (labelStyleKind === 'code') {
    return {
      fontSize: `${scale}em`,
      fontWeight: 700,
      letterSpacing: scale < 1 ? '-0.02em' : '-0.005em',
      whiteSpace: 'nowrap',
      // A code is one short word with nothing shorter behind it, so a column
      // that still cannot hold it gives up one end rather than both: centred
      // and clipped, "WiPo" lost a character at each edge.
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      ...KEEPS_HEIGHT,
    };
  }
  return {
    fontSize: '0.8em',
    fontWeight: 680,
    lineHeight: 1.06,
    maxWidth: '100%',
    // A name whose seams are marked breaks only at them; anything else keeps
    // the automatic hyphenation of the page's language, which is all a name
    // typed at the kitchen table has to go on.
    hyphens: seamed ? 'manual' : 'auto',
    overflowWrap: 'break-word',
    // Held to the lines the card left height for. Over them the name used to
    // push its own picture out of the top of the cell and the room out of the
    // bottom; now it loses its tail, which is visibly a truncation.
    ...clampLines(lines),
    ...KEEPS_HEIGHT,
  };
}

export function LessonCell({
  cell,
  focusDay,
  tokens,
}: {
  cell: LessonCardCell;
  /** Lessons on the lit day keep the brighter tint, wide column or not. */
  focusDay: boolean;
  tokens: CardTokens;
}) {
  const locale = useLocale();
  const t = useTranslate('modules');
  const quiet = !focusDay;
  const style: CellStyle = {
    ...blockStyle(tokens),
    ...(cell.rich ? RICH_BOX : null),
    '--c': cell.subject.color,
    borderRadius: 8,
    background: `color-mix(in srgb, var(--c) ${quiet ? TINT.quiet : TINT.focus}%, ${tokens.background})`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--c) ${quiet ? EDGE.quiet : EDGE.focus}%, transparent)`,
  };

  const badge = cell.course ? <CourseBadge course={cell.course} tokens={tokens} /> : null;

  // "204" on its own is a number with no noun, so the room is named wherever
  // the column was measured to have the width for the word.
  const roomText = cell.room === undefined
    ? null
    : cell.roomWord
      ? t('timetable.room', { room: cell.room })
      : cell.room;

  const availablePx = cell.rich ? tokens.columnPx.focus : tokens.columnPx.quiet;
  const labelPx = (cell.labelStyle === 'name' && !cell.rich ? 0.8 : 1) * tokens.base;

  let body: ReactNode;
  if (cell.rich) {
    // The card has already left room for however many lines it says the name
    // may take, so a name too long for the column breaks at its seam rather
    // than losing its end.
    const wraps = cell.labelLines > 1;
    const rich = drawnLabel(cell.label, cell.labelStyle, locale, availablePx, labelPx);
    body = (
      <>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3em',
            maxWidth: '100%',
            fontSize: '1em',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            whiteSpace: wraps ? 'normal' : 'nowrap',
          }}
        >
          {cell.showIcon && <SubjectIcon name={cell.subject.icon} em={0.84} />}
          <span
            style={
              wraps
                ? {
                    minWidth: 0,
                    hyphens: rich.seamed ? 'manual' : 'auto',
                    overflowWrap: 'break-word',
                    // Two lines is what the cell's height was budgeted for. A
                    // name that wants a third used to take it, and the room
                    // line under it went past the bottom of the cell.
                    ...clampLines(tokens.clamp.focus),
                  }
                : { overflow: 'hidden', textOverflow: 'ellipsis' }
            }
          >
            {wraps ? rich.text : cell.label}
          </span>
          {badge}
        </div>
        {[
          roomText,
          cell.timeRange
            ? `${formatClockTime(cell.timeRange.start, tokens.timeFormat)}–${formatClockTime(cell.timeRange.end, tokens.timeFormat)}`
            : null,
        ]
          .filter((line): line is string => line !== null)
          .map((line) => (
            <div
              key={line}
              style={{
                marginTop: `${CARD_TEXT.detail.gapEm}em`,
                fontSize: atLeast(CARD_TEXT.detail.px, CARD_TEXT.detail.em, tokens.base),
                color: ink(0.8),
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
                maxWidth: '100%',
                ...ELLIPSIS,
                ...KEEPS_HEIGHT,
              }}
            >
              {line}
            </div>
          ))}
        {cell.bring && <BringChip text={cell.bring} tokens={tokens} />}
      </>
    );
  } else {
    const drawn = drawnLabel(cell.label, cell.labelStyle, locale, availablePx, labelPx);
    body = (
      <>
        {cell.showIcon && (
          <div style={{ marginBottom: '0.14em', fontSize: '0.78em', opacity: 0.92, flexShrink: 0 }}>
            <SubjectIcon name={cell.subject.icon} em={1} />
          </div>
        )}
        <div style={labelStyle(cell.labelStyle, cell.labelScale, drawn.seamed, tokens.clamp.quiet)}>
          {drawn.text}
          {badge}
        </div>
        {roomText !== null && (
          <div
            style={{
              marginTop: `${CARD_TEXT.room.gapEm}em`,
              fontSize: atLeast(CARD_TEXT.room.px, CARD_TEXT.room.em, tokens.base),
              color: ink(0.72),
              whiteSpace: 'nowrap',
              // A room at the store's 16-character cap is wider than a quiet
              // column. Centred and clipped it lost both ends, so
              // "Naturwetenschap" read "turwetensch"; now it keeps its start.
              maxWidth: '100%',
              ...ELLIPSIS,
              ...KEEPS_HEIGHT,
            }}
          >
            {roomText}
          </div>
        )}
      </>
    );
  }

  return (
    <div
      data-testid="timetable-cell"
      data-kind="lesson"
      data-periods={cell.periods.join(',')}
      data-test={cell.test !== undefined ? 'true' : undefined}
      data-cancelled={cell.cancelled ? 'true' : undefined}
      style={style}
    >
      {body}
      {cell.test !== undefined && <NoteLine text={cell.test || t('timetable.test')} color={TEST_COLOR} base={tokens.base} />}
      {cell.cancelled && <NoteLine text={t('timetable.cancelled')} color={ink(1)} base={tokens.base} />}
      {cell.test !== undefined && <TestFlag base={tokens.base} />}
      {cell.weekBadge && <WeekBadge letter={cell.weekBadge} base={tokens.base} />}
    </div>
  );
}

export function FreeCell({ cell, tokens }: { cell: FreeCardCell; tokens: CardTokens }) {
  const t = useTranslate('modules');
  const word = t('timetable.free');
  return (
    <div
      data-testid="timetable-cell"
      data-kind="free"
      data-periods={cell.periods.join(',')}
      style={{
        ...blockStyle(tokens),
        ...(cell.rich ? RICH_BOX : null),
        borderRadius: 8,
        boxShadow: `inset 0 0 0 1.5px ${ink(0.22)}`,
      }}
    >
      {/* The hatch is drawn on its own layer at low opacity: a gradient stop
          that mixes colours would change how the whole gradient interpolates,
          so the stop stays a plain `currentcolor`. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.07,
          backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 6px, currentcolor 6px 12px)',
        }}
      />
      {cell.rich ? (
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: '1em', fontWeight: 650, color: ink(0.7) }}>{word}</div>
          {cell.lateStart && (
            <div
              data-testid="timetable-late-start"
              style={{
                marginTop: '0.1em',
                fontSize: atLeast(CARD_TEXT.late.px, CARD_TEXT.late.em, tokens.base),
                color: ink(0.8),
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
                maxWidth: '100%',
                ...ELLIPSIS,
                ...KEEPS_HEIGHT,
              }}
            >
              {/* Spanish says "empieza a las 08:40", the longest of the seven,
                  and the time is the half that matters: where the words do not
                  fit the cell, the time stands on its own. */}
              {cell.lateStartWord === false
                ? formatClockTime(cell.lateStart, tokens.timeFormat)
                : t('timetable.lateStart', { time: formatClockTime(cell.lateStart, tokens.timeFormat) })}
            </div>
          )}
        </div>
      ) : (
        <span style={{ position: 'relative', fontSize: '0.72em', fontWeight: 600, color: ink(0.6) }}>
          {word}
        </span>
      )}
    </div>
  );
}

export function LunchCell({ cell, tokens }: { cell: LunchCardCell; tokens: CardTokens }) {
  const t = useTranslate('modules');
  return (
    <div
      data-testid="timetable-cell"
      data-kind="lunch"
      data-periods={cell.periods.join(',')}
      style={{
        ...blockStyle(tokens),
        borderRadius: 8,
        fontSize: '0.7em',
        fontWeight: 600,
        color: ink(0.62),
        background: ink(0.09),
        boxShadow: `inset 0 0 0 1px ${ink(0.1)}`,
      }}
    >
      <Utensils size="1em" aria-hidden="true" />
      {cell.showLabel && <span style={{ marginTop: '0.15em' }}>{t('timetable.lunch')}</span>}
    </div>
  );
}

export function CareCell({ cell, tokens }: { cell: CareCardCell; tokens: CardTokens }) {
  const t = useTranslate('modules');
  const time = formatClockTime(cell.until, tokens.timeFormat);
  const named = cell.form === 'full';
  return (
    <div
      data-testid="timetable-cell"
      data-kind="care"
      data-form={cell.form}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: named ? 'flex-start' : 'center',
        minWidth: 0,
        overflow: 'hidden',
        paddingLeft: named ? '0.6em' : 0,
        borderRadius: 8,
        fontSize: atLeast(CARD_TEXT.care.px, CARD_TEXT.care.em, tokens.base),
        fontWeight: 600,
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
        color: named ? ink(0.9) : ink(0.68),
        background: ink(0.07),
        boxShadow: `inset 0 0 0 1px ${ink(0.09)}`,
      }}
    >
      {/* The band is empty rather than wrong where not even the time fits: the
          gutter's own label names the care, and a centred clipped clause read
          "s 16:0", which is neither a word nor a time. The pick-up time is the
          last thing to go, and it keeps its start. */}
      {cell.form !== 'none' && (
        <span style={ELLIPSIS}>
          {cell.form === 'full'
            ? t('timetable.careUntil', { name: cell.careName, time })
            : cell.form === 'short'
              ? t('timetable.careUntilShort', { time })
              : time}
        </span>
      )}
    </div>
  );
}

/**
 * The afternoon, folded into one short row.
 *
 * Two lessons on the same afternoon share the row side by side, each keeping
 * its own colour, so a fold never hides which subject is which.
 */
export function FoldedCell({
  cell,
  focusDay,
  tokens,
}: {
  cell: FoldedCardCell;
  focusDay: boolean;
  tokens: CardTokens;
}) {
  const locale = useLocale();
  const quiet = !focusDay;
  return (
    <div
      data-testid="timetable-cell"
      data-kind="folded"
      // The gap the layout took off each entry's width before choosing what it
      // could print, so the two cannot drift apart.
      style={{ display: 'flex', gap: `${FOLD_GAP_EM}em`, minWidth: 0, minHeight: 0 }}
    >
      {cell.entries.map((entry) => {
        // The width this entry really has, worked out with the words: a share
        // of the column was not it, because one lesson with the afternoon to
        // itself has the whole of it and the gap between two is real.
        const drawn = drawnLabel(
          entry.label,
          entry.labelStyle,
          locale,
          cell.widthPx,
          (entry.labelStyle === 'name' ? 0.8 : 1) * tokens.base,
        );
        const style: CellStyle = {
          ...blockStyle(tokens),
          '--c': entry.subject.color,
          flex: '1 1 0',
          borderRadius: 8,
          background: `color-mix(in srgb, var(--c) ${quiet ? TINT.quiet : TINT.focus}%, ${tokens.background})`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--c) ${quiet ? EDGE.quiet : EDGE.focus}%, transparent)`,
        };
        return (
          <div key={entry.periods.join('-')} data-periods={entry.periods.join(',')} style={style}>
            {entry.showIcon && (
              <div style={{ marginBottom: '0.14em', fontSize: '0.78em', opacity: 0.92, flexShrink: 0 }}>
                <SubjectIcon name={entry.subject.icon} em={1} />
              </div>
            )}
            <div style={labelStyle(entry.labelStyle, entry.labelScale, drawn.seamed, cell.labelLines)}>
              {drawn.text}
            </div>
            {entry.showTime && <div
              data-testid="timetable-folded-time"
              style={{
                marginTop: '0.08em',
                fontSize: atLeast(CARD_TEXT.room.px, CARD_TEXT.room.em, tokens.base),
                color: ink(0.78),
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
                // Centred and clipped this lost its leading digit: "2:10 PM"
                // came out as ":10 PM", which is a plausible wrong time.
                maxWidth: '100%',
                ...ELLIPSIS,
                ...KEEPS_HEIGHT,
              }}
            >
              {formatClockTime(entry.start, tokens.timeFormat)}
            </div>}
            {entry.bring && <BringChip text={entry.bring} tokens={tokens} />}
          </div>
        );
      })}
    </div>
  );
}

/** A day school is shut: the whole column says so once, instead of five empty cells. */
export function ClosedCell({ label, tokens }: { label: string; tokens: CardTokens }) {
  const t = useTranslate('modules');
  return (
    <div
      data-testid="timetable-cell"
      data-kind="closed"
      style={{
        ...blockStyle(tokens),
        borderRadius: 8,
        fontSize: '0.72em',
        fontWeight: 600,
        color: ink(0.55),
        background: ink(0.03),
      }}
    >
      {/* The column is the full height of the card, so a long holiday name
          uses two or three lines of it rather than being squeezed onto one and
          ellipsised: "Christi Himmel..." was the whole of a column forty lines
          tall. */}
      <span
        style={{
          maxWidth: '100%',
          overflowWrap: 'break-word',
          hyphens: 'auto',
          ...clampLines(3),
          ...KEEPS_HEIGHT,
        }}
      >
        {label || t('timetable.noSchool')}
      </span>
    </div>
  );
}
