'use client';

/**
 * The Day view: the whole family's next school day on one clock.
 *
 * One card per person, as the Week view draws them, all on the same time axis
 * so a parent sees at a glance who leaves first and who is home last. A
 * header card carries the day and the hour ruler, and under the rows a packing
 * card says what goes in each bag tonight. With Layout set to Side by side the
 * same day is drawn as columns with time running down, the bag list in each
 * column's head, and the ruler as a narrow card on the left.
 *
 * The date, the rows and the clock are settled in `timetable-day.ts`; the size
 * and what the rows give up to draw at it in `timetable-day-fit.ts`. This
 * component measures its box, composes the words in the display's language,
 * and draws what those two decided. Like the Week view it keeps its own box a
 * bare grid: a transform, a filter or an opacity on it would flatten every
 * card's glass.
 */

import { useCallback, useMemo } from 'react';
import type { ModuleStyle, ModuleType, TimeFormat, TimetableConfig } from '@/types/config';
import { CARD_GAP_PX, resolveHeading, usualCourse, type TimetableShed } from '@/lib/timetable-layout';
import {
  axisShare,
  dayAxis,
  familyDayRow,
  resolveFamilyDay,
  tickLabel,
  nowOnAxis,
  type FamilyDay,
  type FamilyDayPerson,
  type FamilyDayRow,
} from '@/lib/timetable-day';
import {
  dayBaseFontSize,
  dayGeometry,
  resolveDayFontSize,
  type DayFitInput,
  type DayFitLesson,
  type DayWords,
} from '@/lib/timetable-day-fit';
import { useElementBox } from '@/hooks/useElementBox';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { formatClockTime } from '@/lib/clock-time';
import { resolveFontStack } from '@/lib/font-registry';
import { hyphenateSubjectName, SUBJECT_BREAK_MARKS } from '@/lib/timetable-subjects';
import { parseISODate } from '@/lib/todo-due-labels';
import { pickPillTextColor } from '@/lib/calendar-color';
import { dayMonthPattern, formatDateSync, fullDatePattern, useFormattingLocale, useLocale, useTranslate } from '@/i18n';
import ModuleWrapper from '../ModuleWrapper';
import { ModuleEmptyState } from '../ModuleStates';
import TimetableHeader from './TimetableHeader';
import { DayColumnCard, DayHeaderCard, DayRowCard, DayRulerCard, type DayPerson, type DayTokens } from './DayCard';
import PackingStrip from './PackingStrip';
import type { PersonEntry, TimetablePeople } from './useTimetablePeople';

const EMPTY_STATE_TYPE: ModuleType = 'timetable';

export interface TimetableDayModuleProps {
  config: TimetableConfig;
  style: ModuleStyle;
  timezone?: string;
  /** The household's clock, resolved by TimetableModule. */
  timeFormat: TimeFormat;
  /** The display's clock, ticked by the module so both views turn the page together. */
  now: Date;
  people: TimetablePeople;
}

/**
 * The widest line a name's seams can make, in characters: each part with the
 * hyphen a break after it prints, the last part without one.
 */
function longestPart(name: string, locale: string): number {
  const seamed = hyphenateSubjectName(name, locale);
  const parts = seamed.split(new RegExp(`[${SUBJECT_BREAK_MARKS.soft}${SUBJECT_BREAK_MARKS.zeroWidth}]`));
  return Math.max(...parts.map((part, i) => part.length + (i < parts.length - 1 ? 1 : 0)));
}

