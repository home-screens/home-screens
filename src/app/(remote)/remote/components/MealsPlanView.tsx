'use client';

import { useMemo } from 'react';
import type { MealSlotType, TimeFormat } from '@/types/config';
import {
  SLOT_META,
  SLOT_ORDER,
  DEFAULT_MEAL_EMOJI,
  resolvePlannedMealTime,
  resolveMealTimeFormat,
  getLocalizedDayNames,
  getMealSlotLabelKey,
} from '@/lib/meal-constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import type { MealsViewProps } from './meals-shared';
import MealTimeChip from '@/components/meals/MealTimeChip';

interface MealsPlanViewProps extends MealsViewProps {
  /** Household GlobalSettings.timeFormat — resolves the effective format when
   *  the shared meal settings carry no explicit override */
  globalTimeFormat: TimeFormat;
  assignMealToSlot: (date: string, slot: MealSlotType, mealId: string) => Promise<void>;
  clearSlot: (date: string, slot: MealSlotType) => Promise<void>;
  setSlotTime: (date: string, slot: MealSlotType, time: string | undefined) => Promise<void>;
  clearAllPlan: () => void;
  suggestRandom: () => Promise<void>;
  copyLastWeek: () => Promise<void>;
  hasPreviousWeek: boolean;
  pickingSlot: { date: string; slot: MealSlotType } | null;
  setPickingSlot: React.Dispatch<React.SetStateAction<{ date: string; slot: MealSlotType } | null>>;
  setSubView: (v: 'library') => void;
}

