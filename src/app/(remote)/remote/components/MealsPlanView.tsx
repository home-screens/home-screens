'use client';

import { useMemo, type CSSProperties } from 'react';
import type { MealSlotType, TimeFormat } from '@/types/config';
import type { MealieProblem } from '@/lib/meal-sources';
import {
  SLOT_META,
  SLOT_ORDER,
  resolvePlannedMealTime,
  resolveMealTimeFormat,
  getLocalizedDayNames,
  getMealSlotLabelKey,
} from '@/lib/meal-constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import type { MealPickTarget, MealsViewProps } from './meals-shared';
import MealTimeChip from '@/components/meals/MealTimeChip';
import MealThumb from './MealThumb';
import { MealiePausedNotice } from './MealsMealieStatus';

interface MealsPlanViewProps extends MealsViewProps {
  /** Household GlobalSettings.timeFormat — resolves the effective format when
   *  the shared meal settings carry no explicit override */
  globalTimeFormat: TimeFormat;
  /** The plan lives in Mealie: no "add meals to your library first" here. */
  fromMealie: boolean;
  /**
   * Planning is paused (Mealie gave no answer): rows cannot be tapped, the
   * buttons are off, and one message says why (`problem`). `updatedAt` is
   * when the copy on screen came from Mealie.
   */
  paused: { updatedAt: number | null; problem: MealieProblem } | null;
  onRetry: () => Promise<void> | void;
  /** Open the meal sheet on a planned meal. */
  onOpenMeal: (date: string, slot: MealSlotType) => void;
  /** Open the recipe picker (an empty slot goes straight to its main dish). */
  onPick: (target: MealPickTarget) => void;
  setSlotTime: (date: string, slot: MealSlotType, time: string | undefined) => Promise<void>;
  clearAllPlan: () => void;
  suggestRandom: () => Promise<void>;
  copyLastWeek: () => Promise<void>;
  hasPreviousWeek: boolean;
  setSubView: (v: 'library') => void;
}

function actionStyle(off: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '8px 8px',
    minHeight: 44,
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 8,
    border: '1px solid var(--hs-border)',
    cursor: off ? 'default' : 'pointer',
    background: 'var(--hs-bg-panel)',
    color: off ? 'var(--hs-border-strong)' : 'var(--hs-text-muted)',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  };
}