export default function TimetableDayModule({ config, style, timezone, timeFormat, now, people }: TimetableDayModuleProps) {
  const t = useTranslate('modules');
  const locale = useLocale();
  const formatting = useFormattingLocale();
  const { subjects, shown, closuresFor } = people;

  const detail = config.detail ?? 'some';
  const orientation = config.layout === 'stacked' ? 'rows' : 'columns';

  const contexts = useMemo<FamilyDayPerson[]>(
    () =>
      shown.map((entry) => {
        const closed = closuresFor(entry);
        return {
          school: entry.school,
          timetable: entry.timetable,
          subjects,
          schoolHolidays: closed.schoolHolidays,
          publicHolidays: closed.publicHolidays,
        };
      }),
    [shown, closuresFor, subjects],
  );

  const day = useMemo<FamilyDay | null>(
    () => resolveFamilyDay(now, timezone, contexts, config.tomorrowFrom),
    [now, timezone, contexts, config.tomorrowFrom],
  );

  const rows = useMemo<FamilyDayRow[]>(
    () => (day ? contexts.map((person) => familyDayRow(person, day.date)) : []),
    [contexts, day],
  );

  const clock = useCallback((time: string) => formatClockTime(time, timeFormat), [timeFormat]);

  // The heading is the one the Style panel's title control writes.
  const heading = style.title?.trim() ?? '';
  const cardStyle = useMemo<ModuleStyle>(
    () => ({ ...style, title: undefined, titleFontSize: undefined }),
    [style],
  );

  const [attachBox, moduleBox] = useElementBox<HTMLDivElement>('padding');
  const inset = style.padding + style.borderWidth;

  // The words the card prints, measured so the fit can budget for them. Times
  // are the widest the day prints, so a 12 hour household is budgeted for
  // "10:15 AM" and not "07:50".
  const dayTitle = useMemo(() => {
    if (!day) return '';
    const date = parseISODate(day.date);
    if (!date) return day.date;
    // The pill already names the day when it is not today or tomorrow, so the
    // title carries the date alone rather than the weekday twice.
    const pattern = day.labelKind === 'today' || day.labelKind === 'tomorrow'
      ? fullDatePattern(formatting, 'long')
      : dayMonthPattern(formatting, 'long');
    return formatDateSync(date, pattern, { locale: formatting });
  }, [day, formatting]);

  const dayPill = useMemo(() => {
    if (!day) return '';
    if (day.labelKind === 'today') return t('timetable.today');
    if (day.labelKind === 'tomorrow') return t('timetable.tomorrow');
    const date = parseISODate(day.date);
    return date ? formatDateSync(date, 'EEEE', { locale: formatting }) : '';
  }, [day, t, formatting]);

  const packTitle = useMemo(() => {
    if (!day) return '';
    if (day.labelKind === 'today') return t('timetable.packToday');
    if (day.labelKind === 'tomorrow') return t('timetable.packTonight');
    const date = parseISODate(day.date);
    return t('timetable.packFor', { day: date ? formatDateSync(date, 'EEEE', { locale: formatting }) : '' });
  }, [day, t, formatting]);

  const packSub = useMemo(() => {
    if (!day) return '';
    const date = parseISODate(day.date);
    return t('timetable.packSub', { date: date ? formatDateSync(date, fullDatePattern(formatting, 'long'), { locale: formatting }) : '' });
  }, [day, t, formatting]);

  const axisTicks60 = useMemo(() => dayAxis(rows, 60), [rows]);

  const words = useMemo<DayWords>(() => {
    const times = rows.flatMap((row) => [row.span?.start, row.span?.end, row.care?.until, row.usualEnd, row.lateStart])
      .filter((time): time is string => Boolean(time))
      .map((time) => clock(time).length);
    const careLines = rows
      .filter((row) => row.care)
      .map((row) => t('timetable.careUntil', { name: row.care!.name, time: clock(row.care!.until) }).length);
    return {
      starts: t('timetable.startsWord').length,
      ends: t('timetable.endsWord').length,
      usually: t('timetable.usually', { time: '' }).trim().length,
      careUntil: Math.max(0, ...careLines),
      careShort: Math.max(0, ...rows.filter((row) => row.care).map((row) => t('timetable.careUntilShort', { time: clock(row.care!.until) }).length)),
      packTitle: packTitle.length,
      packSub: packSub.length,
      nothing: t('timetable.bringNothing').length,
      time: Math.max(5, ...times),
      tick: Math.max(0, ...axisTicks60.ticks.map((tick) => tickLabel(tick, timeFormat).length)),
    };
  }, [rows, clock, t, packTitle, packSub, axisTicks60, timeFormat]);

  // The course this person is mostly in, so only the lessons in another one
  // carry a badge, as on the Week card.
  const usualCourses = useMemo(() => shown.map((entry) => usualCourse(entry.timetable)), [shown]);

  const lessons = useMemo<DayFitLesson[]>(() => {
    const seen = new Map<string, DayFitLesson>();
    rows.forEach((row, index) => {
      for (const block of row.blocks) {
        if (block.kind !== 'lesson') continue;
        const badge = block.course && block.course !== usualCourses[index] ? block.course : '';
        const icon = shown[index]?.timetable.icons === true;
        const key = `${block.subject.id}|${badge}|${block.endMin - block.startMin}|${icon ? 'i' : ''}`;
        if (seen.has(key)) continue;
        seen.set(key, {
          minutes: block.endMin - block.startMin,
          codeChars: block.subject.code.length,
          nameChars: block.subject.name.length,
          namePartChars: longestPart(block.subject.name, locale),
          courseChars: badge.length,
          ...(icon ? { icon: true } : {}),
        });
      }
    });
    return [...seen.values()];
  }, [rows, locale, usualCourses, shown]);

  const fitInput = useMemo<DayFitInput>(() => {
    const box = {
      width: moduleBox.width,
      height: moduleBox.height,
      cardCount: rows.length + 2,
      stacked: orientation === 'rows',
      inset,
    };
    const band = heading ? resolveHeading(box, detail, style.titleFontSize) : { fontPx: 0, bandPx: 0 };
    return {
      width: moduleBox.width,
      height: moduleBox.height,
      bandPx: band.bandPx,
      inset,
      orientation,
      rowCount: rows.length,
      axis: axisTicks60,
      detail,
      lessons,
      nameChars: Math.max(0, ...shown.map((entry) => entry.member.name.length)),
      classChars: Math.max(0, ...shown.map((entry) => entry.timetable.className?.length ?? 0)),
      schoolChars: Math.max(0, ...shown.map((entry) => entry.school.name.length)),
      words,
      timeFormat,
      hasShortDay: rows.some((row) => row.shortLabel !== undefined),
      hasCare: rows.some((row) => row.care !== undefined),
      hasWeekLetter: rows.some((row) => row.weekLetter !== undefined),
    };
  }, [moduleBox.width, moduleBox.height, rows, orientation, inset, heading, detail, style.titleFontSize, axisTicks60, lessons, shown, words, timeFormat]);

  const headingBand = heading
    ? resolveHeading({ width: moduleBox.width, height: moduleBox.height, cardCount: rows.length + 2, stacked: orientation === 'rows', inset }, detail, style.titleFontSize)
    : { fontPx: 0, bandPx: 0 };

  // One size for the whole day, then Text size and the pixel floor on top of
  // it, then whatever the rows have to give up to draw at that size.
  const derived = rows.length ? dayBaseFontSize(fitInput) : 0;
  const { containerRef, scaledFontSize } = useScaledFontSize(
    style,
    moduleBox.height > 0 ? derived / moduleBox.height : 0,
  );
  const answer = rows.length ? resolveDayFontSize(fitInput, scaledFontSize) : { fontSize: scaledFontSize, shed: 0 as TimetableShed };
  const fontSize = answer.fontSize;
  const shed = answer.shed;
  const geometry = useMemo(() => dayGeometry({ ...fitInput, shed }, fontSize), [fitInput, shed, fontSize]);
  const axis = useMemo(() => dayAxis(rows, geometry.tickEvery), [rows, geometry.tickEvery]);

  const attachRoot = useCallback(
    (el: HTMLDivElement | null) => {
      attachBox(el);
      containerRef(el);
    },
    [attachBox, containerRef],
  );

  const tokens = useMemo<DayTokens>(
    () => ({
      background: style.backgroundColor,
      onInk: pickPillTextColor(style.textColor),
      base: fontSize,
      timeFormat,
      locale,
      detail,
      shed,
      inset,
    }),
    [style.backgroundColor, style.textColor, fontSize, timeFormat, locale, detail, shed, inset],
  );

  const persons = useMemo<DayPerson[]>(
    () => shown.map((entry: PersonEntry, index) => ({ entry, row: rows[index], usualCourse: usualCourses[index] })),
    [shown, rows, usualCourses],
  );

  // The week letter and number in the header come from the first school that
  // alternates weeks; a household whose two schools disagree sees each row's
  // own letter beside the name at More, as the Week view does.
  const weekLetter = rows.find((row) => row.weekLetter)?.weekLetter;

  if (!day) {
    return (
      <ModuleEmptyState style={style} type={EMPTY_STATE_TYPE} message={t('timetable.noLessonsYet')} />
    );
  }

  const share = (minutes: number) => axisShare(axis, minutes);
  // The line at the current time: only while the card shows today and the
  // clock is inside the school day it draws. A card on tomorrow has no now.
  const nowMin = config.showNowLine !== false && day.labelKind === 'today' ? nowOnAxis(now, timezone, axis) : null;
  const shortRow = rows.find((row) => row.shortLabel !== undefined && row.endsAfterPeriod !== undefined);
  const shortBanner = shortRow?.shortLabel
    ? t('timetable.shortDay', {
        label: shortRow.shortLabel,
        period: t('timetable.period', { number: String(shortRow.endsAfterPeriod) }),
      })
    : undefined;

  const rowsShape = geometry.orientation === 'rows';
  const gridStyle = rowsShape
    ? {
        gridTemplateColumns: 'minmax(0, 1fr)',
        gridTemplateRows: [`${geometry.headPx.toFixed(1)}px`, ...rows.map(() => 'minmax(0, 1fr)'), `${geometry.stripPx.toFixed(1)}px`].join(' '),
      }
    : {
        gridTemplateColumns: [`${geometry.rulerPx.toFixed(1)}px`, ...rows.map(() => 'minmax(0, 1fr)')].join(' '),
        gridTemplateRows: `${geometry.headPx.toFixed(1)}px minmax(0, 1fr)`,
      };

  return (
    <div
      ref={attachRoot}
      data-testid="timetable-module"
      data-view="day"
      className="w-full h-full flex flex-col"
      style={{
        color: style.textColor,
        fontFamily: resolveFontStack(style.fontFamily) ?? style.fontFamily,
        fontSize: `${style.fontSize}px`,
      }}
    >
      <TimetableHeader style={style} title={heading} fontPx={headingBand.fontPx} bandPx={headingBand.bandPx} />
      <div
        data-testid="timetable-day-view"
        data-orientation={geometry.orientation}
        data-date={day.date}
        data-label-kind={day.labelKind}
        data-detail={detail}
        data-shed={shed}
        data-derived={derived.toFixed(1)}
        data-scaled={scaledFontSize.toFixed(1)}
        style={{
          display: 'grid',
          gap: CARD_GAP_PX,
          flex: '1 1 auto',
          minHeight: 0,
          minWidth: 0,
          fontSize: `${fontSize}px`,
          ...gridStyle,
        }}
      >
        {/* In columns the header runs over the ruler and every column. A
            plain grid cell around the card, nothing else on it, so the
            card's glass still samples the wall. */}
        <div style={{ display: 'grid', minWidth: 0, minHeight: 0, gridColumn: rowsShape ? undefined : '1 / -1' }}>
          <ModuleWrapper style={cardStyle}>
            <DayHeaderCard
              pill={dayPill}
              title={dayTitle}
              weekLetter={weekLetter}
              weekNumber={day.weekNumber}
              banner={shortBanner}
              axis={axis}
              geometry={geometry}
              tokens={tokens}
              nowMin={nowMin}
            />
          </ModuleWrapper>
        </div>
        {geometry.orientation === 'columns' && (
          <ModuleWrapper style={cardStyle}>
            <DayRulerCard axis={axis} geometry={geometry} tokens={tokens} nowMin={nowMin} />
          </ModuleWrapper>
        )}
        {persons.map((person) => (
          <ModuleWrapper key={person.entry.member.id} style={cardStyle}>
            {geometry.orientation === 'rows' ? (
              <DayRowCard person={person} axis={axis} share={share} geometry={geometry} tokens={tokens} nowMin={nowMin} />
            ) : (
              <DayColumnCard person={person} axis={axis} share={share} geometry={geometry} tokens={tokens} nowMin={nowMin} />
            )}
          </ModuleWrapper>
        ))}
        {geometry.orientation === 'rows' && (
          <ModuleWrapper style={cardStyle}>
            <PackingStrip title={packTitle} subtitle={packSub} persons={persons} geometry={geometry} tokens={tokens} />
          </ModuleWrapper>
        )}
      </div>
    </div>
  );
}
