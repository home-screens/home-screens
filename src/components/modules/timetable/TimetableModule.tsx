'use client';

/**
 * The School Timetable module: one week card per person, on one wall, or the
 * whole family's next school day on one clock (`TimetableDayModule`).
 *
 * The module gathers the four things a card cannot fetch for itself (the
 * timetables, the family roster, the holiday dates and the time in the
 * display's own zone, the first three through `useTimetablePeople`), works out
 * which week and which day each card should be on, and then gets out of the
 * way: `WeekCard` draws the week and `timetable-layout.ts` decides everything
 * about it.
 *
 * Each person gets their own card, so three cards on a screen look like three
 * cards rather than one box with dividers. That is why the module's own box is
 * a bare grid: a transform, a filter or an opacity on it would make a fresh
 * backdrop for the cards to sample and every one of their glass backgrounds
 * would quietly go flat.
 */

import { useCallback, useMemo } from 'react';
import type { ModuleStyle, ModuleType, TimeFormat, TimetableConfig } from '@/types/config';
import {
  buildRows,
  CARD_GAP_PX,
  cardBaseFontSize,
  cardBoxIn,
  longestCourseBadge,
  longestSubjectLabel,
  resolveFocus,
  resolveCardFontSize,
  resolveHeading,
  rowFacts,
  type CardMetricsInput,
  type FocusResolution,
  type TimetableRowFacts,
  type TimetableShed,
} from '@/lib/timetable-layout';
import { useElementBox } from '@/hooks/useElementBox';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { useRealClock } from '@/hooks/useTZClock';
import { resolveFontStack } from '@/lib/font-registry';
import { parseISODate } from '@/lib/todo-due-labels';
import { formatDateSync, useFormattingLocale, useTranslate } from '@/i18n';
import ModuleWrapper from '../ModuleWrapper';
import { ModuleEmptyState, ModuleLoadingState } from '../ModuleStates';
import TimetableHeader from './TimetableHeader';
import TimetableDayModule from './TimetableDayModule';
import WeekCard from './WeekCard';
import { useTimetablePeople, type PersonEntry } from './useTimetablePeople';
import { householdTimeFormat } from '@/lib/clock-time';

/**
 * How often the cards look at the clock. The last lesson of the week ends on a
 * minute, and the card turns the page to next week right after it, so half a
 * minute is the most a wall is ever behind.
 */
const FOCUS_TICK_MS = 30_000;

/** The module's own type, which the empty card uses for its icon and name. */
const EMPTY_STATE_TYPE: ModuleType = 'timetable';

interface TimetableModuleProps {
  config: TimetableConfig;
  style: ModuleStyle;
  /** The display's IANA timezone (Settings), applied to every module by buildModuleProps. */
  timezone?: string;
  /** The household's 12 or 24 hour preference. */
  timeFormat?: TimeFormat;
}

interface PersonCard extends PersonEntry {
  focus: FocusResolution;
}

