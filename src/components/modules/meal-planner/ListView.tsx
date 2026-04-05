'use client';

import type { MealPlannerConfig } from '@/types/config';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { SLOT_META, DAY_NAMES_FULL, getOrderedDays, resolveMeal, DEFAULT_SLOTS } from '@/lib/meal-constants';

interface ListViewProps {
  config: MealPlannerConfig;
  today: number;
}

export function ListView({ config, today }: ListViewProps) {
  const days = getOrderedDays(config.weekStartDay);
  const slots = config.slots ?? DEFAULT_SLOTS;
  const showEmoji = config.showEmoji ?? true;
  const showPrepTime = config.showPrepTime ?? true;
  const showTags = config.showTags ?? true;

  return (
    <div className="flex flex-col h-full overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
      {days.map((day) => {
        const isToday = day === today;
        const meals = slots.map((slot) => ({
          slot,
          meal: resolveMeal(day, slot, config.plan, config.savedMeals),
        }));
        const hasMeals = meals.some((m) => m.meal);

        return (
          <div key={day} className="mb-2">
            {/* Day header */}
            <div className="flex items-center gap-2 mb-1">
              <span
                className="font-semibold"
                style={{
                  fontSize: '0.7em',
                  color: isToday ? config.accentColor : undefined,
                  opacity: isToday ? 1 : TEXT_OPACITY.secondary,
                }}
              >
                {isToday ? 'Today' : DAY_NAMES_FULL[day]}
              </span>
              {isToday && (
                <span className="opacity-30" style={{ fontSize: '0.5em' }}>
                  {DAY_NAMES_FULL[day]}
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
                {meals.map(({ slot, meal }) => {
                  if (!meal) return null;
                  const meta = SLOT_META[slot];
                  return (
                    <div
                      key={slot}
                      className="flex items-center gap-2 py-0.5"
                    >
                      {/* Slot indicator */}
                      <span
                        className="uppercase tracking-wider font-medium shrink-0"
                        style={{ fontSize: '0.45em', color: meta.color, opacity: 0.6, width: '1.8em' }}
                      >
                        {slot[0].toUpperCase()}
                      </span>

                      {/* Meal info */}
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {showEmoji && meal.emoji && (
                          <span className="shrink-0" style={{ fontSize: '0.8em' }}>{meal.emoji}</span>
                        )}
                        <span className="truncate" style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.heading }}>
                          {meal.name}
                        </span>
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-1.5 shrink-0" style={{ fontSize: '0.45em' }}>
                        {showPrepTime && meal.prepTime && (
                          <span style={{ opacity: TEXT_OPACITY.tertiary }}>&#9201; {meal.prepTime}m</span>
                        )}
                        {showTags && meal.tags?.slice(0, 2).map((tag) => (
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
                No meals planned
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
