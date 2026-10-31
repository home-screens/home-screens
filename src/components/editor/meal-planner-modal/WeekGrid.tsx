'use client';

import { useMemo, type ReactNode } from 'react';
import type { SavedMeal, PlannedMeal, MealSlotType, TimeFormat } from '@/types/config';
import { SLOT_META, SLOT_ORDER, getLocalizedDayNames, getMealSlotLabelKey, dateToDayIndex, resolveMealWithEntry, formatShortDayMonth, formatMealTime } from '@/lib/meal-constants';
import { Shuffle, Copy, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import MealTimeChip from '@/components/meals/MealTimeChip';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useDishTime } from './dish-time';
import DishPicture from './DishPicture';

interface WeekGridProps {
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  slots: MealSlotType[];
  accentColor: string;
  /** Time display format for the chip face — comes from shared MealSettings */
  timeFormat: TimeFormat;
  selectedMealId: string | null;
  /** The cell whose meal popover is open, drawn as selected. */
  activeCell: { date: string; slot: MealSlotType } | null;
  /**
   * Planning is open. False pauses every change (Mealie is not answering):
   * cells only show their meal in Detail, and the week buttons are off.
   */
  editable: boolean;
  weekDates: string[];
  /** The household's calendar day, `YYYY-MM-DD`, for the Today column. */
  todayISO: string;
  isCurrentWeek: boolean;
  /** Show a meal in the Detail tab without opening it for planning. */
  onSelectMeal: (id: string) => void;
  /** A planned cell was clicked: open its meal popover beside `anchor`. */
  onOpenMeal: (date: string, slot: MealSlotType, anchor: DOMRect) => void;
  onRemoveMeal: (date: string, slot: MealSlotType) => void;
  onEmptyCellClick: (date: string, slot: MealSlotType) => void;
  onSetSlotTime: (date: string, slot: MealSlotType, time: string | undefined) => void;
  onSuggestRandom: () => void;
  /** Suggest is waiting for Mealie: the button says so and takes no second click. */
  suggesting?: boolean;
  /**
   * The meals have loaded. Before then the week is only a guess (the
   * household's week start comes with them), so its dates are not shown and
   * the arrows are off: a click then would be undone when the week re-aligns.
   */
  loaded?: boolean;
  onCopyLastWeek: () => void;
  hasPreviousWeek: boolean;
  onClearWeek: () => void;
  onNavigateWeek: (direction: -1 | 1) => void;
  onJumpToToday: () => void;
  /** A line above the grid (planning paused, and why). */
  notice?: ReactNode;
  /** Drawn instead of the grid: no copy of Mealie's plan, or the week still on its way. */
  replacement?: ReactNode;
}

