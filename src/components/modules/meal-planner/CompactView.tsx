'use client';

import type { MealPlannerConfig } from '@/types/config';
import { TEXT_OPACITY } from '@/lib/constants';
import { SLOT_META, DAY_NAMES_SHORT, resolveMeal, DEFAULT_SLOTS } from '@/lib/meal-constants';

interface CompactViewProps {
  config: MealPlannerConfig;
  today: number;
}

export function CompactView({ config, today }: CompactViewProps) {
  const slots = config.slots ?? DEFAULT_SLOTS;
  const showEmoji = config.showEmoji ?? true;
  const tomorrow = (today + 1) % 7;
  const columns = [
    { day: today, label: 'Today' },
    { day: tomorrow, label: 'Tomorrow' },
  ];

  return (
    <div className="flex h-full gap-3">
      {columns.map(({ day, label }) => (
        <div key={day} className="flex-1 flex flex-col min-w-0">
          {/* Day header */}
          <div className="flex items-center gap-1.5 mb-2">
            <span
              className="font-semibold uppercase tracking-[0.1em]"
              style={{
                fontSize: '0.55em',
                color: label === 'Today' ? config.accentColor : undefined,
                opacity: label === 'Today' ? TEXT_OPACITY.heading : TEXT_OPACITY.tertiary,
              }}
            >
              {label}
            </span>
            <span className="opacity-20" style={{ fontSize: '0.5em' }}>
              {DAY_NAMES_SHORT[day]}
            </span>
          </div>

          {/* Meals */}
          <div className="flex flex-col gap-1 flex-1">
            {slots.map((slot) => {
              const meal = resolveMeal(day, slot, config.plan, config.savedMeals);
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
