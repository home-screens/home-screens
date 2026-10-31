'use client';

import { Fragment, useMemo, type CSSProperties } from 'react';
import type { MealPlannerConfig, MealSettings, SavedMeal, PlannedMeal, MealSlotType, TimeFormat } from '@/types/config';
import { TEXT_OPACITY, ink } from '@/lib/constants';
import { SLOT_META, getLocalizedDayNames, resolveMealWithEntry, getWeekDatesForRange, getWeekRange, dateToDayIndex, formatMealTime, resolvePlannedMealTime } from '@/lib/meal-constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useElementBox } from '@/hooks/useElementBox';
import { weekCellLayout, weekCellPieces, weekCellWords, WEEK_GAP_PX, WEEK_LINE_GAP_PX } from '@/lib/meal-week-cell';
import { MealTapTarget, type RecipeTapMode } from '../shared/MealTapTarget';
import MealPicture, { mealHasPicture } from '@/components/meals/MealPicture';
import { MealCourseCount } from '../shared/MealCourseLines';
import { GRID_PICTURE_SIZE } from '@/lib/meal-constants';

interface WeekViewProps {
  config: MealPlannerConfig;
  settings: MealSettings;
  /** Effective (already-resolved) serving-time format */
  timeFormat: TimeFormat;
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  todayISO: string;
  recipeTapMode: RecipeTapMode;
  /** Module font size in px; the label decision needs the number, not `1em`. */
  fontSize: number;
}

/** Width of the day-name column, in em. */
const DAY_COLUMN_EM = 2.5;
/** A slot column at least this wide (in em) spells "Breakfast" instead of "B". */
const FULL_LABEL_COLUMN_EM = 4.5;
/** A meal cell's padding (px-1.5 either side) and its 2px left border, across. */
const CELL_INSET_X_PX = 6 * 2 + 2;
/** The same cell's padding (py-0.5) top and bottom. */
const CELL_INSET_Y_PX = 2 * 2;
/** The 1px gap the grid draws between its columns and between its rows. */
const GRID_GAP_PX = 1;
/** The picture's line beside or above a dish name: an emoji at 0.8em on a 1.5 line. */
const PICTURE_LINE_EM = 0.8 * 1.5;
/** A serving time's figures and its AM or PM, a character at a time, in em of its size. */
const TIME_CHAR_EM = 0.6;
/** The course count's padding either side, in em of its size. */
const COUNT_PAD_EM = 0.42;
/** The line under a name: the course count's pill is the taller of what it holds. */
const SMALL_LINE_HEIGHT = 1.45;
/** A word of a dish name too long for a line of its cell: cut with an ellipsis. */
const LONG_WORD_STYLE: CSSProperties = {
  display: 'inline-block',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
};

