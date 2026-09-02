'use client';

import { useMemo } from 'react';
import type { MealSlotType, TimeFormat } from '@/types/config';
import {
  SLOT_META,
  SLOT_ORDER,
  SLOT_WINDOWS,
  formatMealTime,
  resolvePlannedMealTime,
  resolveMealTimeFormat,
  getLocalizedDayNames,
  getMealSlotLabelKey,
} from '@/lib/meal-constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import type { MealsViewProps } from './meals-shared';

interface MealsWeekViewProps extends MealsViewProps {
  /** Household GlobalSettings.timeFormat — resolves the effective format when
   *  the shared meal settings carry no explicit override */
  globalTimeFormat: TimeFormat;
  setSubView: (v: 'plan') => void;
}

export default function MealsWeekView({
  plan,
  weekDates,
  todayISO,
  activeSlot,
  currentHour,
  getMealForSlot,
  settings,
  globalTimeFormat,
  setSubView,
}: MealsWeekViewProps) {
  const t = useTranslate('remote');
  const tModules = useTranslate('modules');
  const formattingLocale = useFormattingLocale();
  const dayNamesFull = useMemo(
    () => getLocalizedDayNames(formattingLocale, 'full'),
    [formattingLocale],
  );
  const enabledSlotsOrdered = SLOT_ORDER.filter((s) => settings.enabledSlots.includes(s));
  const effectiveTimeFormat = resolveMealTimeFormat(settings, globalTimeFormat);

  return (
    <div style={{ paddingBottom: 80 }}>
      {weekDates.map(({ date, dayIndex, shortDate }) => {
        const isToday = date === todayISO;
        const isPast = date < todayISO;
        const dayLabel = dayNamesFull[dayIndex];

        return (
          <div key={date} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: isToday ? 'var(--hs-text-primary)' : 'var(--hs-text-muted)' }}>
                {dayLabel}
              </span>
              <span style={{ fontSize: 12, color: 'var(--hs-text-faint)' }}>{shortDate}</span>
              {isToday && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'rgba(245,158,11,0.12)',
                    color: '#f59e0b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginLeft: 'auto',
                  }}
                >
                  {t('mealsTab.weekView.todayBadge')}
                </span>
              )}
            </div>

            {enabledSlotsOrdered.map((slot: MealSlotType) => {
              const { planned, meal } = getMealForSlot(date, slot);
              const hasMeal = !!(meal || planned?.customText);
              const time = resolvePlannedMealTime(planned, slot, settings.defaultSlotTimes);
              // A slot is "past" today if its window has ended (currentHour >= window.end)
              const isPastSlot = isPast || (isToday && currentHour >= SLOT_WINDOWS[slot].end);
              const isCurrentSlot = isToday && slot === activeSlot;
              const slotLabel = tModules(getMealSlotLabelKey(slot));

              if (!hasMeal) {
                return (
                  <div
                    key={slot}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      marginBottom: 4,
                      borderRadius: 10,
                      border: '1px dashed var(--hs-border)',
                      opacity: isPastSlot ? 0.4 : 0.6,
                    }}
                  >
                    <div style={{ width: 4, height: 28, borderRadius: 2, background: SLOT_META[slot].color, opacity: 0.3 }} />
                    <span style={{ fontSize: 13, color: 'var(--hs-text-faint)' }}>
                      {t('mealsTab.weekView.notPlanned', { slot: slotLabel })}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={slot}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    marginBottom: 6,
                    borderRadius: 12,
                    background: 'var(--hs-bg-panel)',
                    opacity: isPastSlot ? 0.4 : 1,
                    border: isCurrentSlot ? '1px solid #f59e0b' : '1px solid var(--hs-border)',
                    boxShadow: isCurrentSlot ? '0 0 12px rgba(245,158,11,0.08)' : 'none',
                  }}
                >
                  <div style={{ width: 4, height: 28, borderRadius: 2, background: SLOT_META[slot].color }} />
                  {meal?.emoji && <span style={{ fontSize: 24 }}>{meal.emoji}</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--hs-text-faint)', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                        {slotLabel}{isCurrentSlot ? t('mealsTab.weekView.activeNowSuffix') : ''}
                      </span>
                      {time && (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: SLOT_META[slot].color,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {formatMealTime(time, effectiveTimeFormat)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--hs-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {meal?.name ?? planned?.customText ?? ''}
                    </div>
                  </div>
                  {meal?.prepTime && (
                    <span style={{ fontSize: 11, color: 'var(--hs-text-faint)', flexShrink: 0 }}>
                      {t('mealsTab.weekView.prepTimeMin', { minutes: meal.prepTime })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {plan.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ fontSize: 15, color: 'var(--hs-text-faint)', marginBottom: 4 }}>
            {t('mealsTab.weekView.empty.title')}
          </p>
          <p style={{ fontSize: 13, color: 'var(--hs-text-faint)', marginBottom: 20 }}>
            {t('mealsTab.weekView.empty.description')}
          </p>
          <button
            onClick={() => setSubView('plan')}
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
            {t('mealsTab.weekView.empty.planButton')}
          </button>
        </div>
      )}
    </div>
  );
}
