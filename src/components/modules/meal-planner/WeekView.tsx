'use client';

import { useMemo } from 'react';
import type { MealPlannerConfig, MealSettings, SavedMeal, PlannedMeal, MealSlotType, TimeFormat } from '@/types/config';
import { TEXT_OPACITY, ink } from '@/lib/constants';
import { SLOT_META, getLocalizedDayNames, resolveMealWithEntry, getWeekDatesForRange, getWeekRange, dateToDayIndex, formatMealTime, resolvePlannedMealTime } from '@/lib/meal-constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useElementBox } from '@/hooks/useElementBox';
import { pictureAboveName } from '@/lib/meal-week-cell';
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
/** The gap (gap-1) a cell draws between the dish and its serving time. */
const CELL_GAP_PX = 4;
/** The picture's line beside or above a dish name: an emoji at 0.8em on a 1.5 line. */
const PICTURE_LINE_EM = 0.8 * 1.5;
/** A serving time's figures and its AM or PM, a character at a time, in em of its size. */
const TIME_CHAR_EM = 0.6;
/** The course count's padding either side, in em of its size. */
const COUNT_PAD_EM = 0.42;

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

  // The room a dish name has, for whether its picture sits beside it or above.
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
                // The time and the course count stack beside the name, so the
                // wider of the two is what the name gives up.
                const timePx = timeLabel.length * TIME_CHAR_EM * smallPx;
                const countPx = courseCount > 0 ? (String(courseCount).length + 1) * TIME_CHAR_EM * smallPx + 2 * COUNT_PAD_EM * smallPx : 0;
                const above = pictureAboveName({
                  cellPx,
                  rowPx,
                  namePx,
                  picturePx: pictured ? PICTURE_LINE_EM * fontSize : 0,
                  besidePx: timeLabel || courseCount > 0 ? Math.max(timePx, countPx) + CELL_GAP_PX : 0,
                });
                // With the picture above the name, the count rides beside the
                // picture and the name keeps the whole width.
                const countBesidePicture = above && courseCount > 0;
                const count = <MealCourseCount count={courseCount} color={SLOT_META[slot].color} fontSize="max(0.55em, 11px)" />;
                const picture = pictured && (
                  <span className="shrink-0" style={{ fontSize: '0.8em', display: meal?.photoUrl ? 'flex' : undefined }}>
                    <MealPicture meal={meal} photoSize="1.4em" pictureSize={GRID_PICTURE_SIZE} />
                  </span>
                );
                return (
                  <div
                    key={slot}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded min-w-0 self-stretch"
                    style={{
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
                          className={above ? 'flex flex-col items-start gap-1 min-w-0' : 'flex items-center gap-1 min-w-0'}
                        >
                          {countBesidePicture ? (
                            <span className="flex items-center gap-1">{picture}{count}</span>
                          ) : picture}
                          {/* Two lines at most: rows are tall enough, columns are not. */}
                          <span
                            className="font-medium min-w-0"
                            style={{
                              fontSize: 'max(0.72em, 13px)',
                              lineHeight: 1.2,
                              opacity: TEXT_OPACITY.heading,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              // A word wider than the column ("Cheeseburgers") breaks at
                              // a hyphen where the browser knows the page's language, and
                              // anywhere at all where it does not, so it never clips.
                              // Breaking anywhere alone cut "Pancakes" to "Pancak / es".
                              hyphens: 'auto',
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {name}
                          </span>
                        </MealTapTarget>
                        {(time || (courseCount > 0 && !countBesidePicture)) && (
                          <span className="shrink-0 flex flex-col items-start" style={{ gap: 2 }}>
                            {time && (
                              <span
                                style={{
                                  fontSize: 'max(0.55em, 11px)',
                                  lineHeight: 1.3,
                                  opacity: TEXT_OPACITY.tertiary,
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {timeLabel}
                              </span>
                            )}
                            {!countBesidePicture && count}
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
