'use client';

import type { MealPlannerConfig, MealSettings, SavedMeal, PlannedMeal, TimeFormat } from '@/types/config';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { SLOT_META, getMealSlotLabelKey, resolveMealWithEntry, formatMealTime, resolvePlannedMealTime, getNextPlannedMeal } from '@/lib/meal-constants';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { MealTapTarget, type RecipeTapMode } from '../shared/MealTapTarget';
import MealPicture, { mealHasPicture } from '@/components/meals/MealPicture';
import { MealCourseLines } from '../shared/MealCourseLines';
import { useMealMinutes } from '../shared/useMealMinutes';

interface NextMealViewProps {
  config: MealPlannerConfig;
  settings: MealSettings;
  /** Effective (already-resolved) serving-time format */
  timeFormat: TimeFormat;
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  todayISO: string;
  /** Minutes after midnight at home (`minutesOfDay`). */
  nowMinutes: number;
  recipeTapMode: RecipeTapMode;
}

export function NextMealView({ config, settings, timeFormat, plan, savedMeals, todayISO, nowMinutes, recipeTapMode }: NextMealViewProps) {
  const t = useTranslate('modules');
  const mealMinutes = useMealMinutes();
  const locale = useFormattingLocale();
  const slots = settings.enabledSlots;
  const showPrepTime = config.showPrepTime ?? true;
  const showTags = config.showTags ?? true;

  // Same walk-forward resolver the fullscreen Next Meal view uses: skip empty
  // slots until a planned meal is found (up to a week out), so the card never
  // says "Nothing planned" while meals are on the plan.
  const next = getNextPlannedMeal(todayISO, nowMinutes, plan, savedMeals, slots, settings.defaultSlotTimes);

  if (!next) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <p className="italic text-center" style={{ fontSize: '0.8em', opacity: 0.25 }}>
          {t('meal-planner.nothingPlannedThisWeek')}
        </p>
      </div>
    );
  }

  const { meal, name, slot, date: mealDate, context, courses, notes } = next;
  const label = context === 'future'
    ? formatDateSync(new Date(mealDate + 'T12:00:00'), 'EEEE', { locale })
    : t(`meal-planner.nextMealLabels.${{ now: 'now', upcoming: 'comingUp', tomorrow: 'tomorrow' }[context]}`);
  const { planned } = resolveMealWithEntry(mealDate, slot, plan, savedMeals);
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
        {t(getMealSlotLabelKey(slot))}
      </span>

      <div
        key={`${mealDate}-${slot}-${name}`}
        className="flex flex-col items-center gap-2"
      >
        {/* Emoji + name (time/tags/prep stay outside the tap target) */}
        <MealTapTarget meal={meal} mode={recipeTapMode} className="flex flex-col items-center gap-2">
          {(config.showEmoji ?? true) && mealHasPicture(meal) && (
            <MealPicture meal={meal} photoSize="4.4em" size="min" emojiStyle={{ fontSize: '2.5em', lineHeight: 1 }} />
          )}
          <p
            className="font-semibold text-center leading-tight"
            style={{ fontSize: '1.3em' }}
          >
            {name}
          </p>
        </MealTapTarget>

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
            {t('meal-planner.servingAt', { time: formatMealTime(time, timeFormat) })}
          </p>
        )}

        <MealCourseLines courses={courses} labelSize="0.5em" nameSize="0.75em" gap="0.7em" centered />

        {/* Tags */}
        {showTags && meal?.tags && meal.tags.length > 0 && (
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
        {showPrepTime && mealMinutes(meal) && (
          <span className="flex items-center gap-1" style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary }}>
            <span>&#9201;</span> {mealMinutes(meal)}
          </span>
        )}

        {/* Notes: the small module has room for one, the day's before the dish's */}
        {notes[0] && (
          <p
            className="text-center italic max-w-[80%] leading-snug mt-1"
            style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary }}
          >
            {notes[0]}
          </p>
        )}
      </div>

      {/* Bottom accent line */}
      <div
        className="w-10 h-0.5 rounded-full mt-1"
        style={{ backgroundColor: meta.color, opacity: 0.3 }}
      />
    </div>
  );
}
