'use client';

import { useMemo } from 'react';
import type { MealPlannerConfig, MealSettings, SavedMeal, PlannedMeal, MealSlotType, TimeFormat } from '@/types/config';
import { TEXT_OPACITY } from '@/lib/constants';
import { SLOT_META, getLocalizedDayNames, resolveMealWithEntry, getWeekDatesForRange, getWeekRange, dateToDayIndex, formatMealTime, resolvePlannedMealTime } from '@/lib/meal-constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useElementWidth } from '@/hooks/useElementWidth';
import { MealTapTarget, type RecipeTapMode } from '../shared/MealTapTarget';

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
      weekDates.some((date) => resolveMealWithEntry(date, slot, plan, savedMeals).meal));
    return used.length > 0 ? used : settings.enabledSlots;
  }, [settings.enabledSlots, weekDates, plan, savedMeals]);
  const slots = usedSlots;

  // Spelled-out slot names when the columns have room; single letters otherwise.
  const [frameRef, width] = useElementWidth();
  const columnWidth = width > 0 ? (width - DAY_COLUMN_EM * fontSize) / slots.length : 0;
  const fullLabels = columnWidth >= FULL_LABEL_COLUMN_EM * fontSize;
  const slotLabel = (s: MealSlotType) => t(fullLabels ? `meal-planner.slots.${s}` : `meal-planner.slotShort.${s}`);

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
                backgroundColor: isToday ? 'rgba(255,255,255,0.06)' : 'transparent',
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
                const { meal, planned } = resolveMealWithEntry(date, slot, plan, savedMeals);
                const time = resolvePlannedMealTime(planned, slot, settings.defaultSlotTimes);
                return (
                  <div
                    key={slot}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded min-w-0 self-stretch"
                    style={{
                      backgroundColor: meal ? SLOT_META[slot].bg : 'transparent',
                      borderLeft: isToday && meal ? `2px solid ${SLOT_META[slot].color}40` : '2px solid transparent',
                    }}
                  >
                    {meal ? (
                      <>
                        <MealTapTarget meal={meal} mode={recipeTapMode} className="flex items-center gap-1 min-w-0">
                          {showEmoji && meal.emoji && (
                            <span className="shrink-0" style={{ fontSize: '0.8em' }}>{meal.emoji}</span>
                          )}
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
                              // One long word ("Cheeseburgers") breaks rather than clips.
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {meal.name}
                          </span>
                        </MealTapTarget>
                        {time && (
                          <span
                            className="shrink-0"
                            style={{
                              fontSize: 'max(0.55em, 11px)',
                              opacity: TEXT_OPACITY.tertiary,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {formatMealTime(time, timeFormat)}
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
