'use client';

import { motion } from 'framer-motion';
import type { MealPlannerConfig, MealSettings, SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { SLOT_META, getMealSlotLabelKey, resolveMealWithEntry, getActiveSlot, formatMealTime, resolvePlannedMealTime } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import { MealTapTarget, type RecipeTapMode } from '../shared/MealTapTarget';

interface TodayViewProps {
  config: MealPlannerConfig;
  settings: MealSettings;
  /** Effective (already-resolved) serving-time format */
  timeFormat: '12h' | '24h';
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  todayISO: string;
  currentHour: number;
  recipeTapMode: RecipeTapMode;
}

function SlotCard({
  slot,
  config,
  settings,
  timeFormat,
  plan,
  savedMeals,
  todayISO,
  isActive,
  recipeTapMode,
}: {
  slot: MealSlotType;
  config: MealPlannerConfig;
  settings: MealSettings;
  /** Effective (already-resolved) serving-time format */
  timeFormat: '12h' | '24h';
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  todayISO: string;
  isActive: boolean;
  recipeTapMode: RecipeTapMode;
}) {
  const t = useTranslate('modules');
  const { meal, planned } = resolveMealWithEntry(todayISO, slot, plan, savedMeals);
  const time = resolvePlannedMealTime(planned, slot, settings.defaultSlotTimes);
  const meta = SLOT_META[slot];
  const showEmoji = config.showEmoji ?? true;
  const showPrepTime = config.showPrepTime ?? true;
  const showTags = config.showTags ?? true;

  return (
    <motion.div
      layout
      className="flex flex-col rounded-lg overflow-hidden"
      style={{
        backgroundColor: meal ? meta.bg : 'rgba(255,255,255,0.02)',
        borderLeft: `3px solid ${isActive ? meta.color : `${meta.color}30`}`,
      }}
    >
      {/* Slot label + serving time */}
      <div
        className="px-3 pt-2 pb-0.5 uppercase tracking-[0.15em] font-semibold flex items-center gap-2"
        style={{ fontSize: '0.5em', color: meta.color, opacity: isActive ? 1 : TEXT_OPACITY.secondary }}
      >
        <span>{t(getMealSlotLabelKey(slot))}</span>
        {time && (
          <span
            className="normal-case tracking-normal font-medium"
            style={{
              opacity: TEXT_OPACITY.secondary,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatMealTime(time, timeFormat)}
          </span>
        )}
        {isActive && (
          <span
            className="rounded-full px-1.5 py-px normal-case tracking-normal font-normal ml-auto"
            style={{ backgroundColor: `${meta.color}20`, fontSize: '0.9em' }}
          >
            {t('meal-planner.now')}
          </span>
        )}
      </div>

      {/* Meal content */}
      <div className="px-3 pb-2.5 pt-0.5">
        {meal ? (
          <MealTapTarget meal={meal} mode={recipeTapMode} className="flex items-start gap-2 w-full">
            {showEmoji && meal.emoji && (
              <span className="shrink-0 mt-0.5" style={{ fontSize: '1.4em' }}>{meal.emoji}</span>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate" style={{ fontSize: '0.95em' }}>
                {meal.name}
              </p>
              {(showPrepTime || showTags) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1" style={{ fontSize: '0.55em' }}>
                  {showPrepTime && meal.prepTime && (
                    <span className="flex items-center gap-0.5" style={{ opacity: TEXT_OPACITY.dim }}>
                      <span>&#9201;</span> {t('meal-planner.prepTimeMin', { minutes: meal.prepTime })}
                    </span>
                  )}
                  {showTags && meal.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full px-1.5 py-px"
                      style={{ backgroundColor: DIVIDER.default, opacity: TEXT_OPACITY.dim }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </MealTapTarget>
        ) : (
          <p className="opacity-20 italic" style={{ fontSize: '0.75em' }}>
            {t('meal-planner.noMealPlanned')}
          </p>
        )}
      </div>
    </motion.div>
  );
}

export function TodayView({ config, settings, timeFormat, plan, savedMeals, todayISO, currentHour, recipeTapMode }: TodayViewProps) {
  const t = useTranslate('modules');
  const slots = settings.enabledSlots;
  const activeSlot = getActiveSlot(currentHour, slots);

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Title */}
      <div className="flex items-center gap-2 mb-0.5">
        <div
          className="h-px flex-1 rounded-full"
          style={{ backgroundColor: `${config.accentColor}30` }}
        />
        <span
          className="uppercase tracking-[0.2em] font-semibold shrink-0"
          style={{ fontSize: '0.5em', opacity: TEXT_OPACITY.tertiary }}
        >
          {t('meal-planner.todaysMeals')}
        </span>
        <div
          className="h-px flex-1 rounded-full"
          style={{ backgroundColor: `${config.accentColor}30` }}
        />
      </div>

      {/* Meal cards */}
      <div className="flex flex-col gap-1.5 flex-1">
        {slots.map((slot) => (
          <SlotCard
            key={slot}
            slot={slot}
            config={config}
            settings={settings}
            timeFormat={timeFormat}
            plan={plan}
            savedMeals={savedMeals}
            todayISO={todayISO}
            isActive={slot === activeSlot}
            recipeTapMode={recipeTapMode}
          />
        ))}
      </div>
    </div>
  );
}