export default function MealsPlanView({
  savedMeals,
  plan,
  weekDates,
  todayISO,
  getMealForSlot,
  globalTimeFormat,
  assignMealToSlot,
  clearSlot,
  setSlotTime,
  clearAllPlan,
  suggestRandom,
  copyLastWeek,
  hasPreviousWeek,
  pickingSlot,
  setPickingSlot,
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
  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={suggestRandom}
          disabled={savedMeals.length === 0}
          style={{
            flex: 1,
            padding: '8px 8px',
            minHeight: 44,
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            border: '1px solid var(--hs-border)',
            cursor: savedMeals.length === 0 ? 'default' : 'pointer',
            background: 'var(--hs-bg-panel)',
            color: savedMeals.length === 0 ? 'var(--hs-border-strong)' : 'var(--hs-text-muted)',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
          }}
          aria-label={t('mealsPlan.actions.suggestAriaLabel')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>
          {t('mealsPlan.actions.suggest')}
        </button>
        {hasPreviousWeek && (
          <button
            onClick={copyLastWeek}
            style={{
              flex: 1,
              padding: '8px 8px',
              minHeight: 44,
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: '1px solid var(--hs-border)',
              cursor: 'pointer',
              background: 'var(--hs-bg-panel)',
              color: 'var(--hs-text-muted)',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
            }}
            aria-label={t('mealsPlan.actions.copyLastWeekAriaLabel')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            {t('mealsPlan.actions.copyLastWeek')}
          </button>
        )}
        <button
          onClick={clearAllPlan}
          disabled={plan.length === 0}
          style={{
            flex: 1,
            padding: '8px 8px',
            minHeight: 44,
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            border: '1px solid var(--hs-border)',
            cursor: plan.length === 0 ? 'default' : 'pointer',
            background: 'var(--hs-bg-panel)',
            color: plan.length === 0 ? 'var(--hs-border-strong)' : 'var(--hs-text-muted)',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
          }}
          aria-label={t('mealsPlan.actions.clearAriaLabel')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          {t('mealsPlan.actions.clear')}
        </button>
      </div>

      {savedMeals.length === 0 && (
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

            {/* Stacked slot rows — full width to make room for the time chip */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {enabledSlotsOrdered.map((slot) => {
                const { planned, meal } = getMealForSlot(date, slot);
                const hasMeal = !!(meal || planned?.customText);
                const time = resolvePlannedMealTime(planned, slot, settings.defaultSlotTimes);
                const slotLabel = tModules(getMealSlotLabelKey(slot));
                const mealName = meal?.name ?? planned?.customText ?? t('mealsPlan.slot.mealFallback');

                return (
                  <div
                    key={slot}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 12px',
                      minHeight: 50,
                      borderRadius: 10,
                      border: hasMeal ? `1px solid ${SLOT_META[slot].color}30` : '1px dashed var(--hs-border)',
                      background: hasMeal ? `${SLOT_META[slot].color}10` : 'transparent',
                      overflow: 'visible' as const,
                    }}
                  >
                    {hasMeal ? (
                      <>
                        <button
                          type="button"
                          onClick={() => clearSlot(date, slot)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flex: 1,
                            minWidth: 0,
                            padding: 0,
                            border: 'none',
                            background: 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                            textAlign: 'left' as const,
                            fontFamily: 'inherit',
                          }}
                          aria-label={t('mealsPlan.slot.removeMealAriaLabel', { meal: mealName, slot: slotLabel })}
                        >
                          <div style={{ width: 3, height: 28, borderRadius: 2, background: SLOT_META[slot].color, flexShrink: 0 }} />
                          {meal?.emoji && <span style={{ fontSize: 18, flexShrink: 0 }}>{meal.emoji}</span>}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 10, color: SLOT_META[slot].color, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                              {slotLabel}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--hs-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {meal?.name ?? planned?.customText ?? ''}
                            </div>
                          </div>
                        </button>
                        <span style={{ flexShrink: 0 }}>
                          <MealTimeChip
                            value={time}
                            onChange={(tt) => setSlotTime(date, slot, tt)}
                            slot={slot}
                            variant="darker"
                            align="right"
                            timeFormat={resolveMealTimeFormat(settings, globalTimeFormat)}
                          />
                        </span>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPickingSlot({ date, slot })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flex: 1,
                          padding: 0,
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
                        <span style={{ fontSize: 11, color: 'var(--hs-text-faint)', marginLeft: 'auto' }}>{t('mealsPlan.slot.addMeal')}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {pickingSlot && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            top: 0,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
        >
          <div
            onClick={() => setPickingSlot(null)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
            }}
          />
          <div
            style={{
              position: 'relative',
              background: 'var(--hs-bg-body)',
              borderRadius: '16px 16px 0 0',
              maxHeight: '60vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--hs-text-faint)' }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--hs-text-primary)', padding: '8px 16px 10px', borderBottom: '1px solid var(--hs-border)' }}>
              {t('mealsPlan.picker.title')}
            </div>
            <div style={{ overflow: 'auto', padding: '8px 16px', flex: 1, scrollbarWidth: 'none' as const }}>
              {savedMeals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--hs-text-faint)', fontSize: 13 }}>
                  {t('mealsPlan.picker.emptyLibrary')}
                </div>
              ) : (
                savedMeals.map((meal) => (
                  <button
                    key={meal.id}
                    onClick={() => assignMealToSlot(pickingSlot.date, pickingSlot.slot, meal.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '11px 0',
                      border: 'none',
                      borderBottom: '1px solid var(--hs-border)',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left' as const,
                      color: 'inherit',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 24 }}>{meal.emoji ?? DEFAULT_MEAL_EMOJI}</span>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--hs-text-primary)' }}>{meal.name}</span>
                    {meal.prepTime ? (
                      <span style={{ fontSize: 11, color: 'var(--hs-text-faint)' }}>
                        {t('mealsPlan.picker.prepTimeShort', { minutes: meal.prepTime })}
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
            <div style={{ padding: '12px 16px 24px', borderTop: '1px solid var(--hs-border)' }}>
              <button
                onClick={() => {
                  clearSlot(pickingSlot.date, pickingSlot.slot);
                  setPickingSlot(null);
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  minHeight: 44,
                  borderRadius: 10,
                  border: '1px solid var(--hs-border)',
                  background: 'var(--hs-bg-panel)',
                  color: 'var(--hs-danger)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t('mealsPlan.picker.removeMealButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