export function WeekView({ config, settings, timeFormat, plan, savedMeals, todayISO, recipeTapMode, fontSize }: WeekViewProps) {
  const t = useTranslate('modules');
  const formattingLocale = useFormattingLocale();
  const dayNames = useMemo(() => getLocalizedDayNames(formattingLocale, 'short'), [formattingLocale]);
  const weekStartDay = settings.weekStartDay;
  const { start } = getWeekRange(new Date(todayISO + 'T12:00:00'), weekStartDay);
  const weekDates = getWeekDatesForRange(start, weekStartDay);
  const showEmoji = config.showEmoji ?? true;
  // Only slots the week uses get a column; four columns for one apple squeezed
  // every dish name to a stub. A week with nothing in any slot keeps them all
  // (the module shows its empty state before it gets here).
  const usedSlots = useMemo(() => {
    const used = settings.enabledSlots.filter((slot) =>
      weekDates.some((date) => resolveMealWithEntry(date, slot, plan, savedMeals).name));
    return used.length > 0 ? used : settings.enabledSlots;
  }, [settings.enabledSlots, weekDates, plan, savedMeals]);
  const slots = usedSlots;

  // Spelled-out slot names when the columns have room; single letters otherwise.
  const [frameRef, frame] = useElementBox();
  const width = frame.width;
  const columnWidth = width > 0 ? (width - DAY_COLUMN_EM * fontSize) / slots.length : 0;
  const fullLabels = columnWidth >= FULL_LABEL_COLUMN_EM * fontSize;
  const slotLabel = (s: MealSlotType) => t(fullLabels ? `meal-planner.slots.${s}` : `meal-planner.slotShort.${s}`);

  // The room each cell has, for how it lays out its dish (see weekCellLayout).
  const namePx = Math.max(0.72 * fontSize, 13);
  // The slot labels and the serving times share one small size.
  const smallPx = Math.max(0.55 * fontSize, 11);
  const cellPx = columnWidth > 0 ? columnWidth - GRID_GAP_PX - CELL_INSET_X_PX : 0;
  // The slot labels' row (a 1.5 line, pb-1 and mb-1) comes off the top first.
  const headerPx = smallPx * 1.5 + 8;
  const rowPx = (frame.height - headerPx - GRID_GAP_PX * (weekDates.length - 1)) / weekDates.length - CELL_INSET_Y_PX;

  const columns = `${DAY_COLUMN_EM}em repeat(${slots.length}, minmax(0, 1fr))`;

  return (
    <div ref={frameRef} className="flex flex-col h-full">
      {/* Header row */}
      <div
        className="grid gap-px mb-1"
        style={{ gridTemplateColumns: columns }}
      >
        <div />
        {slots.map((s) => (
          <div
            key={s}
            className="text-center font-semibold uppercase tracking-wider pb-1 truncate"
            style={{ fontSize: 'max(0.55em, 11px)', color: SLOT_META[s].color, opacity: TEXT_OPACITY.heading }}
          >
            {slotLabel(s)}
          </div>
        ))}
      </div>

      {/* Day rows */}
      <div className="flex-1 flex flex-col gap-px min-h-0">
        {weekDates.map((date) => {
          const isToday = date === todayISO;
          const dayIdx = dateToDayIndex(date);
          return (
            <div
              key={date}
              className="grid gap-px flex-1 min-h-0 items-center rounded-md transition-colors"
              style={{
                gridTemplateColumns: columns,
                backgroundColor: isToday ? ink(0.06) : 'transparent',
              }}
            >
              {/* Day label */}
              <div
                className="font-medium pl-1 truncate"
                style={{
                  fontSize: 'max(0.7em, 13px)',
                  opacity: isToday ? 1 : TEXT_OPACITY.dim,
                  color: isToday ? config.accentColor : undefined,
                }}
              >
                {dayNames[dayIdx]}
              </div>

              {/* Meal cells */}
              {slots.map((slot) => {
                const { meal, planned, name, courses } = resolveMealWithEntry(date, slot, plan, savedMeals);
                const time = resolvePlannedMealTime(planned, slot, settings.defaultSlotTimes);
                const timeLabel = time ? formatMealTime(time, timeFormat) : '';
                const pictured = showEmoji && mealHasPicture(meal);
                const courseCount = courses.length;
                const words = name ? weekCellWords(name) : [];
                const layout = weekCellLayout({
                  cellPx,
                  rowPx,
                  namePx,
                  nameChars: name?.length ?? 0,
                  longestWordChars: Math.max(0, ...words.map((word) => word.length)),
                  picturePx: pictured ? PICTURE_LINE_EM * fontSize : 0,
                  timePx: timeLabel.length * TIME_CHAR_EM * smallPx,
                  countPx: courseCount > 0 ? (String(courseCount).length + 1) * TIME_CHAR_EM * smallPx + 2 * COUNT_PAD_EM * smallPx : 0,
                  smallLinePx: SMALL_LINE_HEIGHT * smallPx,
                });
                const count = <MealCourseCount count={courseCount} color={SLOT_META[slot].color} fontSize="max(0.55em, 11px)" />;
                const picture = pictured && (
                  <span className="shrink-0" style={{ fontSize: '0.8em', display: meal?.photoUrl ? 'flex' : undefined }}>
                    <MealPicture meal={meal} photoSize="1.4em" pictureSize={GRID_PICTURE_SIZE} />
                  </span>
                );
                return (
                  <div
                    key={slot}
                    className="flex flex-col justify-center px-1.5 py-0.5 rounded min-w-0 self-stretch overflow-hidden"
                    style={{
                      gap: WEEK_LINE_GAP_PX,
                      backgroundColor: name ? SLOT_META[slot].bg : 'transparent',
                      borderLeft: isToday && name ? `2px solid ${SLOT_META[slot].color}40` : '2px solid transparent',
                    }}
                  >
                    {name ? (
                      <>
                        {/* The picture goes above a name it would squeeze to a
                            few letters, so the name gets the whole cell. */}
                        <MealTapTarget
                          meal={meal}
                          mode={recipeTapMode}
                          className={layout.pictureAbove ? 'flex flex-col items-start min-w-0' : 'flex items-center min-w-0'}
                          style={{ gap: WEEK_GAP_PX }}
                        >
                          {layout.countAt === 'picture' ? (
                            <span className="flex items-center" style={{ gap: WEEK_GAP_PX }}>{picture}{count}</span>
                          ) : picture}
                          <span
                            className="font-medium min-w-0"
                            style={{
                              fontSize: 'max(0.72em, 13px)',
                              lineHeight: 1.2,
                              opacity: TEXT_OPACITY.heading,
                              maxWidth: '100%',
                              display: '-webkit-box',
                              WebkitLineClamp: layout.nameLines,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              // Between words only: a browser hyphenates just the
                              // languages it has a dictionary for, and a Pi may have
                              // none, so breaking inside a word cut "Oatmeal" to
                              // "Oatme / al". A word wider than the cell ends in an
                              // ellipsis instead.
                              overflowWrap: 'normal',
                              wordBreak: 'normal',
                              hyphens: 'manual',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {/* Firefox puts that ellipsis only on a clamped name's
                                last line, so a word clearly too long for a line gets
                                a box of its own to end in one (see weekCellPieces). */}
                            {weekCellPieces(words, layout.lineChars).map((piece, i) => (
                              piece.box ? <span key={i} style={LONG_WORD_STYLE}>{piece.text}</span> : <Fragment key={i}>{piece.text}</Fragment>
                            ))}
                          </span>
                          {layout.countAt === 'name' && count}
                        </MealTapTarget>
                        {/* The serving time, under the name where it costs the
                            name no width; left off when the row has no room. */}
                        {(layout.showTime || layout.countAt === 'line') && (
                          <span className="flex flex-wrap items-center min-w-0" style={{ gap: `${WEEK_LINE_GAP_PX}px ${WEEK_GAP_PX}px` }}>
                            {layout.showTime && (
                              <span
                                data-meal-week-time=""
                                style={{
                                  fontSize: 'max(0.55em, 11px)',
                                  lineHeight: 1.3,
                                  opacity: TEXT_OPACITY.tertiary,
                                  fontVariantNumeric: 'tabular-nums',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {timeLabel}
                              </span>
                            )}
                            {layout.countAt === 'line' && count}
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: '0.6em', opacity: 0.2 }}>&mdash;</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
