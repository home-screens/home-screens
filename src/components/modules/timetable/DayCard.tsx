'use client';

/**
 * The cards the Day view is made of: the header with the hour ruler, one card
 * per person (a row on the clock, or a column), and in columns the ruler card.
 *
 * Every block sits on the clock by its minutes: its position and its length
 * are shares of the axis, so the blocks never need the lane measured. The
 * colours follow the Week cells' three rules: a subject is tinted into the
 * card's own background, everything muted is `ink()`, and a chip filled with
 * the card's ink takes `onInk`.
 */

import type { CSSProperties } from 'react';
import { Backpack, CalendarDays, Check, House, Pencil, Sun, Utensils } from 'lucide-react';
import type { TimeFormat, TimetableDetail } from '@/types/config';
import type { WeekLetter } from '@/types/timetables';
import { smallPrintPx, type TimetableShed } from '@/lib/timetable-layout';
import { axisShare, tickLabel, type DayAxis, type FamilyDayBlock, type FamilyDayRow } from '@/lib/timetable-day';
import { careLineForm, DAY_LINE, nameFitsLine, wordsFit, type ColumnsGeometry, type DayGeometry, type RowsGeometry } from '@/lib/timetable-day-fit';
import { ink } from '@/lib/constants';
import { formatClockMinutes, formatClockTime } from '@/lib/clock-time';
import { pickGridTimeColor, pickPillTextColor } from '@/lib/calendar-color';
import { hyphenateSubjectName, SUBJECT_BREAK_MARKS } from '@/lib/timetable-subjects';
import { useTranslate } from '@/i18n';
import { SubjectIcon } from './cells';
import type { PersonEntry } from './useTimetablePeople';

export interface DayTokens {
  /** The card's background: what a subject colour is tinted into. */
  background: string;
  /** Legible text for a chip filled with the card's own ink. */
  onInk: string;
  /** The size the day is drawn at, which every pixel floor below is capped to. */
  base: number;
  timeFormat: TimeFormat;
  locale: string;
  detail: TimetableDetail;
  /** What the rows have given up: 1 drops the rooms and times, 2 the names. */
  shed: TimetableShed;
  /** One card's padding plus border, on one side, so a card knows its own inner width. */
  inset: number;
}

export interface DayPerson {
  entry: PersonEntry;
  row: FamilyDayRow;
  /** The course this person is mostly in; only a lesson in another one gets a badge. */
  usualCourse?: string;
}

type CellStyle = CSSProperties & Record<`--${string}`, string | number>;

/** A size in em with a pixel floor, capped at the day's own size. */
function atLeast(px: number, em: number, base: number): string {
  return `${smallPrintPx(base, { px, em }).toFixed(2)}px`;
}

const NOWRAP: CSSProperties = { whiteSpace: 'nowrap' };
const ELLIPSIS: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const TABULAR: CSSProperties = { fontVariantNumeric: 'tabular-nums' };

/** How much of the subject colour a lesson block carries, and its inset edge. */
const TINT = 34;
const EDGE = 60;

/** The line across the clock at the current time, with a dot where it meets the ruler. */
function NowLine({ nowShare, orientation, time }: { nowShare: number; orientation: 'rows' | 'columns'; time: string }) {
  const t = useTranslate('modules');
  const along = `${(nowShare * 100).toFixed(3)}%`;
  const line = `2px solid ${ink(1)}`;
  return (
    <div
      data-testid="timetable-now-line"
      role="img"
      aria-label={t('timetable.currentTime', { time })}
      style={{
        position: 'absolute',
        zIndex: 4,
        pointerEvents: 'none',
        filter: `drop-shadow(0 0 3px ${ink(0.7)})`,
        ...(orientation === 'rows'
          ? { top: '-0.2em', bottom: '-0.2em', left: along, width: 0, borderLeft: line }
          : { left: '-0.2em', right: '-0.2em', top: along, height: 0, borderTop: line }),
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: '0.5em',
          height: '0.5em',
          borderRadius: '50%',
          background: ink(1),
          ...(orientation === 'rows' ? { left: 'calc(-0.25em - 1px)', top: '-0.25em' } : { top: 'calc(-0.25em - 1px)', left: '-0.25em' }),
        }}
      />
    </div>
  );
}

/** The small print size the ruler and the time pill share. */
function rulerPx(base: number): number {
  return Math.max(15, 0.56 * base);
}

/**
 * The tick labels the time pill would sit on: a label within half the pill's
 * length (plus a little air) of the current time, along the ruler.
 */
