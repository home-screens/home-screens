'use client';

import { FamilyMealStars } from '@/components/meals/FamilyMealRating';

import { useCallback, useMemo, useRef } from 'react';
import type { MealPlannerConfig, MealSettings, SavedMeal, PlannedMeal, TimeFormat } from '@/types/config';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { SLOT_META, getLocalizedDayNames, resolveMealWithEntry, dateToDayIndex, formatMealTime, resolvePlannedMealTime } from '@/lib/meal-constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { MealTapTarget, type RecipeTapMode } from '../shared/MealTapTarget';
import MealPicture, { mealHasPicture } from '@/components/meals/MealPicture';
import { MealCourseNames } from '../shared/MealCourseLines';
import { GRID_PICTURE_SIZE } from '@/lib/meal-constants';
import { useMealMinutes } from '../shared/useMealMinutes';
import { MEAL_LIST_LABEL_EM, MEAL_LIST_LABEL_MIN_PX, mealListScrollTop, mealListSlotColumn } from '@/lib/meal-list-scroll';
import { useElementBox } from '@/hooks/useElementBox';
import { mealTagLabel } from '@/lib/meal-dish-rules';
import { WallScroller } from '../shared/WallScroller';
import { smallWallScrollLook } from '../shared/wallScrollLook';
import { withAlpha } from '@/lib/hex-color';

/** Marks each day heading, the lines the scroll can stop at. */
const DAY_HEADING_ATTR = 'data-list-day';

interface ListViewProps {
  config: MealPlannerConfig;
  settings: MealSettings;
  /** Effective (already-resolved) serving-time format */
  timeFormat: TimeFormat;
  /** The plan for `weekDates`. */
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  /** The seven days listed: this week, or the week the look-ahead arrows stepped to. */
  weekDates: string[];
  /** The real day, marked wherever it is listed. */
  todayISO: string;
  recipeTapMode: RecipeTapMode;
  /** A real display with taps on: a finger scrolls the week, and it goes back to today by itself. */
  interactive: boolean;
  /** Module font size in px; the slot label decision needs the number, not `1em`. */
  fontSize: number;
}

/**
 * Type sizes, in em of the module's text size with a floor in px so the
 * default 16 px module reads from across the kitchen: the dish name at 15 px,
 * the serving time and the day's other dishes at 11 px or more.
 */
const NAME_SIZE = 'max(0.95em, 14px)';
const SMALL_SIZE = 'max(0.7em, 11px)';
const DAY_SIZE = 'max(0.85em, 13px)';

