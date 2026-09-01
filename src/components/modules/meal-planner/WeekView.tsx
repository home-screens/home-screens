'use client';

import { useMemo } from 'react';
import type { MealPlannerConfig, MealSettings, SavedMeal, PlannedMeal, MealSlotType, TimeFormat } from '@/types/config';
import { TEXT_OPACITY } from '@/lib/constants';
import { SLOT_META, getLocalizedDayNames, resolveMealWithEntry, getWeekDatesForRange, getWeekRange, dateToDayIndex, formatMealTime, resolvePlannedMealTime } from '@/lib/meal-constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
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
}

export function WeekView({ config, settings, timeFormat, plan, savedMeals, todayISO, recipeTapMode }: WeekViewProps) {
  const t = useTranslate('modules');
  const formattingLocale = useFormattingLocale();
  const dayNames = useMemo(() => getLocalizedDayNames(formattingLocale, 'short'), [formattingLocale]);
  const weekStartDay = settings.weekStartDay;
  const { start } = getWeekRange(new Date(todayISO + 'T12:00:00'), weekStartDay);
  const weekDates = getWeekDatesForRange(start, weekStartDay);
  const slots = settings.enabledSlots;
  const showEmoji = config.showEmoji ?? true;

  const slotLabel = (s: MealSlotType) => t(`meal-planner.slotShort.${s}`);

  return (
    <div className="flex flex-col h-full">
      {/* Header row */}
      <div
        className="grid gap-px mb-1"
        style={{ gridTemplateColumns: `2.5em repeat(${slots.length}, 1fr)` }}
      >
        <div />
        {slots.map((s) => (
          <div
            key={s}
            className="text-center font-semibold uppercase tracking-wider pb-1"
            style={{ fontSize: '0.55em', color: SLOT_META[s].color, opacity: TEXT_OPACITY.heading }}
          >
            {slotLabel(s)}
          </div>
        ))}
      </div>

      {/* Day rows */}
      <div className="flex-1 flex flex-col gap-px">
        {weekDates.map((date) => {
          const isToday = date === todayISO;
          const dayIdx = dateToDayIndex(date);
          return (
            <div
              key={date}
              className="grid gap-px flex-1 min-h-0 items-center rounded-md transition-colors"
              style={{
                gridTemplateColumns: `2.5em repeat(${slots.length}, 1fr)`,
                backgroundColor: isToday ? 'rgba(255,255,255,0.06)' : 'transparent',
              }}
            >
              {/* Day label */}
              <div
                className="font-medium pl-1 truncate"
                style={{
                  fontSize: '0.65em',
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
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded min-w-0"
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
                          <span
                            className="truncate font-medium"
                            style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.heading }}
                          >
                            {meal.name}
                          </span>
                        </MealTapTarget>
                        {time && (
                          <span
                            className="shrink-0"
                            style={{
                              fontSize: '0.55em',
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