function ticksUnderPill(axis: DayAxis, nowMin: number | null, orientation: 'rows' | 'columns', rulerLenPx: number, base: number, time: string): Set<number> {
  const hidden = new Set<number>();
  if (nowMin === null || rulerLenPx <= 0) return hidden;
  const px = rulerPx(base);
  // Along the ruler: the pill's width in rows, its height in columns.
  const pillPx = orientation === 'rows' ? time.length * 0.62 * px + 0.9 * px : 1.45 * px;
  const nowShare = axisShare(axis, nowMin);
  for (const tick of axis.ticks) {
    if (Math.abs(axisShare(axis, tick) - nowShare) * rulerLenPx < pillPx * 0.5 + (orientation === 'rows' ? 1.4 : 0.6) * px) hidden.add(tick);
  }
  return hidden;
}

/** The current time on the ruler, where the line meets it. */
function NowPill({ nowShare, orientation, tokens, time }: { nowShare: number; orientation: 'rows' | 'columns'; tokens: DayTokens; time: string }) {
  const along = `${(nowShare * 100).toFixed(3)}%`;
  return (
    <span
      data-testid="timetable-now-pill"
      aria-hidden="true"
      style={{
        position: 'absolute',
        zIndex: 5,
        ...(orientation === 'rows'
          ? { left: along, bottom: '0.2em', transform: 'translateX(-50%)' }
          : { top: along, left: '50%', transform: 'translate(-50%, -50%)' }),
        padding: '0.06em 0.45em 0.1em',
        borderRadius: 999,
        fontSize: `${rulerPx(tokens.base).toFixed(2)}px`,
        fontWeight: 750,
        background: ink(1),
        color: tokens.onInk,
        ...TABULAR,
        ...NOWRAP,
      }}
    >
      {time}
    </span>
  );
}

/** The one colour a test is marked in, on every surface: amber, with dark ink on it. */
const TEST_COLOR = '#fbbf24';
const TEST_INK = '#1c1917';

/** The three-column grid every row card and the header share: who, the clock, the end. */
function rowGrid(geometry: RowsGeometry, base: number): CSSProperties {
  return {
    display: 'grid',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    // The leading every line in the row head and the end column is budgeted
    // with; inherited from the wall it was 1.5, and the third line of a stack
    // went out of the bottom of the card.
    lineHeight: DAY_LINE,
    // The card wrapper sets the Style panel's own size on every card; the day
    // is drawn at the size the fit settled, so every em in here is of that.
    fontSize: `${base.toFixed(2)}px`,
    columnGap: `${geometry.gapPx.toFixed(1)}px`,
    gridTemplateColumns: `${geometry.whoPx.toFixed(1)}px minmax(0, 1fr) ${geometry.endPx.toFixed(1)}px`,
  };
}

