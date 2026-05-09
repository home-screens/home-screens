'use client';

import type { MealPlannerConfig, MealSettings, SavedMeal, PlannedMeal } from '@/types/config';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { SLOT_META, resolveMealWithEntry, toISODate, formatMealTime, resolvePlannedMealTime } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import { getNextMealSlot } from './types';

interface NextMealViewProps {
  config: MealPlannerConfig;
  settings: MealSettings;
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  todayISO: string;
  currentHour: number;
}

export function NextMealView({ config, settings, plan, savedMeals, todayISO, currentHour }: NextMealViewProps) {
  const t = useTranslate('modules');
  const slots = settings.enabledSlots;
  const showPrepTime = config.showPrepTime ?? true;
  const showTags = config.showTags ?? true;

  const { slot, dayOffset, labelKey } = getNextMealSlot(currentHour, slots);
  const label = t(`meal-planner.nextMealLabels.${labelKey}`);
  // Compute the ISO date for the target day
  const targetDate = new Date(todayISO + 'T12:00:00');
  targetDate.setDate(targetDate.getDate() + dayOffset);
  const mealDate = toISODate(targetDate);
  const { meal, planned } = resolveMealWithEntry(mealDate, slot, plan, savedMeals);
  const time = resolvePlannedMealTime(planned, slot, settings.defaultSlotTimes);
  const meta = SLOT_META[slot];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
      {/* Context label */}
      <span
        className="uppercase tracking-[0.25em] font-semibold"
        style={{ fontSize: '0.5em', opacity: TEXT_OPACITY.tertiary }}
      >
        {label}
      </span>

      {/* Slot name */}
      <span
        className="uppercase tracking-[0.15em] font-bold"
        style={{ fontSize: '0.7em', color: meta.color }}
      >
        {meta.label}
      </span>

      {meal ? (
        <div
          key={`${mealDate}-${slot}-${meal.name}`}
          className="flex flex-col items-center gap-2"
        >
            {/* Emoji */}
            {(config.showEmoji ?? true) && meal.emoji && (
              <span style={{ fontSize: '2.5em', lineHeight: 1 }}>{meal.emoji}</span>
            )}

            {/* Meal name */}
            <p
              className="font-semibold text-center leading-tight"
              style={{ fontSize: '1.3em' }}
            >
              {meal.name}
            </p>

            {/* Serving time */}
            {time && (
              <p
                className="text-center font-medium"
                style={{
                  fontSize: '0.7em',
                  opacity: TEXT_OPACITY.secondary,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t('meal-planner.servingAt', { time: formatMealTime(time, settings.timeFormat) })}
              </p>
            )}

            {/* Tags */}
            {showTags && meal.tags && meal.tags.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5" style={{ fontSize: '0.55em' }}>
                {meal.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-2 py-0.5"
                    style={{ backgroundColor: DIVIDER.default, opacity: TEXT_OPACITY.dim }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Prep time */}
            {showPrepTime && meal.prepTime && (
              <span className="flex items-center gap-1" style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary }}>
                <span>&#9201;</span> {t('meal-planner.prepTimeMin', { minutes: meal.prepTime })}
              </span>
            )}

            {/* Notes */}
            {meal.notes && (
              <p
                className="text-center italic max-w-[80%] leading-snug mt-1"
                style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary }}
              >
                {meal.notes}
              </p>
            )}
        </div>
      ) : (
        <p
          className="italic"
          style={{ fontSize: '0.8em', opacity: 0.25 }}
        >
          {t('meal-planner.nothingPlanned')}
        </p>
      )}

      {/* Bottom accent line */}
      <div
        className="w-10 h-0.5 rounded-full mt-1"
        style={{ backgroundColor: meta.color, opacity: 0.3 }}
      />
    </div>
  );
}
