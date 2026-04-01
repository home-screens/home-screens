'use client';

import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';
import { SLOT_META, DAY_NAMES_SHORT, DAY_NAMES_FULL, getOrderedDays } from '@/components/modules/meal-planner/types';
import { Shuffle, Copy, Trash2 } from 'lucide-react';

interface WeekGridProps {
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  slots: MealSlotType[];
  weekStartDay: 'sunday' | 'monday';
  accentColor: string;
  selectedMealId: string | null;
  onSelectMeal: (id: string) => void;
  onRemoveMeal: (day: number, slot: MealSlotType) => void;
  onEmptyCellClick: (day: number, slot: MealSlotType) => void;
  onSuggestRandom: () => void;
  onCopyLastWeek: () => void;
  hasPreviousPlan: boolean;
  onClearWeek: () => void;
}

export default function WeekGrid({
  plan,
  savedMeals,
  slots,
  weekStartDay,
  accentColor,
  selectedMealId,
  onSelectMeal,
  onRemoveMeal,
  onEmptyCellClick,
  onSuggestRandom,
  onCopyLastWeek,
  hasPreviousPlan,
  onClearWeek,
}: WeekGridProps) {
  const today = new Date().getDay();
  const orderedDays = getOrderedDays(weekStartDay);

  const ghostBtn =
    'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded border border-neutral-700 bg-transparent text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition';

  function resolveMealForCell(day: number, slot: MealSlotType): SavedMeal | null {
    const entry = plan.find((p) => p.day === day && p.slot === slot);
    if (!entry?.mealId) return null;
    return savedMeals.find((m) => m.id === entry.mealId) ?? null;
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-neutral-700">
        <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
          This Week
        </span>
        <div className="flex-1" />
        <button type="button" onClick={onSuggestRandom} className={ghostBtn}>
          <Shuffle className="w-3.5 h-3.5" />
          Suggest
        </button>
        {hasPreviousPlan && (
          <button type="button" onClick={onCopyLastWeek} className={ghostBtn}>
            <Copy className="w-3.5 h-3.5" />
            Copy Last Week
          </button>
        )}
        <button
          type="button"
          onClick={onClearWeek}
          className={`${ghostBtn} hover:text-red-400 hover:border-red-500/50 hover:bg-red-500/8`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>

      {/* Grid area */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        <div
          className="gap-x-1.5 gap-y-0"
          style={{
            display: 'grid',
            gridTemplateColumns: `90px repeat(${slots.length}, 1fr)`,
          }}
        >
          {/* Header row */}
          <div /> {/* Corner cell */}
          {slots.map((slot) => (
            <div
              key={slot}
              className="text-center text-[10px] font-bold uppercase tracking-wider pb-2"
              style={{ color: SLOT_META[slot].color, opacity: 0.6 }}
            >
              {SLOT_META[slot].label}
            </div>
          ))}

          {/* Day rows */}
          {orderedDays.map((day) => {
            const isToday = day === today;

            return slots.map((slot, slotIdx) => {
              const meal = resolveMealForCell(day, slot);
              const isSelected = meal ? selectedMealId === meal.id : false;

              return (
                <div key={`${day}-${slot}`} style={{ display: 'contents' }}>
                  {/* Day label — only render for the first slot */}
                  {slotIdx === 0 && (
                    <div
                      className="py-3 pr-2 border-t border-neutral-800 flex items-start gap-2"
                      style={{
                        backgroundColor: isToday ? 'rgba(245,158,11,0.02)' : undefined,
                      }}
                    >
                      {isToday && (
                        <span
                          className="w-[5px] h-[5px] rounded-full mt-1.5 shrink-0"
                          style={{ backgroundColor: '#f59e0b' }}
                        />
                      )}
                      <div>
                        {isToday ? (
                          <>
                            <div
                              className="text-sm font-semibold"
                              style={{ color: accentColor }}
                            >
                              Today
                            </div>
                            <div className="text-[10px] text-neutral-600">
                              {DAY_NAMES_FULL[day]}
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-neutral-500">
                            {DAY_NAMES_SHORT[day]}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Slot cell */}
                  <div
                    className="py-2 px-0.5 border-t border-neutral-800 min-h-[56px]"
                    style={{
                      backgroundColor: isToday ? 'rgba(245,158,11,0.02)' : undefined,
                    }}
                  >
                    {meal ? (
                      <div
                        onClick={() => onSelectMeal(meal.id)}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg bg-neutral-800/60 border border-neutral-700/50 cursor-pointer hover:bg-neutral-800 hover:border-neutral-600 transition-all relative group ${
                          isSelected ? 'border-amber-500/30 bg-amber-500/5' : ''
                        }`}
                      >
                        <span className="text-lg">{meal.emoji || '🍽️'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-neutral-200 truncate">
                            {meal.name}
                          </div>
                          {meal.prepTime != null && (
                            <div className="text-[10px] text-neutral-600">
                              {meal.prepTime}m prep
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveMeal(day, slot);
                          }}
                          className="absolute top-1 right-1 w-5 h-5 rounded bg-transparent text-neutral-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition flex items-center justify-center text-xs"
                        >
                          &times;
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => onEmptyCellClick(day, slot)}
                        className="flex items-center justify-center h-full min-h-[48px] rounded-lg border border-dashed border-transparent hover:border-neutral-700 cursor-pointer transition group"
                      >
                        <span className="text-sm text-transparent group-hover:text-neutral-600">
                          +
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}