function Avatar({ entry, em = 0.8 }: { entry: PersonEntry; em?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${1.7 * em}em`,
        height: `${1.7 * em}em`,
        flexShrink: 0,
        borderRadius: '50%',
        fontSize: `${0.88 * em}em`,
        fontWeight: 800,
        lineHeight: 1,
        background: entry.member.color,
        color: pickPillTextColor(entry.member.color),
      }}
    >
      {entry.member.name.slice(0, 1)}
    </span>
  );
}

/** The person's name in their colour, the class beside it. */
function NameRow({ entry, tokens, showClass }: { entry: PersonEntry; tokens: DayTokens; showClass: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4em', minWidth: 0, ...NOWRAP }}>
      <Avatar entry={entry} />
      <span
        data-testid="timetable-name"
        style={{
          fontSize: '1em',
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: pickGridTimeColor(entry.member.color, tokens.background),
          ...ELLIPSIS,
        }}
      >
        {entry.member.name}
      </span>
      {showClass && entry.timetable.className && (
        <span style={{ fontSize: atLeast(15, 0.56, tokens.base), fontWeight: 600, color: ink(0.58), flexShrink: 0 }}>
          {entry.timetable.className}
        </span>
      )}
    </div>
  );
}

/** "starts" and the first bell, or "off" on a closed day. */
function StartsLine({ row, tokens }: { row: FamilyDayRow; tokens: DayTokens }) {
  const t = useTranslate('modules');
  const small = atLeast(15, 0.56, tokens.base);
  if (row.closed !== undefined || !row.span) {
    return (
      <div style={{ marginTop: '0.08em', ...NOWRAP }}>
        <b style={{ fontSize: '1.12em', fontWeight: 750 }}>{t('timetable.free')}</b>
      </div>
    );
  }
  return (
    <div data-testid="timetable-day-start" style={{ display: 'flex', alignItems: 'baseline', gap: '0.3em', marginTop: '0.08em', ...NOWRAP }}>
      <span style={{ fontSize: small, fontWeight: 600, color: ink(0.62) }}>{t('timetable.startsWord')}</span>
      <b style={{ fontSize: '1.12em', fontWeight: 750, letterSpacing: '-0.01em', ...TABULAR }}>
        {formatClockTime(row.span.start, tokens.timeFormat)}
      </b>
    </div>
  );
}

/** "Done" and the last bell, the care line under it, and the usual end on a short day. */
function EndLines({ row, tokens, align, availablePx }: { row: FamilyDayRow; tokens: DayTokens; align: 'start' | 'center'; availablePx?: number }) {
  const t = useTranslate('modules');
  const small = atLeast(15, 0.56, tokens.base);
  const clock = (time: string) => formatClockTime(time, tokens.timeFormat);
  // A column foot too narrow for "OGS until 15:00" says "until 15:00": the
  // time is the half that matters, and the band on the clock names the care.
  let careLine: string | null = null;
  if (row.care) {
    const full = t('timetable.careUntil', { name: row.care.name, time: clock(row.care.until) });
    const short = t('timetable.careUntilShort', { time: clock(row.care.until) });
    careLine = availablePx === undefined || careLineForm(full.length, smallPrintPx(tokens.base, { px: 15, em: 0.56 }), availablePx) === 'full' ? full : short;
  }
  return (
    <>
      <span style={{ fontSize: small, fontWeight: 600, color: ink(0.62), ...NOWRAP }}>{t('timetable.endsWord')}</span>
      <b style={{ fontSize: align === 'center' ? '1.05em' : '1.12em', fontWeight: 750, letterSpacing: '-0.01em', ...TABULAR, ...NOWRAP }}>
        {row.span ? clock(row.span.end) : '–'}
      </b>
      {careLine && (
        <span style={{ fontSize: small, fontWeight: 600, color: ink(0.8), ...TABULAR, ...ELLIPSIS, maxWidth: '100%' }}>
          {careLine}
        </span>
      )}
      {row.usualEnd && (
        <span style={{ fontSize: atLeast(15, 0.52, tokens.base), color: ink(0.5), ...TABULAR, ...ELLIPSIS, maxWidth: '100%' }}>
          {t('timetable.usually', { time: clock(row.usualEnd) })}
        </span>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Blocks on the clock
// ---------------------------------------------------------------------------

/** The lesson's words at this Detail, less what the day has shed. */
function LessonBody({ block, tokens, icons, usualCourse, availablePx }: { block: FamilyDayBlock & { kind: 'lesson' }; tokens: DayTokens; icons: boolean; usualCourse?: string; availablePx: number }) {
  const t = useTranslate('modules');
  const names = tokens.detail !== 'less' && tokens.shed < 2;
  const subs = names && tokens.shed < 1;
  // The badge is a contrast marker, as on the Week card: the lessons that
  // differ from the course this person is mostly in.
  const badge = block.course && block.course !== usualCourse && tokens.detail !== 'less' ? (
    <span
      style={{
        display: 'inline-block',
        marginLeft: '0.25em',
        padding: '0.08em 0.32em',
        borderRadius: '0.3em',
        fontSize: atLeast(14, 0.46, tokens.base),
        fontWeight: 800,
        letterSpacing: '0.04em',
        verticalAlign: '0.3em',
        background: ink(0.88),
        color: tokens.onInk,
        ...NOWRAP,
      }}
    >
      {block.course}
    </span>
  ) : null;
  const subStyle: CSSProperties = {
    fontSize: atLeast(15, 0.54, tokens.base),
    color: ink(0.78),
    marginTop: '0.16em',
    maxWidth: '100%',
    ...TABULAR,
    ...ELLIPSIS,
  };
  // The name with its seams marked, as long as every part fits the block; a
  // part wider than the block is handed back to the browser's dictionary,
  // which breaks inside the word rather than clipping it (the Week card's
  // rule). Held to three lines: "Sach-unter-richt" is three.
  const marked = hyphenateSubjectName(block.subject.name, tokens.locale);
  const parts = marked.split(new RegExp(`[${SUBJECT_BREAK_MARKS.soft}${SUBJECT_BREAK_MARKS.zeroWidth}]`));
  const widest = Math.max(...parts.map((part, i) => part.length + (i < parts.length - 1 ? 1 : 0)));
  const partsFit = marked === block.subject.name
    || nameFitsLine(block.subject.name.length, widest, 0.8 * tokens.base, availablePx);
  const seamed = partsFit ? marked : block.subject.name;
  return (
    <>
      {icons && (
        <div style={{ fontSize: '0.72em', marginBottom: '0.12em', flexShrink: 0 }}>
          <SubjectIcon name={block.subject.icon} em={1} />
        </div>
      )}
      {names ? (
        <div
          style={{
            fontSize: '0.8em',
            fontWeight: 700,
            lineHeight: 1.05,
            maxWidth: '100%',
            hyphens: seamed === block.subject.name ? 'auto' : 'manual',
            overflowWrap: seamed === block.subject.name ? 'break-word' : 'normal',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 3,
            overflow: 'hidden',
          } as CSSProperties}
        >
          {seamed}
          {badge}
        </div>
      ) : (
        <div style={{ fontSize: '1em', fontWeight: 750, letterSpacing: '-0.005em', maxWidth: '100%', ...ELLIPSIS }}>
          {block.subject.code}
          {badge}
        </div>
      )}
      {subs && block.room && <div style={subStyle}>{t('timetable.room', { room: block.room })}</div>}
      {subs && tokens.detail === 'more' && (
        <div style={subStyle}>{formatClockTime(block.start, tokens.timeFormat)}</div>
      )}
      {block.off && (
        <div style={{ fontSize: atLeast(14, 0.5, tokens.base), fontWeight: 700, marginTop: '0.14em', ...NOWRAP }}>
          {block.off === 'cancelled' ? t('timetable.cancelled') : t('timetable.notToday')}
        </div>
      )}
      {block.test !== undefined && (
        <>
          <div style={{ fontSize: atLeast(14, 0.5, tokens.base), fontWeight: 750, color: TEST_COLOR, marginTop: '0.14em', ...NOWRAP }}>
            {block.test || t('timetable.test')}
          </div>
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
              fontSize: atLeast(15, 0.56, tokens.base),
              background: TEST_COLOR,
              color: TEST_INK,
              boxShadow: '0 0 0 2px rgba(0,0,0,0.3)',
            }}
          >
            <Pencil size="0.75em" strokeWidth={2.6} />
          </span>
        </>
      )}
    </>
  );
}

/**
 * One block on the clock: a lesson in its subject's tint, a free period, the
 * lunch break, or the after-school care band in the person's own colour.
 */
function Block({
  block,
  tokens,
  entry,
  usualCourse,
  place,
  orientation,
  lanePx,
}: {
  block: FamilyDayBlock;
  tokens: DayTokens;
  entry: PersonEntry;
  usualCourse?: string;
  /** In rows the lane's width; in columns the column's inner width. */
  lanePx: number;
  /** Where the block sits and how long it is, as shares of the lane. */
  place: { from: number; to: number };
  orientation: 'rows' | 'columns';
}) {
  const t = useTranslate('modules');
  const insetPx = Math.max(2, 0.08 * tokens.base);
  // The width the block's words have: its share of the lane less the inset
  // and padding, in rows; the column's inner width less padding, in columns.
  const availablePx = orientation === 'rows'
    ? lanePx * (place.to - place.from) - insetPx * 2 - 0.68 * tokens.base
    : lanePx - 0.68 * tokens.base;
  const along = orientation === 'rows'
    ? {
        left: `calc(${(place.from * 100).toFixed(3)}% + ${insetPx.toFixed(1)}px)`,
        width: `calc(${((place.to - place.from) * 100).toFixed(3)}% - ${(insetPx * 2).toFixed(1)}px)`,
        top: 0,
        bottom: 0,
      }
    : {
        top: `calc(${(place.from * 100).toFixed(3)}% + ${insetPx.toFixed(1)}px)`,
        height: `calc(${((place.to - place.from) * 100).toFixed(3)}% - ${(insetPx * 2).toFixed(1)}px)`,
        left: 0,
        right: 0,
      };
  const base: CSSProperties = {
    position: 'absolute',
    ...along,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    minWidth: 0,
    overflow: 'hidden',
    padding: orientation === 'rows' ? '0.18em 0.34em' : '0.12em 0.34em',
    lineHeight: 1.06,
    textAlign: 'left',
    borderRadius: 8,
  };
  if (block.off) {
    base.opacity = 0.4;
    base.filter = 'saturate(0.5)';
  }

  if (block.kind === 'lesson') {
    return (
      <div
        data-testid="timetable-day-block"
        data-kind="lesson"
        data-periods={block.periods.join(',')}
        data-off={block.off}
        data-test={block.test !== undefined ? 'true' : undefined}
        style={{
          ...base,
          '--c': block.subject.color,
          background: `color-mix(in srgb, var(--c) ${TINT}%, ${tokens.background})`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--c) ${EDGE}%, transparent)`,
        } as CellStyle}
      >
        <LessonBody block={block} tokens={tokens} icons={entry.timetable.icons === true && tokens.shed === 0} usualCourse={usualCourse} availablePx={availablePx} />
      </div>
    );
  }
  if (block.kind === 'free') {
    return (
      <div
        data-testid="timetable-day-block"
        data-kind="free"
        style={{ ...base, boxShadow: `inset 0 0 0 1.5px ${ink(0.22)}` }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.07,
            backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 6px, currentcolor 6px 12px)',
          }}
        />
        <span style={{ position: 'relative', fontSize: atLeast(15, 0.56, tokens.base), fontWeight: 650, color: ink(0.66), ...NOWRAP }}>
          {t('timetable.free')}
        </span>
      </div>
    );
  }
  if (block.kind === 'lunch') {
    return (
      <div
        data-testid="timetable-day-block"
        data-kind="lunch"
        style={{
          ...base,
          alignItems: 'center',
          color: ink(0.62),
          background: ink(0.09),
          boxShadow: `inset 0 0 0 1px ${ink(0.1)}`,
        }}
      >
        <Utensils size="0.7em" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div
      data-testid="timetable-day-block"
      data-kind="care"
      style={{
        ...base,
        '--m': entry.member.color,
        justifyContent: orientation === 'rows' ? 'center' : 'flex-start',
        paddingTop: orientation === 'rows' ? undefined : '0.4em',
        color: ink(0.86),
        background:
          'repeating-linear-gradient(135deg, color-mix(in srgb, var(--m) 16%, transparent) 0 10px, color-mix(in srgb, var(--m) 9%, transparent) 10px 20px)',
        boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--m) 38%, transparent)',
      } as CellStyle}
    >
      <b style={{ display: 'flex', alignItems: 'center', gap: '0.3em', fontSize: atLeast(16, 0.62, tokens.base), fontWeight: 700, ...NOWRAP }}>
        <House size="1em" aria-hidden="true" />
        {block.label}
      </b>
      <span style={{ fontSize: atLeast(15, 0.54, tokens.base), fontWeight: 600, color: ink(0.7), marginTop: '0.1em', ...TABULAR, ...NOWRAP }}>
        {t('timetable.careUntilShort', { time: formatClockTime(block.end, tokens.timeFormat) })}
      </span>
    </div>
  );
}

