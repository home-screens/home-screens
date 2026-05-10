'use client';

import { useMemo } from 'react';
import type { MealPlannerConfig, MealSettings, SavedMeal, PlannedMeal } from '@/types/config';
import { TEXT_OPACITY } from '@/lib/constants';
import { SLOT_META, getLocalizedDayNames, resolveMealWithEntry, toISODate, dateToDayIndex, formatMealTime, resolvePlannedMealTime } from '@/lib/meal-constants';
import { useFormattingLocale, useTranslate } from '@/i18n';

interface CompactViewProps {
  config: MealPlannerConfig;
  settings: MealSettings;
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  todayISO: string;
}

export function CompactView({ config, settings, plan, savedMeals, todayISO }: CompactViewProps) {
  const t = useTranslate('modules');
  const formattingLocale = useFormattingLocale();
  const dayNames = useMemo(() => getLocalizedDayNames(formattingLocale, 'short'), [formattingLocale]);
  const slots = settings.enabledSlots;
  const showEmoji = config.showEmoji ?? true;
  const tomorrowDate = new Date(todayISO + 'T12:00:00');
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowISO = toISODate(tomorrowDate);
  const columns = [
    { date: todayISO, label: t('meal-planner.today'), isToday: true },
    { date: tomorrowISO, label: t('meal-planner.tomorrow'), isToday: false },
  ];

  return (
    <div className="flex h-full gap-3">
      {columns.map(({ date, label, isToday }) => (
        <div key={date} className="flex-1 flex flex-col min-w-0">
          {/* Day header */}
          <div className="flex items-center gap-1.5 mb-2">
            <span
              className="font-semibold uppercase tracking-[0.1em]"
              style={{
                fontSize: '0.55em',
                color: isToday ? config.accentColor : undefined,
                opacity: isToday ? TEXT_OPACITY.heading : TEXT_OPACITY.tertiary,
              }}
            >
              {label}
            </span>
            <span className="opacity-20" style={{ fontSize: '0.5em' }}>
              {dayNames[dateToDayIndex(date)]}
            </span>
          </div>

          {/* Meals */}
          <div className="flex flex-col gap-1 flex-1">
            {slots.map((slot) => {
              const { meal, planned } = resolveMealWithEntry(date, slot, plan, savedMeals);
              const time = resolvePlannedMealTime(planned, slot, settings.defaultSlotTimes);
              const meta = SLOT_META[slot];
              return (
                <div
                  key={slot}
                  className="flex items-center gap-1.5 px-2 py-1 rounded"
                  style={{
                    backgroundColor: meal ? meta.bg : 'transparent',
                  }}
                >
                  {/* Slot dot */}
                  <div
                    className="w-1 h-1 rounded-full shrink-0"
                    style={{ backgroundColor: meta.color, opacity: meal ? 0.8 : 0.2 }}
                  />

                  {meal ? (
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                      {showEmoji && meal.emoji && (
                        <span className="shrink-0" style={{ fontSize: '0.7em' }}>{meal.emoji}</span>
                      )}
                      <span className="truncate" style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.heading }}>
                        {meal.name}
                      </span>
                      {time && (
                        <span
                          className="shrink-0 ml-auto"
                          style={{
                            fontSize: '0.55em',
                            opacity: TEXT_OPACITY.tertiary,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {formatMealTime(time, settings.timeFormat)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.55em', opacity: 0.15 }}>&mdash;</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
