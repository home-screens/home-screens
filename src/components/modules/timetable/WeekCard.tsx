'use client';

/**
 * One person's school week, drawn from the model `timetable-layout.ts` builds.
 *
 * The card decides nothing about the week itself: the rows, the lit column,
 * every cell's treatment and every grid span arrive settled. What happens here
 * is words. It asks the layout library how wide the lit column may be at the
 * size it has been given, and prints the model in the display's language.
 *
 * Its box and its type size both come from the module. Neither used to: each
 * card measured itself and settled its own size, and a row of brothers and
 * sisters came out at five different sizes and shed a different number of
 * words each. The whole row agrees on one answer now, and one place has to
 * hold it.
 */

import { useCallback, useMemo } from 'react';
import { Backpack, House, Pencil, Sun, X } from 'lucide-react';
import type { ModuleStyle, TimeFormat, TimetableDetail } from '@/types/config';
import type { FamilyMember } from '@/types/family';
import type { Timetable, TimetableSchool, TimetableSubject } from '@/types/timetables';
import { DAY_KEYS } from '@/types/timetables';
import {
  bandTrackPx,
  BAND_LINE,
  buildRows,
  cardMetrics,
  cardModel,
  careTrackPx,
  cellWidthPx,
  smallPrintPx,
  longestCourseBadge,
  longestSubjectLabel,
  CARD_TEXT,
  DAY_ROW,
  FOLD_ROW_FR,
  FOOTER_ROW,
  ROW_GAP_PX,
  type FocusResolution,
  type HolidayLineForm,
  type TimetableCardModel,
  type TimetableRow,
  type TimetableRowFacts,
  type TimetableShed,
  type TimetableWords,
  type WeekDifference,
} from '@/lib/timetable-layout';
import { ink } from '@/lib/constants';
import { formatClockTime } from '@/lib/clock-time';
import { parseISODate } from '@/lib/todo-due-labels';
import { pickGridTimeColor, pickPillTextColor } from '@/lib/calendar-color';
import { dayMonthPattern, dayOfMonthPattern, formatDateSync, fullDatePattern, useFormattingLocale, useTranslate } from '@/i18n';
import {
  atLeast,
  clampLines,
  CareCell,
  ClosedCell,
  FoldedCell,
  FreeCell,
  LessonCell,
  LunchCell,
  type CardTokens,
} from './cells';

/** Row one holds the day names, so the model's first row is grid row two. */
const FIRST_ROW = 2;

/** The one colour a test is marked in, on every surface: amber, with dark ink on it. */
const TEST_COLOR = '#fbbf24';
const TEST_INK = '#1c1917';

export interface WeekCardProps {
  member: Pick<FamilyMember, 'id' | 'name' | 'color'>;
  timetable: Timetable;
  school: TimetableSchool;
  subjects: readonly TimetableSubject[];
  detail: TimetableDetail;
  /** Which week and which day the card draws, resolved once for every card. */
  focus: FocusResolution;
  /** The word before the lit day's date: "today", or the day's own name. */
  focusWord: string;
  /** The card's style: the module's, with the heading taken off. */
  style: ModuleStyle;
  showStartTimes?: boolean;
  timeFormat: TimeFormat;
  /** The box the module lays this card out in, inside its padding and border. */
  box: { width: number; height: number };
  /** The size every card in the row draws at, Text size and the floor included. */
  fontSize: number;
  /** What the row gives up to draw at that size. */
  shed: TimetableShed;
  /** The header row the whole module settles its day line against. */
  row: TimetableRowFacts;
}

/**
 * The height of one row of the grid, by what the row holds.
 *
 * The two fixed tracks are in pixels rather than em, because the labels inside
 * them have pixel floors of their own: an 0.8em track under a 15px label is
 * shorter than the label, and the row centres it, so "Pause" lost its
 * ascenders top and bottom on every card.
 */
function rowTrack(row: TimetableRow, base: number): string {
  if (row.kind === 'break') return `${bandTrackPx(base).toFixed(1)}px`;
  if (row.kind === 'care') return `${careTrackPx(base).toFixed(1)}px`;
  if (row.kind === 'fold') return `minmax(0, ${FOLD_ROW_FR}fr)`;
  return 'minmax(0, 1fr)';
}