/** The lane the blocks sit on: its wash, its hour lines, and the blocks themselves. */
function Lane({
  person,
  axis,
  share,
  tokens,
  orientation,
  lanePx,
  nowMin,
}: {
  person: DayPerson;
  axis: DayAxis;
  share: (minutes: number) => number;
  tokens: DayTokens;
  orientation: 'rows' | 'columns';
  /** The lane's length in rows, or the column's inner width in columns. */
  lanePx: number;
  /** The current minute, while the card shows today and the clock is inside the axis. */
  nowMin: number | null;
}) {
  const { row, entry, usualCourse } = person;
  const rows = orientation === 'rows';
  const lines = axis.ticks.filter((tick) => tick > axis.startMin && tick < axis.endMin);
  const surviving = row.blocks.filter((b) => b.kind === 'lesson' && !b.off);
  const lastEnd = surviving.length ? share(surviving[surviving.length - 1].endMin) : null;
  const cut = row.cutAt ? share(parseClock(row.cutAt)) : null;
  // A dotted leader runs from the last lesson to the end of the clock on a day
  // that ends early, so an early finish reads as an early finish and not as a
  // row that ran out of lessons.
  const leader = lastEnd !== null && cut === null && lastEnd < 1 - (rows ? 0.04 : 0.02);

  return (
    <div
      data-testid="timetable-day-lane"
      style={{
        position: 'relative',
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        borderRadius: 10,
        background: ink(0.05),
      }}
    >
      {lines.map((tick) => (
        <div
          key={tick}
          aria-hidden="true"
          style={
            rows
              ? { position: 'absolute', top: 0, bottom: 0, left: `${(share(tick) * 100).toFixed(3)}%`, width: 0, borderLeft: `1px dashed ${ink(0.16)}` }
              : { position: 'absolute', left: 0, right: 0, top: `${(share(tick) * 100).toFixed(3)}%`, height: 0, borderTop: `1px dashed ${ink(0.16)}` }
          }
        />
      ))}
      {row.blocks.map((block, index) => (
        <Block
          key={`${block.kind}-${index}`}
          block={block}
          tokens={tokens}
          entry={entry}
          usualCourse={usualCourse}
          place={{ from: share(block.startMin), to: share(block.endMin) }}
          orientation={orientation}
          lanePx={lanePx}
        />
      ))}
      {cut !== null && (
        <div
          data-testid="timetable-day-cut"
          aria-hidden="true"
          style={
            rows
              ? { position: 'absolute', top: '-0.3em', bottom: '-0.3em', left: `${(cut * 100).toFixed(3)}%`, width: 0, borderLeft: `3px dashed ${ink(1)}`, zIndex: 3 }
              : { position: 'absolute', left: '-0.3em', right: '-0.3em', top: `${(cut * 100).toFixed(3)}%`, height: 0, borderTop: `3px dashed ${ink(1)}`, zIndex: 3 }
          }
        />
      )}
      {nowMin !== null && (
        <NowLine nowShare={share(nowMin)} orientation={orientation} time={formatClockMinutes(nowMin, tokens.timeFormat)} />
      )}
      {leader && lastEnd !== null && (
        <div
          aria-hidden="true"
          style={
            rows
              ? { position: 'absolute', top: '50%', left: `calc(${(lastEnd * 100).toFixed(3)}% + 0.35em)`, right: '0.35em', height: 0, borderTop: `2.5px dotted ${ink(0.3)}` }
              : { position: 'absolute', left: '50%', top: `calc(${(lastEnd * 100).toFixed(3)}% + 0.35em)`, bottom: '0.15em', width: 0, borderLeft: `2.5px dotted ${ink(0.3)}` }
          }
        />
      )}
    </div>
  );
}