export function ListView({ config, settings, timeFormat, plan, savedMeals, weekDates, todayISO, recipeTapMode, interactive, fontSize }: ListViewProps) {
  const t = useTranslate('modules');
  const mealMinutes = useMealMinutes();
  const tCore = useTranslate('core');
  const formattingLocale = useFormattingLocale();
  const dayNames = useMemo(() => getLocalizedDayNames(formattingLocale, 'full'), [formattingLocale]);
  // Another week has no today to rest at: it starts at its first day.
  const showsToday = weekDates.includes(todayISO);
  const slots = settings.enabledSlots;
  const showEmoji = config.showEmoji ?? true;
  // Each row names its meal ("Breakfast") in a column as wide as the longest
  // name, so the dishes line up; a list too narrow for that says "B".
  const [listRef, list] = useElementBox();
  const slotColumn = mealListSlotColumn(list.width, fontSize, {
    full: slots.map((s) => t(`meal-planner.slots.${s}`)),
    short: slots.map((s) => t(`meal-planner.slotShort.${s}`)),
  });

  // When the week is longer than the module, the list rests at today, so
  // tonight's dinner and the days ahead are what shows, not the days already
  // gone, with a day heading as the top line (see mealListScrollTop). The
  // scroller puts it there whenever the list changes size while nobody has
  // moved it, and goes back there a minute after a finger has. Offsets are
  // against the list itself (it is the lines' offset parent), so a scaled
  // canvas does not skew them.
  const todayRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const home = useCallback((list: HTMLDivElement) => {
    const spacer = spacerRef.current;
    const today = todayRef.current;
    if (!spacer) return 0;
    const contentHeight = list.scrollHeight - spacer.offsetHeight;
    const headings = Array.from(list.querySelectorAll<HTMLElement>(`[${DAY_HEADING_ATTR}]`), (el) => el.offsetTop);
    const { top, spacer: room } = today
      ? mealListScrollTop(headings, { top: today.offsetTop, bottom: today.offsetTop + today.offsetHeight }, list.clientHeight, contentHeight)
      : { top: 0, spacer: 0 };
    spacer.style.height = `${room}px`;
    return top;
  }, []);
  const look = useMemo(() => smallWallScrollLook(config.accentColor), [config.accentColor]);
  const showPrepTime = config.showPrepTime ?? true;
  const showTags = config.showTags ?? true;

  return (
    <WallScroller
      enabled={interactive}
      home={home}
      homeKey={`${todayISO}|${weekDates[0]}`}
      backLabel={t(showsToday ? 'wallScroll.backToToday' : 'wallScroll.backToTop')}
      {...look}
      className="pr-1"
      frameStyle={{ height: '100%' }}
      testId="meal-list-scroll"
    >
      {/* One box for the whole week, so any change in its height re-reads home. */}
      <div ref={listRef} className="flex flex-col">
      {weekDates.map((date) => {
        const isToday = date === todayISO;
        const dayIdx = dateToDayIndex(date);
        const meals = slots.map((slot) => {
          const { meal, planned, name, courses } = resolveMealWithEntry(date, slot, plan, savedMeals);
          return {
            slot,
            meal,
            name,
            courses,
            time: resolvePlannedMealTime(planned, slot, settings.defaultSlotTimes),
          };
        });
        const hasMeals = meals.some((m) => m.name);

        return (
          <div key={date} ref={isToday ? todayRef : undefined} className="mb-2">
            {/* Day header */}
            <div {...{ [DAY_HEADING_ATTR]: '' }} className="flex items-center gap-2 mb-1">
              <span
                className="font-semibold"
                style={{
                  fontSize: DAY_SIZE,
                  color: isToday ? config.accentColor : undefined,
                  opacity: isToday ? 1 : TEXT_OPACITY.secondary,
                }}
              >
                {isToday ? tCore('today') : dayNames[dayIdx]}
              </span>
              {isToday && (
                <span style={{ fontSize: SMALL_SIZE, opacity: TEXT_OPACITY.tertiary }}>
                  {dayNames[dayIdx]}
                </span>
              )}
              <div
                className="h-px flex-1"
                style={{ backgroundColor: isToday ? withAlpha(config.accentColor, 0.19) : DIVIDER.subtle }}
              />
            </div>

            {/* Meals */}
            {hasMeals ? (
              <div className="flex flex-col gap-0.5 pl-1">
                {meals.map(({ slot, meal, name, time, courses }) => {
                  if (!name) return null;
                  const meta = SLOT_META[slot];
                  return (
                    <div
                      key={slot}
                      className="flex items-center gap-2 py-1"
                    >
                      {/* Which meal: its name in the wall's language, or its
                          short name ("A" for Abendessen) in a narrow list, as
                          the Week grid's headings do */}
                      <span
                        className="font-semibold shrink-0 whitespace-nowrap overflow-hidden"
                        style={{ fontSize: `max(${MEAL_LIST_LABEL_EM}em, ${MEAL_LIST_LABEL_MIN_PX}px)`, color: meta.color, opacity: TEXT_OPACITY.heading, width: slotColumn.widthPx }}
                      >
                        {t(slotColumn.full ? `meal-planner.slots.${slot}` : `meal-planner.slotShort.${slot}`)}
                      </span>

                      {/* Meal info */}
                      <MealTapTarget meal={meal} mode={recipeTapMode} serving={{ date, slot }} className="flex items-center gap-1.5 min-w-0 flex-1">
                        {showEmoji && mealHasPicture(meal) && (
                          <span className="shrink-0" style={{ fontSize: '1.05em', display: meal?.photoUrl ? 'flex' : undefined }}>
                            <MealPicture meal={meal} photoSize="1.4em" pictureSize={GRID_PICTURE_SIZE} />
                          </span>
                        )}
                        <span className="flex flex-col min-w-0">
                          <span className="truncate font-medium" style={{ fontSize: NAME_SIZE }}>
                            {name}
                          </span>
                          <FamilyMealStars meal={meal} size={SMALL_SIZE} />
                          <MealCourseNames
                            courses={courses}
                            style={{ fontSize: SMALL_SIZE, opacity: TEXT_OPACITY.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          />
                        </span>
                      </MealTapTarget>

                      {/* Meta */}
                      <div className="flex items-center gap-1.5 shrink-0" style={{ fontSize: SMALL_SIZE }}>
                        {time && (
                          <span
                            style={{
                              opacity: TEXT_OPACITY.secondary,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {formatMealTime(time, timeFormat)}
                          </span>
                        )}
                        {showPrepTime && mealMinutes(meal) && (
                          <span style={{ opacity: TEXT_OPACITY.secondary }}>&#9201; {mealMinutes(meal, true)}</span>
                        )}
                        {showTags && meal?.tags?.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full py-px"
                            style={{ backgroundColor: DIVIDER.default, opacity: TEXT_OPACITY.secondary, paddingInline: '0.5em' }}
                          >
                            {mealTagLabel(meal, tag)}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="pl-1 italic" style={{ fontSize: SMALL_SIZE, opacity: TEXT_OPACITY.tertiary }}>
                {t('meal-planner.noMealsPlanned')}
              </p>
            )}
          </div>
        );
      })}
      {/* Room after the last day, when the scroll needs it (set by `home`) */}
      <div ref={spacerRef} aria-hidden="true" className="shrink-0" />
      </div>
    </WallScroller>
  );
}
