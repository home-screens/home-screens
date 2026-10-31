'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { MealPlannerConfig, MealSettings, SavedMeal, PlannedMeal, TimeFormat } from '@/types/config';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { SLOT_META, getLocalizedDayNames, resolveMealWithEntry, getWeekDatesForRange, getWeekRange, dateToDayIndex, formatMealTime, resolvePlannedMealTime } from '@/lib/meal-constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { MealTapTarget, type RecipeTapMode } from '../shared/MealTapTarget';
import MealPicture, { mealHasPicture } from '@/components/meals/MealPicture';
import { MealCourseNames } from '../shared/MealCourseLines';
import { GRID_PICTURE_SIZE } from '@/lib/meal-constants';
import { useMealMinutes } from '../shared/useMealMinutes';
import { mealListScrollTop } from '@/lib/meal-list-scroll';

/** Marks each day heading, the lines the scroll can stop at. */
const DAY_HEADING_ATTR = 'data-list-day';

interface ListViewProps {
  config: MealPlannerConfig;
  settings: MealSettings;
  /** Effective (already-resolved) serving-time format */
  timeFormat: TimeFormat;
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  todayISO: string;
  recipeTapMode: RecipeTapMode;
}

export function ListView({ config, settings, timeFormat, plan, savedMeals, todayISO, recipeTapMode }: ListViewProps) {
  const t = useTranslate('modules');
  const mealMinutes = useMealMinutes();
  const tCore = useTranslate('core');
  const formattingLocale = useFormattingLocale();
  const dayNames = useMemo(() => getLocalizedDayNames(formattingLocale, 'full'), [formattingLocale]);
  const weekStartDay = settings.weekStartDay;
  const { start } = getWeekRange(new Date(todayISO + 'T12:00:00'), weekStartDay);
  const weekDates = getWeekDatesForRange(start, weekStartDay);
  const slots = settings.enabledSlots;
  const showEmoji = config.showEmoji ?? true;

  // Nobody scrolls a wall: when the week is longer than the module, it starts
  // at today, so tonight's dinner and the days ahead are what shows, not the
  // days already gone, with a day heading as the top line (see
  // mealListScrollTop). Pinned again whenever the list changes size. Offsets
  // are against the list itself (it is the lines' offset parent), so a
  // scaled canvas does not skew them.
  const listRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const spacer = spacerRef.current;
    if (!list || !spacer) return;
    const pin = () => {
      const today = todayRef.current;
      const contentHeight = list.scrollHeight - spacer.offsetHeight;
      const headings = Array.from(list.querySelectorAll<HTMLElement>(`[${DAY_HEADING_ATTR}]`), (el) => el.offsetTop);
      const { top, spacer: room } = today
        ? mealListScrollTop(headings, { top: today.offsetTop, bottom: today.offsetTop + today.offsetHeight }, list.clientHeight, contentHeight)
        : { top: 0, spacer: 0 };
      spacer.style.height = `${room}px`;
      list.scrollTop = top;
    };
    pin();
    const observer = new ResizeObserver(pin);
    observer.observe(list);
    if (list.firstElementChild) observer.observe(list.firstElementChild);
    return () => observer.disconnect();
  }, [todayISO, plan, savedMeals]);
  const showPrepTime = config.showPrepTime ?? true;
  const showTags = config.showTags ?? true;

  return (
    <div ref={listRef} className="relative flex flex-col h-full overflow-y-auto pr-1">
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
                  fontSize: '0.7em',
                  color: isToday ? config.accentColor : undefined,
                  opacity: isToday ? 1 : TEXT_OPACITY.secondary,
                }}
              >
                {isToday ? tCore('today') : dayNames[dayIdx]}
              </span>
              {isToday && (
                <span className="opacity-30" style={{ fontSize: '0.5em' }}>
                  {dayNames[dayIdx]}
                </span>
              )}
              <div
                className="h-px flex-1"
                style={{ backgroundColor: isToday ? `${config.accentColor}30` : DIVIDER.subtle }}
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
                      className="flex items-center gap-2 py-0.5"
                    >
                      {/* Slot indicator: the slot's short name in the wall's
                          language ("A" for Abendessen), as the Week grid's
                          narrow headings use */}
                      <span
                        className="uppercase tracking-wider font-medium shrink-0"
                        style={{ fontSize: '0.45em', color: meta.color, opacity: 0.6, width: '1.8em' }}
                      >
                        {t(`meal-planner.slotShort.${slot}`)}
                      </span>

                      {/* Meal info */}
                      <MealTapTarget meal={meal} mode={recipeTapMode} className="flex items-center gap-1.5 min-w-0 flex-1">
                        {showEmoji && mealHasPicture(meal) && (
                          <span className="shrink-0" style={{ fontSize: '0.8em', display: meal?.photoUrl ? 'flex' : undefined }}>
                            <MealPicture meal={meal} photoSize="1.4em" pictureSize={GRID_PICTURE_SIZE} />
                          </span>
                        )}
                        <span className="flex flex-col min-w-0">
                          <span className="truncate" style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.heading }}>
                            {name}
                          </span>
                          <MealCourseNames
                            courses={courses}
                            style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          />
                        </span>
                      </MealTapTarget>

                      {/* Meta */}
                      <div className="flex items-center gap-1.5 shrink-0" style={{ fontSize: '0.45em' }}>
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
                          <span style={{ opacity: TEXT_OPACITY.tertiary }}>&#9201; {mealMinutes(meal, true)}</span>
                        )}
                        {showTags && meal?.tags?.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full px-1 py-px"
                            style={{ backgroundColor: DIVIDER.default, opacity: TEXT_OPACITY.tertiary }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="pl-1 opacity-15 italic" style={{ fontSize: '0.55em' }}>
                {t('meal-planner.noMealsPlanned')}
              </p>
            )}
          </div>
        );
      })}
      {/* Room after the last day, when the scroll needs it (set by `pin`) */}
      <div ref={spacerRef} aria-hidden="true" className="shrink-0" />
    </div>
  );
}