function parseClock(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** A day school is shut: the reason, across the whole lane. */
function ClosedLane({ label, tokens }: { label: string; tokens: DayTokens }) {
  const t = useTranslate('modules');
  return (
    <div
      data-testid="timetable-day-closed"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5em',
        height: '100%',
        minWidth: 0,
        padding: '0 0.8em',
        borderRadius: 10,
        background: `repeating-linear-gradient(135deg, transparent 0 8px, ${ink(0.06)} 8px 16px)`,
        boxShadow: `inset 0 0 0 1.5px ${ink(0.18)}`,
        ...NOWRAP,
      }}
    >
      <Sun size="0.9em" aria-hidden="true" style={{ color: '#fcd34d', flexShrink: 0 }} />
      <b style={{ fontSize: '0.8em', fontWeight: 700, ...ELLIPSIS }}>{label || t('timetable.noSchool')}</b>
      {label && <span style={{ fontSize: atLeast(15, 0.56, tokens.base), color: ink(0.66), ...ELLIPSIS }}>{t('timetable.noSchool')}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------

export interface DayHeaderCardProps {
  /** "Today", "Tomorrow" or the weekday. */
  pill: string;
  /** The date, in the display's language. */
  title: string;
  weekLetter?: WeekLetter;
  weekNumber: number;
  /** The short day's banner, when one school ends early. */
  banner?: string;
  axis: DayAxis;
  geometry: DayGeometry;
  tokens: DayTokens;
  /** The current minute, while the card shows today and the clock is inside the axis. */
  nowMin?: number | null;
}

/** The card over everything: which day, the week, and in rows the hour ruler. */
export function DayHeaderCard({ pill, title, weekLetter, weekNumber, banner, axis, geometry, tokens, nowMin = null }: DayHeaderCardProps) {
  const t = useTranslate('modules');
  const rows = geometry.orientation === 'rows';
  const top = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4em', minWidth: 0, ...NOWRAP }}>
      <span
        data-testid="timetable-day-pill"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0.1em 0.6em 0.14em',
          borderRadius: 999,
          fontSize: '0.72em',
          fontWeight: 750,
          background: ink(1),
          color: tokens.onInk,
          flexShrink: 0,
        }}
      >
        {pill}
      </span>
      <span data-testid="timetable-day-title" style={{ fontSize: '0.92em', fontWeight: 700, letterSpacing: '-0.01em', ...ELLIPSIS }}>
        {title}
      </span>
      {banner && (
        <span
          data-testid="timetable-day-banner"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4em',
            marginLeft: '0.8em',
            padding: '0.16em 0.75em 0.2em',
            borderRadius: 999,
            fontSize: atLeast(16, 0.6, tokens.base),
            fontWeight: 700,
            background: '#fbbf24',
            color: '#1c1917',
            ...ELLIPSIS,
          }}
        >
          <CalendarDays size="1em" aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={ELLIPSIS}>{banner}</span>
        </span>
      )}
    </div>
  );
  const week = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45em', justifyContent: 'flex-end', ...NOWRAP }}>
      <span style={{ fontSize: atLeast(15, 0.52, tokens.base), color: ink(0.58), ...TABULAR }}>
        {t('timetable.weekNumber', { number: String(weekNumber) })}
      </span>
      {weekLetter && (
        <span
          data-testid="timetable-week-label"
          style={{
            fontSize: atLeast(16, 0.62, tokens.base),
            fontWeight: 750,
            padding: '0.12em 0.6em 0.16em',
            borderRadius: 999,
            background: ink(0.16),
          }}
        >
          {t('timetable.weekLetter', { letter: weekLetter })}
        </span>
      )}
    </div>
  );

  if (!rows) {
    return (
      <div data-testid="timetable-day-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1em', height: '100%', minWidth: 0, lineHeight: DAY_LINE, fontSize: `${tokens.base.toFixed(2)}px` }}>
        {top}
        {week}
      </div>
    );
  }
  const g = geometry as RowsGeometry;
  const nowTime = nowMin === null ? '' : formatClockMinutes(nowMin, tokens.timeFormat);
  const covered = ticksUnderPill(axis, nowMin, 'rows', g.lanePx, tokens.base, nowTime);
  return (
    <div data-testid="timetable-day-header" style={{ ...rowGrid(g, tokens.base), gridTemplateRows: '56% 44%' }}>
      <div style={{ gridColumn: '1 / 3', gridRow: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>{top}</div>
      <div style={{ gridColumn: 3, gridRow: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>{week}</div>
      <div data-testid="timetable-day-ruler" style={{ gridColumn: 2, gridRow: 2, position: 'relative', minWidth: 0 }}>
        {axis.ticks.filter((tick) => !covered.has(tick)).map((tick) => (
          <span
            key={tick}
            style={{
              position: 'absolute',
              left: `${(axisShare(axis, tick) * 100).toFixed(3)}%`,
              bottom: '0.32em',
              transform: 'translateX(-50%)',
              fontSize: atLeast(15, 0.56, tokens.base),
              fontWeight: 600,
              color: ink(0.62),
              ...TABULAR,
              ...NOWRAP,
            }}
          >
            {tickLabel(tick, tokens.timeFormat)}
          </span>
        ))}
        {nowMin !== null && <NowPill nowShare={axisShare(axis, nowMin)} orientation="rows" tokens={tokens} time={nowTime} />}
      </div>
    </div>
  );
}

export interface DayPersonCardProps {
  person: DayPerson;
  axis: DayAxis;
  share: (minutes: number) => number;
  geometry: DayGeometry;
  tokens: DayTokens;
  nowMin?: number | null;
}

/** One person's row on the clock: who, the lane, when they are done. */
export function DayRowCard({ person, axis, share, geometry, tokens, nowMin = null }: DayPersonCardProps) {
  const g = geometry as RowsGeometry;
  const { entry, row } = person;
  const closed = row.closed !== undefined;
  return (
    <div
      data-testid="timetable-day-row"
      data-member={entry.member.id}
      data-closed={closed ? 'true' : undefined}
      style={rowGrid(g, tokens.base)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.2em', minWidth: 0 }}>
        <NameRow entry={entry} tokens={tokens} showClass={tokens.detail !== 'less'} />
        {tokens.detail === 'more' && (
          <div style={{ fontSize: atLeast(15, 0.56, tokens.base), fontWeight: 600, color: ink(0.58), ...ELLIPSIS }}>
            {entry.school.name}
          </div>
        )}
        <StartsLine row={row} tokens={tokens} />
      </div>
      {closed ? (
        <ClosedLane label={row.closed ?? ''} tokens={tokens} />
      ) : (
        <Lane person={person} axis={axis} share={share} tokens={tokens} orientation="rows" lanePx={g.lanePx} nowMin={nowMin} />
      )}
      <div
        data-testid="timetable-day-end"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          gap: '0.12em',
          minWidth: 0,
          paddingLeft: '0.7em',
          borderLeft: `2px solid ${ink(0.22)}`,
        }}
      >
        <EndLines row={row} tokens={tokens} align="start" />
      </div>
    </div>
  );
}

/** The narrow card on the left in columns, carrying the hour labels. */
export function DayRulerCard({ axis, geometry, tokens, nowMin = null }: { axis: DayAxis; geometry: DayGeometry; tokens: DayTokens; nowMin?: number | null }) {
  const g = geometry as ColumnsGeometry;
  const nowTime = nowMin === null ? '' : formatClockMinutes(nowMin, tokens.timeFormat);
  const covered = ticksUnderPill(axis, nowMin, 'columns', g.lanePx, tokens.base, nowTime);
  return (
    <div data-testid="timetable-day-ruler" style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, fontSize: `${tokens.base.toFixed(2)}px` }}>
      <div style={{ height: `${(g.cheadPx + g.laneGapPx).toFixed(1)}px`, flexShrink: 0 }} />
      <div style={{ position: 'relative', height: `${g.lanePx.toFixed(1)}px`, flexShrink: 0 }}>
        {axis.ticks.filter((tick) => !covered.has(tick)).map((tick) => (
          <span
            key={tick}
            style={{
              position: 'absolute',
              left: '50%',
              top: `${(axisShare(axis, tick) * 100).toFixed(3)}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: atLeast(15, 0.56, tokens.base),
              fontWeight: 600,
              color: ink(0.62),
              ...TABULAR,
              ...NOWRAP,
            }}
          >
            {tickLabel(tick, tokens.timeFormat)}
          </span>
        ))}
        {nowMin !== null && <NowPill nowShare={axisShare(axis, nowMin)} orientation="columns" tokens={tokens} time={nowTime} />}
      </div>
    </div>
  );
}

/** What goes in the bag, as pills. Shared by the strip and the column heads. */
export function BringPills({ row, tokens, closedWord, availablePx }: { row: FamilyDayRow; tokens: DayTokens; closedWord?: boolean; availablePx?: number }) {
  const t = useTranslate('modules');
  const size = atLeast(15, 0.56, tokens.base);
  // "nothing special" in a column head too narrow for the words is the tick
  // alone: a cut-off "nothing spec" says less than the tick does.
  const wordsRoom = availablePx === undefined || wordsFit(t('timetable.bringNothing').length, smallPrintPx(tokens.base, { px: 15, em: 0.56 }), availablePx);
  if (row.closed !== undefined && closedWord) {
    return (
      <span data-testid="timetable-pack-none" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3em', fontSize: size, fontWeight: 600, color: ink(0.6), ...NOWRAP }}>
        <Sun size="1em" aria-hidden="true" />
        {t('timetable.noSchool')}
      </span>
    );
  }
  // The subjects' items first, then the day's one-off things, then its tests.
  const pills = [
    ...row.bring.map((text) => ({ kind: 'bring' as const, text })),
    ...row.extras.map((extra) => ({ kind: extra.kind, text: extra.kind === 'test' ? extra.text || t('timetable.test') : extra.text })),
  ];
  if (pills.length === 0) {
    return (
      <span data-testid="timetable-pack-none" title={t('timetable.bringNothing')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3em', fontSize: size, fontWeight: 600, color: ink(0.6), maxWidth: '100%', ...NOWRAP }}>
        <Check size="1em" aria-hidden="true" style={{ flexShrink: 0 }} />
        {wordsRoom && <span style={ELLIPSIS}>{t('timetable.bringNothing')}</span>}
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25em 0.3em', minWidth: 0 }}>
      {pills.map((pill, index) => (
        <span
          key={`${pill.kind}-${pill.text}-${index}`}
          data-testid={pill.kind === 'test' ? 'timetable-pack-test' : 'timetable-bring'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.28em',
            fontSize: size,
            fontWeight: 700,
            padding: '0.12em 0.55em 0.14em',
            borderRadius: 999,
            background: pill.kind === 'test' ? TEST_COLOR : ink(0.9),
            color: pill.kind === 'test' ? TEST_INK : tokens.onInk,
            maxWidth: '100%',
            ...NOWRAP,
          }}
        >
          {pill.kind === 'test'
            ? <Pencil size="1em" aria-hidden="true" style={{ flexShrink: 0 }} />
            : <Backpack size="1em" aria-hidden="true" style={{ flexShrink: 0 }} />}
          <span style={ELLIPSIS}>{pill.text}</span>
        </span>
      ))}
    </div>
  );
}

/** One person's column: the head with the bag, the lane down the clock, the end at the foot. */
export function DayColumnCard({ person, axis, share, geometry, tokens, nowMin = null }: DayPersonCardProps) {
  const g = geometry as ColumnsGeometry;
  const { entry, row } = person;
  const closed = row.closed !== undefined;
  return (
    <div
      data-testid="timetable-day-row"
      data-member={entry.member.id}
      data-closed={closed ? 'true' : undefined}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, lineHeight: DAY_LINE, fontSize: `${tokens.base.toFixed(2)}px` }}
    >
      <div style={{ height: `${g.cheadPx.toFixed(1)}px`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.22em', minWidth: 0, overflow: 'hidden' }}>
        <NameRow entry={entry} tokens={tokens} showClass={tokens.detail !== 'less'} />
        <StartsLine row={row} tokens={tokens} />
        <div data-testid="timetable-pack" data-member={entry.member.id} style={{ minWidth: 0 }}>
          <BringPills row={row} tokens={tokens} closedWord availablePx={g.colPx - tokens.inset * 2} />
        </div>
      </div>
      <div style={{ height: `${g.laneGapPx.toFixed(1)}px`, flexShrink: 0 }} />
      <div style={{ height: `${g.lanePx.toFixed(1)}px`, flexShrink: 0, minWidth: 0 }}>
        {closed ? (
          <ClosedLane label={row.closed ?? ''} tokens={tokens} />
        ) : (
          <Lane person={person} axis={axis} share={share} tokens={tokens} orientation="columns" lanePx={g.colPx - tokens.inset * 2} nowMin={nowMin} />
        )}
      </div>
      <div style={{ flex: '1 1 auto', minHeight: 0 }} />
      <div
        data-testid="timetable-day-end"
        style={{
          height: `${g.cendPx.toFixed(1)}px`,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '0.08em',
          paddingTop: '0.3em',
          borderTop: `2px solid ${ink(0.22)}`,
          minWidth: 0,
        }}
      >
        <EndLines row={row} tokens={tokens} align="center" availablePx={g.colPx - tokens.inset * 2} />
      </div>
    </div>
  );
}