export default function WeekGrid({
  plan,
  savedMeals,
  slots,
  accentColor,
  timeFormat,
  selectedMealId,
  activeCell,
  editable,
  weekDates,
  todayISO,
  isCurrentWeek,
  onSelectMeal,
  onOpenMeal,
  onRemoveMeal,
  onEmptyCellClick,
  onSetSlotTime,
  onSuggestRandom,
  suggesting = false,
  loaded = true,
  onCopyLastWeek,
  hasPreviousWeek,
  onClearWeek,
  onNavigateWeek,
  onJumpToToday,
  notice,
  replacement,
}: WeekGridProps) {
  const t = useTranslate('editor');
  const dishTime = useDishTime();
  const tModules = useTranslate('modules');
  const locale = useFormattingLocale();
  const dayNamesShort = useMemo(() => getLocalizedDayNames(locale, 'short'), [locale]);
  // Sort slots into chronological order regardless of config toggle order
  const orderedSlots = SLOT_ORDER.filter((s) => slots.includes(s));

  // Format week date range for header
  const startDate = new Date(weekDates[0] + 'T12:00:00');
  const endDate = new Date(weekDates[6] + 'T12:00:00');
  const formatShort = (d: Date) => d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const dateRangeLabel = `${formatShort(startDate)} – ${formatShort(endDate)}`;

  const ghostBtn =
    'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded border border-hs-border-strong bg-transparent text-hs-text-faint enabled:hover:text-hs-text-secondary enabled:hover:bg-hs-card transition disabled:opacity-40 disabled:cursor-not-allowed';

  // The grid draws whatever the slot holds: a library or Mealie meal, a meal
  // typed straight into the day (no `mealId`), or only courses, which lead
  // with the first. The rest of the courses show as a count.
  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-hs-border-strong">
        {/* Week navigation */}
        <button
          type="button"
          onClick={() => onNavigateWeek(-1)}
          disabled={!loaded}
          aria-label={t('mealPlannerModal.weekGrid.previousWeekAriaLabel')}
          className="p-1 rounded hover:bg-hs-card text-hs-text-faint hover:text-hs-text-secondary transition disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden />
        </button>
        <span className="text-[11px] font-bold uppercase tracking-wider text-hs-text-faint min-w-[140px] text-center">
          {loaded ? dateRangeLabel : null}
        </span>
        <button
          type="button"
          onClick={() => onNavigateWeek(1)}
          disabled={!loaded}
          aria-label={t('mealPlannerModal.weekGrid.nextWeekAriaLabel')}
          className="p-1 rounded hover:bg-hs-card text-hs-text-faint hover:text-hs-text-secondary transition disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="w-4 h-4" aria-hidden />
        </button>
        {loaded && !isCurrentWeek && (
          <button
            type="button"
            onClick={onJumpToToday}
            className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition"
          >
            {t('mealPlannerModal.weekGrid.todayChip')}
          </button>
        )}
        <div className="flex-1" />
        <button type="button" onClick={onSuggestRandom} disabled={!editable || suggesting} aria-busy={suggesting} className={ghostBtn}>
          <Shuffle className={`w-3.5 h-3.5 ${suggesting ? 'animate-spin' : ''}`} />
          {suggesting ? t('mealPlannerModal.weekGrid.suggestBusy') : t('mealPlannerModal.weekGrid.suggestButton')}
        </button>
        {hasPreviousWeek && (
          <button type="button" onClick={onCopyLastWeek} disabled={!editable} className={ghostBtn}>
            <Copy className="w-3.5 h-3.5" />
            {t('mealPlannerModal.weekGrid.copyLastWeekButton')}
          </button>
        )}
        <button
          type="button"
          onClick={onClearWeek}
          disabled={!editable}
          className={`${ghostBtn} enabled:hover:text-hs-danger enabled:hover:border-hs-danger/50 enabled:hover:bg-hs-danger/8`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('mealPlannerModal.weekGrid.clearButton')}
        </button>
      </div>

      {notice}

      {/* Grid area */}
      {replacement ?? (
      <div className="flex-1 overflow-y-auto px-5 py-3">
        <div
          className="gap-x-1.5 gap-y-0"
          style={{
            display: 'grid',
            // minmax(0, …): a long dish name truncates in its cell instead of
            // widening its column past the window.
            gridTemplateColumns: `90px repeat(${orderedSlots.length}, minmax(0, 1fr))`,
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
            const shortDate = formatShortDayMonth(date, locale);

            return orderedSlots.map((slot, slotIdx) => {
              const { meal, planned, name, courses } = resolveMealWithEntry(date, slot, plan, savedMeals);
              const isSelected = activeCell
                ? activeCell.date === date && activeCell.slot === slot
                : !!meal && selectedMealId === meal.id;
              const time = dishTime(meal);

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
                    data-meal-cell={`${date}|${slot}`}
                    className="py-2 px-0.5 border-t border-hs-border min-h-[56px]"
                    style={{
                      backgroundColor: isToday ? 'rgba(245,158,11,0.02)' : undefined,
                    }}
                  >
                    {name ? (
                      <div
                        onClick={(e) => {
                          if (editable) onOpenMeal(date, slot, e.currentTarget.getBoundingClientRect());
                          else if (meal) onSelectMeal(meal.id);
                        }}
                        className={`relative flex flex-col gap-1 px-2.5 py-2 rounded-lg border cursor-pointer transition-all group ${
                          isSelected
                            ? 'border-amber-500/45 bg-amber-500/6'
                            : 'bg-hs-card/60 border-hs-border-strong/50 hover:bg-hs-card hover:border-hs-border-strong'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <DishPicture meal={meal} size={32} />
                          <div className="flex-1 min-w-0">
                            {/* pr-3 keeps the count clear of the hover × in the corner. */}
                            <div className={`flex items-center gap-1.5 min-w-0 ${editable ? 'pr-3' : ''}`}>
                              <span className="text-xs font-semibold text-hs-text-body truncate">{name}</span>
                              {courses.length > 0 && (
                                <span
                                  className="shrink-0 px-1.5 rounded-full bg-white/8 text-[10px] font-bold leading-[15px] text-hs-text-muted tabular-nums"
                                  title={t('mealPlannerModal.weekGrid.coursesCount', { count: courses.length })}
                                >
                                  +{courses.length}
                                </span>
                              )}
                            </div>
                            {time && <div className="text-[10px] text-hs-text-faint">{time}</div>}
                          </div>
                        </div>
                        {/* Time chip — self-anchors via its own positioned wrapper */}
                        {editable ? (
                          <MealTimeChip
                            value={planned?.time}
                            onChange={(t) => onSetSlotTime(date, slot, t)}
                            slot={slot}
                            variant="dark"
                            accentColor={accentColor}
                            compact
                            timeFormat={timeFormat}
                          />
                        ) : planned?.time ? (
                          <span className="w-fit px-1.5 py-0.5 rounded border border-hs-border-strong/50 text-[10px] font-semibold tabular-nums text-hs-text-muted">
                            {formatMealTime(planned.time, timeFormat)}
                          </span>
                        ) : null}
                        {editable && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveMeal(date, slot);
                            }}
                            aria-label={t('mealPlannerModal.weekGrid.removeMealAriaLabel', { name })}
                            className="absolute top-1 right-1 w-5 h-5 rounded bg-transparent text-hs-text-faint opacity-0 group-hover:opacity-100 hover:text-hs-danger hover:bg-hs-danger/10 transition flex items-center justify-center text-xs"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    ) : editable ? (
                      <div
                        onClick={() => onEmptyCellClick(date, slot)}
                        className="flex items-center justify-center h-full min-h-[48px] rounded-lg border border-dashed border-transparent hover:border-hs-border-strong cursor-pointer transition group"
                      >
                        <span className="text-sm text-transparent group-hover:text-hs-text-faint">
                          +
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            });
          })}
        </div>
      </div>
      )}
    </div>
  );
}