export default function TimetableModule({ config, style, timezone, timeFormat: savedTimeFormat }: TimetableModuleProps) {
  const t = useTranslate('modules');
  const formatting = useFormattingLocale();
  const timeFormat = householdTimeFormat(savedTimeFormat, formatting);
  const now = useRealClock(FOCUS_TICK_MS);
  const people = useTimetablePeople(config);
  const { snapshot, error, members, rosterLoading, rosterError, subjects, shown, closuresFor } = people;

  // Each card is closed by its own school's region. A household with children
  // at schools in two states gets both right, which one region for the whole
  // module could never do.
  const cards = useMemo<PersonCard[]>(
    () =>
      shown.map((entry) => {
        const closed = closuresFor(entry);
        return {
          ...entry,
          focus: resolveFocus(now, timezone, {
            school: entry.school,
            timetable: entry.timetable,
            subjects,
            schoolHolidays: closed.schoolHolidays,
            publicHolidays: closed.publicHolidays,
            nextWeekFromFriday: config.nextWeekFromFriday,
          }),
        };
      }),
    [shown, closuresFor, subjects, now, timezone, config.nextWeekFromFriday],
  );

  // The heading is the one the Style panel's title control writes. It is drawn
  // here rather than on the cards, because a strip on every one of them would
  // be the same word five times.
  const heading = style.title?.trim() ?? '';

  // Every card carries the module's style, minus the heading.
  const cardStyle = useMemo<ModuleStyle>(
    () => ({ ...style, title: undefined, titleFontSize: undefined }),
    [style],
  );

  const detail = config.detail ?? 'some';
  const stacked = config.layout === 'stacked';

  // ---------------------------------------------------------------------
  // What the row of cards agrees on
  //
  // The module's own box is measured and the cards' boxes are worked out from
  // it, rather than every card measuring itself and reporting back. Two
  // reasons: the size they share has to be settled before any of them is
  // drawn, so a row that agreed a frame later would be caught mid-agreement
  // by every screenshot in the project; and the heading's own size comes from
  // the cards while its band comes out of their height, which only settles
  // without chasing itself if one place holds both numbers.
  // ---------------------------------------------------------------------
  const [attachBox, moduleBox] = useElementBox<HTMLDivElement>('padding');

  // The card and the module are separate elements: the wrapper's padding and
  // its border are both between them.
  const inset = style.padding + style.borderWidth;
  const box = {
    width: moduleBox.width,
    height: moduleBox.height,
    cardCount: cards.length,
    stacked,
    inset,
  };
  const headingBand = heading ? resolveHeading(box, detail, style.titleFontSize) : { fontPx: 0, bandPx: 0 };
  const cardBox = cardBoxIn({ ...box, bandPx: headingBand.bandPx });

  // Everything a card's size depends on that is not its box: the rows its week
  // has, the longest name its lit column may print, whether that name has a
  // picture beside it, and whether its footer has two weeks to explain.
  const geometryOf = useCallback(
    (card: PersonCard): CardMetricsInput => ({
      cardWidth: cardBox.width,
      cardHeight: cardBox.height,
      detail,
      padding: 0,
      showStartTimes: config.showStartTimes,
      timeFormat,
      rows: buildRows(card.timetable, card.school, detail).rows,
      longestLabelChars: longestSubjectLabel(card.timetable, subjects),
      courseChars: longestCourseBadge(card.timetable),
      focusIcon: card.timetable.icons === true || detail !== 'less',
      icons: card.timetable.icons === true,
      hasLegend: detail === 'more' && card.timetable.weeks.B !== undefined,
    }),
    [cardBox.width, cardBox.height, detail, config.showStartTimes, timeFormat, subjects],
  );

  // One size for the row: the smallest any card in it can hold. Settled card
  // by card, a row of brothers and sisters came out at 6px, 6px, 6px, 12.3px
  // and 15.5px, and read as five cards that happened to be side by side. The
  // cost is that one child with a ten-period day makes everybody's type
  // smaller, which is the trade the design is worth.
  const derived = cards.length
    ? Math.min(...cards.map((card) => cardBaseFontSize(geometryOf(card))))
    : 0;

  // Text size and the pixel floor are the household's say over the size the
  // row settled on, so they go on top of it rather than inside it.
  const { containerRef, scaledFontSize } = useScaledFontSize(
    style,
    moduleBox.height > 0 ? derived / moduleBox.height : 0,
  );

  // Text size and the pixel floor can both ask for a size the cells have no
  // room for, and every cell clips its own contents, so the card used to draw
  // it and lose the room under a name into thin air. What the row gives up
  // instead is the room, then the names in the quiet columns, and only past
  // that the size itself. Whatever any one card has to give up, they all do.
  const answers = cards.map((card) => resolveCardFontSize(geometryOf(card), scaledFontSize));
  const fontSize = answers.length ? Math.min(...answers.map((a) => a.fontSize)) : scaledFontSize;
  const shed = answers.reduce<TimetableShed>((most, a) => (a.shed > most ? a.shed : most), 0);

  // The word before the lit day's date: "today", or the day's own name once a
  // card has turned the page to next week. Composed here because the row is
  // measured against the longest of them and the card draws it, and the same
  // date parse as the card's own, so the two cannot name different days.
  const focusWordOf = useCallback(
    (card: PersonCard): string => {
      if (card.focus.focusLabelKind === 'today') return t('timetable.today');
      const date = parseISODate(card.focus.focusDate);
      return date ? formatDateSync(date, 'EEEE', { locale: formatting }) : '';
    },
    [t, formatting],
  );

  // One day line for the row, settled against the longest name, class, care
  // word and week badge in it. Settled per card it came out different on each
  // of them: Mia kept "Today 08:15 to 12:45" while Leon beside her showed bare
  // times, on the strength of three characters of name.
  const row = useMemo<TimetableRowFacts>(
    () =>
      rowFacts(
        cards.map((card) => ({
          name: card.member.name,
          className: card.timetable.className,
          parity: card.school.weekCycle.mode === 'parity',
          care: card.school.care?.name,
          focusWord: focusWordOf(card),
        })),
      ),
    [cards, focusWordOf],
  );

  const attachRoot = useCallback(
    (el: HTMLDivElement | null) => {
      attachBox(el);
      containerRef(el);
    },
    [attachBox, containerRef],
  );

  if ((config.memberIds ?? []).length === 0) {
    return <ModuleEmptyState style={style} type={EMPTY_STATE_TYPE} message={t('timetable.pickWho')} />;
  }
  // A roster that cannot be read is not the same as a household nobody has a
  // timetable in, so say so instead of saying the wrong thing.
  if (!snapshot || rosterLoading || (rosterError && members.length === 0)) {
    return (
      <ModuleLoadingState style={style} message={t('timetable.name')} error={error ?? rosterError} />
    );
  }
  if (cards.length === 0) {
    return (
      <ModuleEmptyState style={style} type={EMPTY_STATE_TYPE} message={t('timetable.noTimetableYet')} />
    );
  }

  // The Day view: everyone's next school day on one clock. It shares the
  // people, the holidays and the empty states above, and nothing else.
  if (config.view === 'day') {
    return (
      <TimetableDayModule
        config={config}
        style={style}
        timezone={timezone}
        timeFormat={timeFormat}
        now={now}
        people={people}
      />
    );
  }

  // The week letter and the school-holiday line used to be worked out here, for
  // one shared line above the cards. Each card settles its own now: the letter
  // is right per school rather than only when every school agrees, and the
  // holiday is the card's own day line, which is what it replaces.
  return (
    <div
      ref={attachRoot}
      data-testid="timetable-module"
      className="w-full h-full flex flex-col"
      style={{
        color: style.textColor,
        fontFamily: resolveFontStack(style.fontFamily) ?? style.fontFamily,
        fontSize: `${style.fontSize}px`,
      }}
    >
      {/* Only a heading somebody asked for. Everything else the module used to
          say up here is on the cards now, so a module with no heading gives its
          whole box to them. */}
      <TimetableHeader style={style} title={heading} fontPx={headingBand.fontPx} bandPx={headingBand.bandPx} />
      <div
        style={{
          display: 'grid',
          gap: CARD_GAP_PX,
          flex: '1 1 auto',
          minHeight: 0,
          minWidth: 0,
          gridTemplateColumns: stacked ? 'minmax(0, 1fr)' : `repeat(${cards.length}, minmax(0, 1fr))`,
          gridTemplateRows: stacked ? `repeat(${cards.length}, minmax(0, 1fr))` : 'minmax(0, 1fr)',
        }}
      >
        {cards.map((card) => (
          <ModuleWrapper key={card.member.id} style={cardStyle}>
            <WeekCard
              member={card.member}
              timetable={card.timetable}
              school={card.school}
              subjects={subjects}
              detail={detail}
              focus={card.focus}
              focusWord={focusWordOf(card)}
              style={cardStyle}
              showStartTimes={config.showStartTimes}
              timeFormat={timeFormat}
              box={cardBox}
              fontSize={fontSize}
              shed={shed}
              row={row}
            />
          </ModuleWrapper>
        ))}
      </div>
    </div>
  );
}
