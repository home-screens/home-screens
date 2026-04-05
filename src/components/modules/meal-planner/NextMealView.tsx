'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { MealPlannerConfig } from '@/types/config';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { SLOT_META, resolveMeal, DEFAULT_SLOTS } from '@/lib/meal-constants';
import { getNextMealSlot } from './types';

interface NextMealViewProps {
  config: MealPlannerConfig;
  today: number;
  currentHour: number;
}

export function NextMealView({ config, today, currentHour }: NextMealViewProps) {
  const slots = config.slots ?? DEFAULT_SLOTS;
  const showPrepTime = config.showPrepTime ?? true;
  const showTags = config.showTags ?? true;

  const { slot, dayOffset, label } = getNextMealSlot(currentHour, slots);
  const mealDay = (today + dayOffset) % 7;
  const meal = resolveMeal(mealDay, slot, config.plan, config.savedMeals);
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

      <AnimatePresence mode="wait">
        {meal ? (
          <motion.div
            key={`${mealDay}-${slot}-${meal.name}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
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
                <span>&#9201;</span> {meal.prepTime} min
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
          </motion.div>
        ) : (
          <motion.p
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.25 }}
            className="italic"
            style={{ fontSize: '0.8em' }}
          >
            Nothing planned
          </motion.p>
        )}
      </AnimatePresence>

      {/* Bottom accent line */}
      <div
        className="w-10 h-0.5 rounded-full mt-1"
        style={{ backgroundColor: meta.color, opacity: 0.3 }}
      />
    </div>
  );
}
