'use client';

import { useMemo } from 'react';
import type { SavedMeal, PlannedMeal, MealSlotType, TimeFormat } from '@/types/config';
import { SLOT_META, SLOT_ORDER, getLocalizedDayNames, getMealSlotLabelKey, DEFAULT_MEAL_EMOJI, dateToDayIndex, toISODate } from '@/lib/meal-constants';
import { Shuffle, Copy, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import MealTimeChip from '@/components/meals/MealTimeChip';
import { useFormattingLocale, useTranslate } from '@/i18n';

interface WeekGridProps {
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  slots: MealSlotType[];
  accentColor: string;
  /** Time display format for the chip face — comes from shared MealSettings */
  timeFormat: TimeFormat;
  selectedMealId: string | null;
  weekDates: string[];
  isCurrentWeek: boolean;
  onSelectMeal: (id: string) => void;
  onRemoveMeal: (date: string, slot: MealSlotType) => void;
  onEmptyCellClick: (date: string, slot: MealSlotType) => void;
  onSetSlotTime: (date: string, slot: MealSlotType, time: string | undefined) => void;
  onSuggestRandom: () => void;
  onCopyLastWeek: () => void;
  hasPreviousWeek: boolean;
  onClearWeek: () => void;
  onNavigateWeek: (direction: -1 | 1) => void;
  onJumpToToday: () => void;
}

export default function WeekGrid({
  plan,
  savedMeals,
  slots,
  accentColor,
  timeFormat,
  selectedMealId,
  weekDates,
  isCurrentWeek,
  onSelectMeal,
  onRemoveMeal,
  onEmptyCellClick,
  onSetSlotTime,
  onSuggestRandom,
  onCopyLastWeek,
  hasPreviousWeek,
  onClearWeek,
  onNavigateWeek,
  onJumpToToday,
}: WeekGridProps) {
  const t = useTranslate('editor');
  const tModules = useTranslate('modules');
  const locale = useFormattingLocale();
  const dayNamesShort = useMemo(() => getLocalizedDayNames(locale, 'short'), [locale]);
  const todayISO = toISODate(new Date());
  // Sort slots into chronological order regardless of config toggle order
  const orderedSlots = SLOT_ORDER.filter((s) => slots.includes(s));

  // Format week date range for header
  const startDate = new Date(weekDates[0] + 'T12:00:00');
  const endDate = new Date(weekDates[6] + 'T12:00:00');
  const formatShort = (d: Date) => d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const dateRangeLabel = `${formatShort(startDate)} – ${formatShort(endDate)}`;

  const ghostBtn =
    'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded border border-hs-border-strong bg-transparent text-hs-text-faint hover:text-hs-text-secondary hover:bg-hs-card transition';

  function resolveMealCell(date: string, slot: MealSlotType): { meal: SavedMeal | null; planned: PlannedMeal | undefined } {
    const planned = plan.find((p) => p.date === date && p.slot === slot);
    if (!planned?.mealId) return { meal: null, planned };
    return { meal: savedMeals.find((m) => m.id === planned.mealId) ?? null, planned };
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-hs-border-strong">
        {/* Week navigation */}
        <button
          type="button"
          onClick={() => onNavigateWeek(-1)}
          className="p-1 rounded hover:bg-hs-card text-hs-text-faint hover:text-hs-text-secondary transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[11px] font-bold uppercase tracking-wider text-hs-text-faint min-w-[140px] text-center">
          {dateRangeLabel}
        </span>
        <button
          type="button"
          onClick={() => onNavigateWeek(1)}
          className="p-1 rounded hover:bg-hs-card text-hs-text-faint hover:text-hs-text-secondary transition"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {!isCurrentWeek && (
          <button
            type="button"
            onClick={onJumpToToday}
            className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition"
          >
            {t('mealPlannerModal.weekGrid.todayChip')}
          </button>
        )}
        <div className="flex-1" />
        <button type="button" onClick={onSuggestRandom} className={ghostBtn}>
          <Shuffle className="w-3.5 h-3.5" />
          {t('mealPlannerModal.weekGrid.suggestButton')}
        </button>
        {hasPreviousWeek && (
          <button type="button" onClick={onCopyLastWeek} className={ghostBtn}>
            <Copy className="w-3.5 h-3.5" />
            {t('mealPlannerModal.weekGrid.copyLastWeekButton')}
          </button>
        )}
        <button
          type="button"
          onClick={onClearWeek}
          className={`${ghostBtn} hover:text-hs-danger hover:border-hs-danger/50 hover:bg-hs-danger/8`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('mealPlannerModal.weekGrid.clearButton')}
        </button>
      </div>

      {/* Grid area */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        <div
          className="gap-x-1.5 gap-y-0"
          style={{
            display: 'grid',
            gridTemplateColumns: `90px repeat(${orderedSlots.length}, 1fr)`,
          }}
        >
          {/* Header row */}
          <div /> {/* Corner cell */}
          {orderedSlots.map((slot) => (
            <div
              key={slot}
              className="text-center text-[10px] font-bold uppercase tracking-wider pb-2"
              style={{ color: SLOT_META[slot].color, opacity: 0.6 }}
            >
              {tModules(getMealSlotLabelKey(slot))}
            </div>
          ))}

          {/* Day rows */}
          {weekDates.map((date) => {
            const isToday = isCurrentWeek && date === todayISO;
            const dayIdx = dateToDayIndex(date);
            const dateObj = new Date(date + 'T12:00:00');
            const shortDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

            return orderedSlots.map((slot, slotIdx) => {
              const { meal, planned } = resolveMealCell(date, slot);
              const isSelected = meal ? selectedMealId === meal.id : false;

              return (
                <div key={`${date}-${slot}`} style={{ display: 'contents' }}>
                  {/* Day label — only render for the first slot */}
                  {slotIdx === 0 && (
                    <div
                      className="py-3 pr-2 border-t border-hs-border flex items-start gap-2"
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
                              {t('mealPlannerModal.weekGrid.todayLabel')}
                            </div>
                            <div className="text-[10px] text-hs-text-faint">
                              {dayNamesShort[dayIdx]} {shortDate}
                            </div>
                          </>
                        ) : (
                          <div>
                            <div className="text-sm text-hs-text-faint">
                              {dayNamesShort[dayIdx]}
                            </div>
                            <div className="text-[10px] text-hs-text-faint">
                              {shortDate}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Slot cell */}
                  <div
                    className="py-2 px-0.5 border-t border-hs-border min-h-[56px]"
                    style={{
                      backgroundColor: isToday ? 'rgba(245,158,11,0.02)' : undefined,
                    }}
                  >
                    {meal ? (
                      <div
                        onClick={() => onSelectMeal(meal.id)}
                        className={`relative flex flex-col gap-1 px-2.5 py-2 rounded-lg bg-hs-card/60 border border-hs-border-strong/50 cursor-pointer hover:bg-hs-card hover:border-hs-border-strong transition-all group ${
                          isSelected ? 'border-amber-500/30 bg-amber-500/5' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{meal.emoji || DEFAULT_MEAL_EMOJI}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-hs-text-body truncate">
                              {meal.name}
                            </div>
                            {meal.prepTime != null && (
                              <div className="text-[10px] text-hs-text-faint">
                                {t('mealPlannerModal.weekGrid.prepTimeMin', { minutes: meal.prepTime })}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Time chip — self-anchors via its own positioned wrapper */}
                        <MealTimeChip
                          value={planned?.time}
                          onChange={(t) => onSetSlotTime(date, slot, t)}
                          slot={slot}
                          variant="dark"
                          accentColor={accentColor}
                          compact
                          timeFormat={timeFormat}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveMeal(date, slot);
                          }}
                          className="absolute top-1 right-1 w-5 h-5 rounded bg-transparent text-hs-text-faint opacity-0 group-hover:opacity-100 hover:text-hs-danger hover:bg-hs-danger/10 transition flex items-center justify-center text-xs"
                        >
                          &times;
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => onEmptyCellClick(date, slot)}
                        className="flex items-center justify-center h-full min-h-[48px] rounded-lg border border-dashed border-transparent hover:border-hs-border-strong cursor-pointer transition group"
                      >
                        <span className="text-sm text-transparent group-hover:text-hs-text-faint">
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