export default function WeekCard({
  member,
  timetable,
  school,
  subjects,
  detail,
  focus,
  focusWord,
  style,
  showStartTimes,
  timeFormat,
  box,
  fontSize: agreed,
  shed,
  row,
}: WeekCardProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();

  // Everything the columns depend on that is not the box: the rows this week
  // has, the longest name the lit column may print, whether that name has a
  // picture beside it, and whether the footer also has two weeks to explain.
  // The box arrives inside the card's padding, so the geometry has none left
  // to subtract.
  const metrics = useMemo(
    () =>
      cardMetrics({
        cardWidth: box.width,
        cardHeight: box.height,
        baseFontSize: agreed,
        detail,
        shed,
        padding: 0,
        dayCount: DAY_KEYS.length,
        showStartTimes,
        timeFormat,
        rows: buildRows(timetable, school, detail).rows,
        longestLabelChars: longestSubjectLabel(timetable, subjects),
        courseChars: longestCourseBadge(timetable),
        focusIcon: timetable.icons === true || detail !== 'less',
        icons: timetable.icons === true,
        hasLegend: detail === 'more' && timetable.weeks.B !== undefined,
      }),
    [box.width, box.height, agreed, detail, shed, showStartTimes, timeFormat, timetable, school, subjects],
  );

  const on = useCallback(
    (iso: string, pattern: string): string => {
      const date = parseISODate(iso);
      return date ? formatDateSync(date, pattern, { locale }) : '';
    },
    [locale],
  );

  // German and Danish write the day of the month as an ordinal, with a point
  // after the number; English and French write the bare number. The pattern
  // comes from the language rather than from a string so every locale gets
  // the one it writes.
  const dayNumber = dayOfMonthPattern(locale);
  // Which of the day and the month leads is also the language's own business:
  // English puts the month first ("November 2"), German and French the day
  // ("2. November", "2 novembre"). Composing the day token with a month by hand
  // chose day-first for everybody and got the default locale wrong.
  const dayWithMonth = dayMonthPattern(locale, 'short');
  const fullDate = fullDatePattern(locale, 'long');

  /**
   * School is out, in one of three forms: the whole sentence with the day
   * school starts again written the long way, the same sentence with a short
   * date, and the two facts on their own, which is all five cards across have
   * the width for. All three are composed here so the layout can measure them:
   * the holiday and the date are the only facts the line carries, so the
   * choice between the forms has to be made before anything is drawn rather
   * than by an ellipsis afterwards.
   */
  const holidaySentence = useCallback(
    (form: HolidayLineForm): string => {
      if (!focus.holiday) return '';
      const backOn = parseISODate(focus.holiday.backOn);
      const pattern = form === 'full' ? fullDate : dayWithMonth;
      return t(form === 'brief' ? 'timetable.holidayBrief' : 'timetable.holidayLine', {
        holiday: focus.holiday.name,
        date: backOn ? formatDateSync(backOn, pattern, { locale }) : focus.holiday.backOn,
      });
    },
    [focus.holiday, locale, t, fullDate, dayWithMonth],
  );

  // The card budgets for sentences it cannot read: "Ends at 13:15",
  // "Room 204", "Today Thu 10." and "OGS until 16:00" are composed here, in
  // the display's language, so their lengths are measured here and handed
  // down. A word with a value in it is measured with the value taken out and
  // the spaces it sat between put back.
  const wordsOf = useCallback(
    (key: string, values: Record<string, string>, spaces: number): number =>
      t(key, values).replace(/\s+/g, ' ').trim().length + spaces,
    [t],
  );

  const words = useMemo<TimetableWords>(
    () => {
      const heads = DAY_KEYS.map((day) => ({
        name: on(focus.dayDates[day], 'EEEEEE').length,
        number: on(focus.dayDates[day], dayNumber).length,
        month: on(focus.dayDates[day], dayWithMonth).length,
      }));
      return {
        endCap: wordsOf('timetable.endsAt', { time: '' }, 1),
        room: wordsOf('timetable.room', { room: '' }, 1),
        careFull: wordsOf('timetable.careUntil', { name: '', time: '' }, 2),
        careShort: wordsOf('timetable.careUntilShort', { time: '' }, 1),
        lateStart: wordsOf('timetable.lateStart', { time: '' }, 1),
        timeRange: wordsOf('timetable.timeRange', { start: '', end: '' }, 2),
        focusWord: focusWord.length,
        dayName: Math.max(...heads.map((h) => h.name)),
        dayNumber: Math.max(...heads.map((h) => h.number)),
        dayHead: Math.max(...heads.map((h) => h.name + h.month)),
        holidayFull: holidaySentence('full').length,
        holidayShort: holidaySentence('short').length,
        holidayBrief: holidaySentence('brief').length,
      };
    },
    [wordsOf, on, focus.dayDates, dayNumber, dayWithMonth, focusWord, holidaySentence],
  );

  const model: TimetableCardModel = useMemo(
    () =>
      cardModel({ member, timetable, school, subjects, detail, focus, metrics, showStartTimes, timeFormat, words, row, shed }),
    [member, timetable, school, subjects, detail, focus, metrics, showStartTimes, timeFormat, words, row, shed],
  );

  // The size the row agreed on, drawn as it is. There used to be a fit under
  // it that measured the drawn card and shrank it, and it is what broke the
  // row: a card asked for more than it could hold was rescued one card at a
  // time, so five cards in one module were rescued to five different sizes.
  // The size is worked out before anything is drawn now, in
  // `resolveCardFontSize`, where the whole row can share one answer.
  const fontSize = agreed;

  const tokens: CardTokens = {
    background: style.backgroundColor,
    onInk: pickPillTextColor(style.textColor),
    narrow: metrics.narrow,
    // The size the card is really drawn at, which is what an em inside a cell
    // resolves against and therefore what every pixel floor is capped to.
    base: fontSize,
    columnPx: { focus: cellWidthPx(metrics, true), quiet: cellWidthPx(metrics, false) },
    clamp: metrics.labelClamp,
    timeFormat,
  };

  const clock = (time: string) => formatClockTime(time, timeFormat);

  /** What the gutter's times are drawn at: their floor, or less if it will not fit. */
  const timeSize = `${metrics.gutterTimePx.toFixed(1)}px`;

  /**
   * Lines the care band's own name may take in column one.
   *
   * A break band spans the whole card and its label has room to spare; the
   * care band does not, and column one is two and a half em wide, so any care
   * name past about four characters was cut mid-word. Its row is tall enough
   * for a second line at most card sizes, and a name that reads is worth more
   * than a tidy single line.
   */
  const careLabelLines = Math.max(
    1,
    Math.min(2, Math.floor(careTrackPx(fontSize) / (smallPrintPx(fontSize, CARD_TEXT.band) * BAND_LINE))),
  );

  /**
   * The school week this card is in, as a badge beside the class.
   *
   * It used to be one shared line above the cards, which cost the module a band
   * of its own height that no other module on the wall takes. Per card it costs
   * one character, it is right for a household whose two schools are on
   * different letters, and it is where the signed-off frames drew it anyway.
   */
  const weekBadge = school.weekCycle.mode === 'parity' ? model.weekLetter : null;

  /**
   * School is out, on a line of its own under the name.
   *
   * Not in the name row beside it: at three cards across, the sentence and the
   * name competed for one row and both lost, "Leon" down to "Le…". The times
   * this card shows belong to the first day back, which is no use to anybody
   * without the sentence that says why they are a fortnight away, so the
   * sentence is worth the line it takes and only takes it while school is out.
   */
  const holidayLine = model.holiday ? holidaySentence(model.holiday.form) : null;

  /** The line at the top right of the card: when this day starts and ends. */
  let meta: string;
  if (model.header.closedLabel !== undefined) {
    meta = model.header.closedLabel || t('timetable.noSchool');
  } else if (!model.header.span) {
    meta = t('timetable.noSchool');
  } else if (model.header.compact) {
    // Nothing but the times fits, so the day's name and the care clause go.
    meta = `${clock(model.header.span.start)}–${clock(model.header.span.end)}`;
  } else {
    const range = t('timetable.timeRange', {
      start: clock(model.header.span.start),
      end: clock(model.header.span.end),
    });
    const parts = [`${focusWord} ${range}`];
    if (model.header.care) {
      parts.push(
        t('timetable.careUntil', {
          name: model.header.care.name,
          time: clock(model.header.care.until),
        }),
      );
    }
    meta = parts.join(' · ');
  }

  const legendLine = (difference: WeekDifference): string => {
    const periods =
      difference.periods.length > 1
        ? t('timetable.periodRange', {
            from: difference.periods[0],
            to: difference.periods[difference.periods.length - 1],
          })
        : t('timetable.period', { number: difference.periods[0] });
    const date = model.days.find((d) => d.day === difference.day)?.date ?? '';
    return t('timetable.abLegend', {
      day: on(date, 'EEEEEE'),
      periods,
      subjectA: difference.a?.name ?? t('timetable.free'),
      subjectB: difference.b?.name ?? t('timetable.free'),
    });
  };

  // No packing line at all on a day school is shut: there is nothing to bring
  // for a day that is not happening, and "nothing special" is still an answer
  // to a question nobody asked.
  const packing = model.footer?.bring
    ? model.footer.bring.length
      ? model.footer.bring
      : [t('timetable.bringNothing')]
    : [];

  return (
    <div
      data-testid="timetable-card"
      data-member={model.member.id}
      data-detail={model.detail}
      data-week={model.weekLetter}
      data-focus-day={model.header.focusDay}
      className="w-full h-full overflow-hidden"
      style={{ fontSize: `${fontSize}px` }}
    >
      <div className="flex flex-col h-full min-h-0">
        {/* Who this card is for, and when their day runs. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.42em',
            marginBottom: '0.4em',
            minWidth: 0,
            flexShrink: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '1.7em',
              height: '1.7em',
              flexShrink: 0,
              borderRadius: '50%',
              fontSize: '0.88em',
              fontWeight: 800,
              background: model.member.color,
              color: pickPillTextColor(model.member.color),
            }}
          >
            {model.member.initials}
          </span>
          <span
            data-testid="timetable-name"
            style={{
              fontSize: '1.25em',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: pickGridTimeColor(model.member.color, style.backgroundColor),
              // The name and the sentence beside it share one flex line, and
              // an even split let both lose text at once: five cards across
              // drew five single initials. The name is the only thing that
              // tells one card from another, so it gives way last, and only
              // past half the row once the sentence has gone entirely.
              flexShrink: 1,
              maxWidth: model.header.hideMeta ? '100%' : '60%',
            }}
          >
            {model.member.name}
          </span>
          {model.className && model.header.showClass && (
            <span style={{ fontSize: '0.72em', fontWeight: 600, color: ink(0.55), flexShrink: 0 }}>
              {model.className}
            </span>
          )}
          {weekBadge && model.header.showBadge && (
            <span
              data-testid="timetable-week-label"
              title={t('timetable.weekLetter', { letter: weekBadge })}
              style={{
                flexShrink: 0,
                borderRadius: 999,
                padding: '0.05em 0.5em',
                fontSize: '0.7em',
                fontWeight: 800,
                background: ink(0.13),
                color: ink(0.8),
              }}
            >
              {weekBadge}
            </span>
          )}
          {!model.header.hideMeta && <span
            data-testid="timetable-meta"
            style={{
              marginLeft: 'auto',
              paddingLeft: '0.4em',
              fontSize: atLeast(CARD_TEXT.meta.px, CARD_TEXT.meta.em, fontSize),
              color: ink(0.7),
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
              // This line now carries a whole sentence during a school holiday.
              // Unclipped it would push the header row wider than the card, and
              // the fit would read that as a card that cannot fit at any size.
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              // It has already shed its words by measurement, so what is left
              // is a time range the name must not be cut for.
              flexShrink: 100,
            }}
          >
            {meta}
          </span>}
        </div>

        {holidayLine && (
          <div
            data-testid="timetable-holiday"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35em',
              marginBottom: '0.4em',
              flexShrink: 0,
              minWidth: 0,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              fontSize: atLeast(CARD_TEXT.holiday.px, CARD_TEXT.holiday.em, fontSize),
              fontWeight: 600,
              color: ink(0.82),
            }}
          >
            <Sun size="1em" aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{holidayLine}</span>
          </div>
        )}

        {/* A week nobody has filled in has no grid to draw. Pressing Add in the
            editor saves one and autosaves it, so this is the first thing a
            household ever sees from this module: it says so in a line rather
            than drawing five empty columns with the day names pinned to the
            bottom edge, and it is not "no school", which is what a day the
            school is shut says. */}
        {model.emptyWeek ? (
          <div
            data-testid="timetable-empty-week"
            style={{
              display: 'flex',
              flex: '1 1 auto',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 0,
              minWidth: 0,
              padding: '0 0.5em',
              textAlign: 'center',
              fontSize: atLeast(CARD_TEXT.meta.px, CARD_TEXT.meta.em, fontSize),
              fontWeight: 600,
              color: ink(0.6),
            }}
          >
            <span style={{ maxWidth: '100%', overflowWrap: 'break-word', ...clampLines(2) }}>
              {t('timetable.noLessonsYet')}
            </span>
          </div>
        ) : (
          <>
        <div
          data-testid="timetable-grid"
          style={{
            position: 'relative',
            display: 'grid',
            flex: '1 1 auto',
            minHeight: 0,
            // The gap the columns were measured against, so a cell is drawn
            // in the width it was told it had.
            columnGap: metrics.columnGapPx,
            rowGap: ROW_GAP_PX,
            gridTemplateRows: ['auto', ...model.rows.map((row) => rowTrack(row, fontSize))].join(' '),
            gridTemplateColumns: [
              // Pixels, not em: the gutter is as wide as the times inside it
              // need, and those stop shrinking with the card at their floor.
              `${metrics.gutterPx.toFixed(1)}px`,
              ...model.days.map(
                (day) => `minmax(0, ${day.isFocus ? metrics.focusRatio.toFixed(2) : '1'}fr)`,
              ),
            ].join(' '),
          }}
        >
          {/* The lit day's wash, painted first so every cell sits on top of it.
              It reaches past its column on a spread rather than on a negative
              margin: a margin puts those few pixels into the card's scroll
              height, the fit reads them as a card that does not fit, and every
              card shrinks by several percent for a decoration. */}
          <div
            aria-hidden="true"
            style={{
              gridRow: '1 / -1',
              gridColumn: model.focusIndex + FIRST_ROW,
              borderRadius: 8,
              background: ink(0.08),
              boxShadow: `0 0 0 3px ${ink(0.08)}`,
            }}
          />

          {model.days.map((day, index) => {
            const short = on(day.date, 'EEEEEE');
            const number = on(day.date, day.showMonth ? dayWithMonth : dayNumber);
            // The lit day keeps its date even where the quiet columns give
            // theirs up for width, because it is the one column somebody is
            // reading and "Thu" on its own does not say which Thursday. What
            // it may not do is keep half of it: the column has been measured
            // for the whole date, and a sliced "Do 10." reads as the 1st.
            const dated = day.showDate;
            return (
              <div
                key={day.day}
                data-testid="timetable-day"
                data-day={day.day}
                data-focus={day.isFocus ? 'true' : 'false'}
                style={{
                  gridRow: 1,
                  gridColumn: index + FIRST_ROW,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  minWidth: 0,
                  overflow: 'hidden',
                  padding: '0 0 0.3em',
                  fontSize: atLeast(DAY_ROW.px, DAY_ROW.em, fontSize),
                  fontWeight: 650,
                  whiteSpace: 'nowrap',
                  color: ink(0.58),
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35em', maxWidth: '100%' }}>
                  {/* "Today" beside the date earns its place; "Monday" beside
                      a pill reading "Mo 14" is the same word twice, and the
                      module header already says the card has turned the page. */}
                  {day.isFocus && model.header.focusWord && (
                    <span style={{ fontWeight: 700, color: ink(0.86) }}>{focusWord}</span>
                  )}
                  {day.isFocus ? (
                    <span
                      data-testid="timetable-focus-pill"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25em',
                        // A fifth of the pill is padding, so the padding is
                        // what it gives up first to keep the date whole.
                        padding: model.header.pill === 'full' ? '0.12em 0.62em' : '0.12em 0.3em',
                        borderRadius: 999,
                        fontWeight: 750,
                        background: model.header.pill === 'none' ? 'transparent' : ink(1),
                        color: model.header.pill === 'none' ? ink(0.95) : tokens.onInk,
                      }}
                    >
                      {short}
                      {dated && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{number}</span>}
                    </span>
                  ) : (
                    <>
                      {short}
                      {dated && (
                        <span style={{ fontWeight: 500, opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>
                          {number}
                        </span>
                      )}
                    </>
                  )}
                </span>
                {day.shortLabel && (
                  <span
                    style={{
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontSize: '0.8em',
                      fontWeight: 500,
                      color: ink(0.45),
                    }}
                  >
                    {day.shortLabel}
                  </span>
                )}
              </div>
            );
          })}

          {/* Column one: the period numbers, and the bands that cross the card. */}
          {model.gutter.map((cell, index) => {
            const row = model.rows[index];
            const band = row.kind === 'break' || row.kind === 'care';
            return (
              <div
                key={`${row.kind}-${index}`}
                data-testid="timetable-gutter"
                data-row-kind={row.kind}
                style={{
                  gridRow: index + FIRST_ROW,
                  gridColumn: row.kind === 'break' ? '1 / -1' : 1,
                  display: 'flex',
                  alignItems: band ? 'center' : undefined,
                  flexDirection: band ? 'row' : 'column',
                  justifyContent: band ? undefined : 'center',
                  gap: band ? '0.5em' : undefined,
                  minWidth: 0,
                  paddingLeft: band ? undefined : '0.06em',
                  lineHeight: band ? undefined : 1.02,
                  // The gutter is built to an estimate of how wide a clock time
                  // is, and an estimate can be wrong: a face the registry does
                  // not ship, a substitution on the Pi, a browser rounding a
                  // zoomed preview. Unclipped, being wrong by two pixels paints
                  // the time across the first lesson of the row, on every row.
                  overflow: 'hidden',
                }}
              >
                {band ? (
                  <>
                    <span
                      style={{
                        fontSize: atLeast(CARD_TEXT.band.px, CARD_TEXT.band.em, fontSize),
                        fontWeight: 650,
                        whiteSpace: row.kind === 'care' ? 'normal' : 'nowrap',
                        overflowWrap: 'break-word',
                        color: ink(0.52),
                        // The row is as tall as this line box and no taller,
                        // so the leading is stated here rather than inherited:
                        // the 1.5 it used to inherit put the label's ascenders
                        // outside the row on every card.
                        lineHeight: BAND_LINE,
                        // The care band's own name lives in this column, so it
                        // takes the second line its row has room for and gives
                        // up its end visibly only past that.
                        minWidth: 0,
                        ...(row.kind === 'care'
                          ? clampLines(careLabelLines)
                          : { overflow: 'hidden', textOverflow: 'ellipsis' }),
                      }}
                    >
                      {cell.kind === 'band' ? cell.label : ''}
                    </span>
                    <span
                      aria-hidden="true"
                      style={{ flex: 1, borderTop: `1.5px dashed ${ink(0.17)}` }}
                    />
                  </>
                ) : (
                  <>
                    <b style={{ fontSize: '1em', fontWeight: 750, fontVariantNumeric: 'tabular-nums' }}>
                      {cell.kind === 'fold'
                        ? `${cell.periods[0]}${cell.periods.length > 1 ? `–${cell.periods[cell.periods.length - 1]}` : ''}`
                        : cell.kind === 'period'
                          ? cell.n
                          : ''}
                    </b>
                    {cell.kind === 'fold' && cell.start && (
                      <span
                        style={{
                          marginTop: '0.12em',
                          fontSize: timeSize,
                          color: ink(0.68),
                          whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {clock(cell.start)}
                      </span>
                    )}
                    {cell.kind === 'period' && cell.start && (
                      <span
                        style={{
                          marginTop: '0.12em',
                          fontSize: timeSize,
                          color: ink(0.68),
                          whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {clock(cell.start)}
                      </span>
                    )}
                    {cell.kind === 'period' && cell.end && (
                      <span
                        style={{
                          marginTop: '0.02em',
                          fontSize: timeSize,
                          color: ink(0.5),
                          whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {clock(cell.end)}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* The week itself. A day school is shut says so once, in place of its cells. */}
          {model.days.map((day, index) =>
            day.closedLabel !== undefined ? (
              <div
                key={`closed-${day.day}`}
                style={{ gridRow: `${FIRST_ROW} / -1`, gridColumn: index + FIRST_ROW, display: 'grid' }}
              >
                <ClosedCell label={day.closedLabel} tokens={tokens} />
              </div>
            ) : (
              day.cells.map((placed) => (
                <div
                  key={`${day.day}-${placed.rowStart}-${placed.cell.kind}`}
                  data-day={day.day}
                  style={{
                    gridRow: `${placed.rowStart + FIRST_ROW} / ${placed.rowEnd + FIRST_ROW}`,
                    gridColumn: index + FIRST_ROW,
                    display: 'grid',
                    minWidth: 0,
                    minHeight: 0,
                    opacity: placed.faded ? 0.35 : undefined,
                  }}
                >
                  {placed.cell.kind === 'lesson' && (
                    <LessonCell cell={placed.cell} focusDay={day.isFocus} tokens={tokens} />
                  )}
                  {placed.cell.kind === 'free' && <FreeCell cell={placed.cell} tokens={tokens} />}
                  {placed.cell.kind === 'lunch' && <LunchCell cell={placed.cell} tokens={tokens} />}
                  {placed.cell.kind === 'care' && <CareCell cell={placed.cell} tokens={tokens} />}
                  {placed.cell.kind === 'folded' && (
                    <FoldedCell cell={placed.cell} focusDay={day.isFocus} tokens={tokens} />
                  )}
                </div>
              ))
            ),
          )}

          {/* Going-home time, in the space below the lit day's last lesson. */}
          {model.tail && (
            <div
              data-testid="timetable-tail"
              style={{
                gridRow: `${model.tail.rowStart + FIRST_ROW} / ${model.tail.rowEnd + FIRST_ROW}`,
                gridColumn: model.focusIndex + FIRST_ROW,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                alignSelf: 'start',
                gap: '0.35em',
                minWidth: 0,
                paddingTop: '0.15em',
              }}
            >
              <span
                style={{
                  alignSelf: 'stretch',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3em',
                  padding: '0.22em 0.45em 0',
                  borderTop: `2px solid ${ink(0.3)}`,
                  fontSize: atLeast(CARD_TEXT.tail.px, CARD_TEXT.tail.em, fontSize),
                  fontWeight: 650,
                  color: ink(0.78),
                  whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                  // Clipped, not spilled. Left visible, this line paints across
                  // the lessons beside it, and the card's own fit reads the
                  // width it wanted as a card that does not fit and shrinks to
                  // the floor chasing it. What it may lose to the clip is now
                  // one end of a sentence, never part of the time: a column
                  // too tight for "13:15" draws no line at all.
                  overflow: 'hidden',
                }}
              >
                {model.tail.endTime !== undefined && (
                  <>
                    {model.tail.form !== 'bare' && <House size="1em" aria-hidden="true" />}
                    {model.tail.form === 'sentence'
                      ? t('timetable.endsAt', { time: clock(model.tail.endTime) })
                      : clock(model.tail.endTime)}
                  </>
                )}
              </span>
              {/* One-off things to bring from the day's notes, as the chips
                  the subjects' own items are drawn with. */}
              {model.tail.bring?.map((item) => (
                <span
                  key={item}
                  data-testid="timetable-note-bring"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.28em',
                    marginLeft: '0.45em',
                    padding: '0.12em 0.5em',
                    borderRadius: 999,
                    fontSize: atLeast(CARD_TEXT.chip.px, CARD_TEXT.chip.em, fontSize),
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    background: ink(0.9),
                    color: tokens.onInk,
                    maxWidth: '100%',
                    minWidth: 0,
                    overflow: 'hidden',
                  }}
                >
                  <Backpack size="1em" aria-hidden="true" />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {model.footer && (
          <div
            data-testid="timetable-footer"
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5em',
              rowGap: '0.35em',
              marginTop: '0.55em',
              flexShrink: 0,
              minWidth: 0,
            }}
          >
            {packing.map((item, index) => (
              <span
                key={item}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35em',
                  padding: '0.3em 0.85em',
                  borderRadius: 999,
                  fontSize: atLeast(FOOTER_ROW.px, FOOTER_ROW.em, fontSize),
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  background: ink(0.12),
                  color: ink(0.92),
                  // Same reason as the legend below: a long thing to bring must
                  // give up its end rather than the card its size.
                  maxWidth: '100%',
                  minWidth: 0,
                  overflow: 'hidden',
                }}
              >
                {index === 0 && (
                  <>
                    <Backpack size="1em" aria-hidden="true" />
                    <span>{t('timetable.bring')}</span>
                  </>
                )}
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item}</span>
              </span>
            ))}
            {/* Today's tests, and what tomorrow brings: the footer is the one
                place on the card with the words for it. */}
            {[
              ...(model.footer.tests ?? []).map((name) => ({ key: `test-${name}`, kind: 'test' as const, text: name || t('timetable.test') })),
              ...(model.footer.tomorrow?.tests ?? []).map((name) => ({ key: `tomorrow-test-${name}`, kind: 'test' as const, text: t('timetable.tomorrowNote', { what: name || t('timetable.test') }) })),
              ...(model.footer.tomorrow?.cancelled ?? []).map((n) => ({ key: `tomorrow-off-${n}`, kind: 'off' as const, text: t('timetable.tomorrowNote', { what: t('timetable.periodOff', { period: t('timetable.period', { number: String(n) }) }) }) })),
            ].map((pill) => (
              <span
                key={pill.key}
                data-testid={pill.kind === 'test' ? 'timetable-note-test' : 'timetable-note-off'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35em',
                  padding: '0.3em 0.85em',
                  borderRadius: 999,
                  fontSize: atLeast(FOOTER_ROW.px, FOOTER_ROW.em, fontSize),
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  background: pill.kind === 'test' ? TEST_COLOR : ink(0.12),
                  color: pill.kind === 'test' ? TEST_INK : ink(0.92),
                  maxWidth: '100%',
                  minWidth: 0,
                  overflow: 'hidden',
                }}
              >
                {pill.kind === 'test' ? <Pencil size="1em" aria-hidden="true" /> : <X size="1em" aria-hidden="true" />}
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{pill.text}</span>
              </span>
            ))}
            {model.footer.legend.length > 0 && (
              <span
                data-testid="timetable-legend"
                style={{
                  marginLeft: 'auto',
                  fontSize: atLeast(CARD_TEXT.legend.px, CARD_TEXT.legend.em, fontSize),
                  color: ink(0.7),
                  textAlign: 'right',
                  // A footnote about the two weeks, and the longest line on the
                  // card. Unclipped it overflows the footer, and the card's fit
                  // reads that as a card that cannot fit at any size and shrinks
                  // to the floor: three cards across, every child with an A/B
                  // week drew their whole timetable at 6px.
                  //
                  // Clipped on one line it said nothing at all: the B subject,
                  // which is the point of the sentence, was always the half
                  // that went. The footer budgets two lines for it whenever it
                  // is there, so it wraps into the lines already paid for.
                  minWidth: 0,
                  maxWidth: '100%',
                  whiteSpace: 'normal',
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 2,
                  overflow: 'hidden',
                }}
              >
                {model.footer.legend.map(legendLine).join(' · ')}
              </span>
            )}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