export default function MealsPlanView({
  savedMeals,
  weekDates,
  todayISO,
  getMealForSlot,
  globalTimeFormat,
  fromMealie,
  paused,
  onRetry,
  onOpenMeal,
  onPick,
  setSlotTime,
  clearAllPlan,
  suggestRandom,
  copyLastWeek,
  hasPreviousWeek,
  plan,
  settings,
  setSubView,
}: MealsPlanViewProps) {
  const t = useTranslate('remote');
  const tModules = useTranslate('modules');
  const formattingLocale = useFormattingLocale();
  const dayNamesFull = useMemo(
    () => getLocalizedDayNames(formattingLocale, 'full'),
    [formattingLocale],
  );
  // Use chronological slot order, but only the slots the household has enabled
  const enabledSlotsOrdered = SLOT_ORDER.filter((s) => settings.enabledSlots.includes(s));
  const timeFormat = resolveMealTimeFormat(settings, globalTimeFormat);
  // Mealie picks from its own recipes, so an empty week in Mealie can still
  // be filled; the family's own plan needs saved meals to pick from.
  const suggestOff = !!paused || (!fromMealie && savedMeals.length === 0);
  const clearOff = !!paused || plan.length === 0;

  return (
    <div style={{ paddingBottom: 80 }}>
      {paused && <MealiePausedNotice updatedAt={paused.updatedAt} problem={paused.problem} todayISO={todayISO} onRetry={onRetry} />}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={suggestRandom}
          disabled={suggestOff}
          style={actionStyle(suggestOff)}
          aria-label={t(fromMealie ? 'mealsPlan.actions.suggestMealieAriaLabel' : 'mealsPlan.actions.suggestAriaLabel')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>
          {t('mealsPlan.actions.suggest')}
        </button>
        {(hasPreviousWeek || paused) && (
          <button
            onClick={copyLastWeek}
            disabled={!!paused}
            style={actionStyle(!!paused)}
            aria-label={t('mealsPlan.actions.copyLastWeekAriaLabel')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            {t('mealsPlan.actions.copyLastWeek')}
          </button>
        )}
        <button
          onClick={clearAllPlan}
          disabled={clearOff}
          style={actionStyle(clearOff)}
          aria-label={t('mealsPlan.actions.clearAriaLabel')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          {t('mealsPlan.actions.clear')}
        </button>
      </div>

      {!fromMealie && savedMeals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ fontSize: 15, color: 'var(--hs-text-faint)', marginBottom: 4 }}>{t('mealsPlan.empty.title')}</p>
          <p style={{ fontSize: 13, color: 'var(--hs-text-faint)', marginBottom: 20 }}>
            {t('mealsPlan.empty.description')}
          </p>
          <button
            onClick={() => setSubView('library')}
            style={{
              padding: '10px 24px',
              minHeight: 44,
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              background: '#f59e0b',
              color: '#000',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            {t('mealsPlan.empty.addMealsButton')}
          </button>
        </div>
      )}

      <div
        aria-disabled={paused ? true : undefined}
        style={paused ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
      >
        {weekDates.map(({ date, dayIndex }) => {
          const isToday = date === todayISO;
          const dayLabel = dayNamesFull[dayIndex];

          return (
            <div key={date} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: isToday ? 'var(--hs-text-primary)' : 'var(--hs-text-muted)' }}>
                  {dayLabel}
                </span>
                {isToday && (
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: '#f59e0b' }} />
                )}
              </div>

              {/* Stacked slot rows, full width to make room for the time chip */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {enabledSlotsOrdered.map((slot) => {
                  const { planned, meal, name, courses } = getMealForSlot(date, slot);
                  const time = resolvePlannedMealTime(planned, slot, settings.defaultSlotTimes);
                  const slotLabel = tModules(getMealSlotLabelKey(slot));

                  return (
                    <div
                      key={slot}
                      data-testid="meals-plan-row"
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'stretch',
                        gap: 8,
                        // Padding stays thin so the inner button can be the whole
                        // row: the old 10px inset left only a 20px strip of
                        // "+ Add meal" actually tappable.
                        padding: '3px 12px',
                        minHeight: 50,
                        borderRadius: 10,
                        border: name ? `1px solid ${SLOT_META[slot].color}30` : '1px dashed var(--hs-border)',
                        background: name ? `${SLOT_META[slot].color}10` : 'transparent',
                        overflow: 'visible' as const,
                      }}
                    >
                      {name ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onOpenMeal(date, slot)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              flex: 1,
                              minWidth: 0,
                              minHeight: 44,
                              padding: '4px 0',
                              border: 'none',
                              background: 'transparent',
                              color: 'inherit',
                              cursor: 'pointer',
                              textAlign: 'left' as const,
                              fontFamily: 'inherit',
                            }}
                            aria-label={t('mealsPlan.slot.changeMealAriaLabel', { meal: name, slot: slotLabel })}
                          >
                            <div style={{ width: 3, height: 28, borderRadius: 2, background: SLOT_META[slot].color, flexShrink: 0 }} />
                            <MealThumb meal={meal} size={32} radius={6} emojiSize={18} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 10, color: SLOT_META[slot].color, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', lineHeight: '15px' }}>
                                {slotLabel}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--hs-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '19.5px', minWidth: 0 }}>
                                  {name}
                                </span>
                                {courses.length > 0 && (
                                  <span
                                    aria-label={t('mealsPlan.slot.moreCoursesAriaLabel', { count: courses.length })}
                                    style={{
                                      flex: 'none',
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: 'var(--hs-text-muted)',
                                      background: 'color-mix(in srgb, var(--hs-text-primary) 8%, transparent)',
                                      borderRadius: 99,
                                      padding: '0 6px',
                                      lineHeight: '17px',
                                      fontVariantNumeric: 'tabular-nums',
                                    }}
                                  >
                                    +{courses.length}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                          <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                            <MealTimeChip
                              value={time}
                              onChange={(tt) => setSlotTime(date, slot, tt)}
                              slot={slot}
                              variant="darker"
                              align="right"
                              timeFormat={timeFormat}
                            />
                          </span>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onPick({ date, slot, pick: 'main' })}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flex: 1,
                            minHeight: 44,
                            padding: '4px 0',
                            border: 'none',
                            background: 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                          aria-label={t('mealsPlan.slot.planSlotAriaLabel', { slot: slotLabel, day: dayLabel })}
                        >
                          <div style={{ width: 3, height: 20, borderRadius: 2, background: SLOT_META[slot].color, opacity: 0.4, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: 'var(--hs-text-faint)' }}>{slotLabel}</span>
                          {!paused && (
                            <span style={{ fontSize: 12, color: 'var(--hs-text-faint)', marginLeft: 'auto' }}>{t('mealsPlan.slot.addMeal')}</span>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
