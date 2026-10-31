'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { MealSlotType, TimeFormat } from '@/types/config';
import {
  SLOT_META,
  SLOT_ORDER,
  formatMealTime,
  resolvePlannedMealTime,
  resolveMealTimeFormat,
  getLocalizedDayNames,
  getMealSlotLabelKey,
  formatShortDayMonth,
} from '@/lib/meal-constants';
import { getMealCourseLabelKey } from '@/lib/meal-courses';
import { mealHasPicture } from '@/components/meals/MealPicture';
import { mealShownMinutes } from '@/lib/meal-dish-rules';
import { shownWeek } from '@/lib/meal-plan-words';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { formatShownMinutes, type MealsViewProps } from './meals-shared';
import MealThumb from './MealThumb';

interface MealsWeekViewProps extends MealsViewProps {
  /** Household GlobalSettings.timeFormat — resolves the effective format when
   *  the shared meal settings carry no explicit override */
  globalTimeFormat: TimeFormat;
  setSubView: (v: 'plan') => void;
  /** Open the meal sheet on a planned meal, where a long name reads in full. */
  onOpenMeal: (date: string, slot: MealSlotType) => void;
}

/** The bar, the photo and the gaps between them: where a course line starts. */
const BAR = 4;
const PHOTO = 40;
const GAP = 12;

export default function MealsWeekView({
  weekDates,
  todayISO,
  activeSlot,
  getMealForSlot,
  settings,
  globalTimeFormat,
  setSubView,
  onOpenMeal,
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
  // Only the slots the household plans: a snack Mealie holds stays off a
  // week that has no snack row, as it does on the wall.
  const nothingPlanned = weekDates.every(({ date }) => enabledSlotsOrdered.every((slot) => !getMealForSlot(date, slot).name));
  const week = useMemo(
    () => shownWeek(weekDates.map((d) => d.date), todayISO, formattingLocale),
    [weekDates, todayISO, formattingLocale],
  );

  // Open on today, not at the top of the week: by Friday evening tonight's
  // dinner was four finished days down the page.
  const todayRef = useRef<HTMLDivElement>(null);
  const showsToday = weekDates.some(({ date }) => date === todayISO);
  useEffect(() => {
    if (showsToday && weekDates[0]?.date !== todayISO) todayRef.current?.scrollIntoView({ block: 'start' });
    // Once per week shown: a later poll must not pull the page back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showsToday, weekDates[0]?.date]);

  return (
    <div style={{ paddingBottom: 80 }}>
      {weekDates.map(({ date, dayIndex }) => {
        const isToday = date === todayISO;
        const isPast = date < todayISO;
        const dayLabel = dayNamesFull[dayIndex];

        return (
          <div key={date} ref={isToday ? todayRef : undefined} style={{ marginBottom: 16, scrollMarginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: isToday ? 'var(--hs-text-primary)' : 'var(--hs-text-muted)' }}>
                {dayLabel}
              </span>
              <span style={{ fontSize: 12, color: 'var(--hs-text-faint)' }}>{formatShortDayMonth(date, formattingLocale)}</span>
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
              const { planned, meal, name, courses } = getMealForSlot(date, slot);
              const time = resolvePlannedMealTime(planned, slot, settings.defaultSlotTimes);
              const isCurrentSlot = isToday && slot === activeSlot;
              const slotLabel = tModules(getMealSlotLabelKey(slot));

              if (!name) {
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
                      opacity: isPast ? 0.4 : 0.6,
                    }}
                  >
                    <div style={{ width: 4, height: 28, borderRadius: 2, background: SLOT_META[slot].color, opacity: 0.3 }} />
                    <span style={{ fontSize: 13, color: 'var(--hs-text-faint)' }}>
                      {t('mealsTab.weekView.notPlanned', { slot: slotLabel })}
                    </span>
                  </div>
                );
              }

              const shown = mealShownMinutes(meal);
              const hasPhoto = mealHasPicture(meal);
              // A tap opens the meal sheet Plan opens: the whole name, the
              // courses and the time, to read or change.
              return (
                <button
                  key={slot}
                  type="button"
                  data-testid="meals-week-row"
                  onClick={() => onOpenMeal(date, slot)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    color: 'inherit',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    padding: '10px 12px',
                    marginBottom: 6,
                    borderRadius: 12,
                    background: 'var(--hs-bg-panel)',
                    // Only earlier days fade: today's meals stay at full
                    // strength all day, so tonight still reads as today after dinner.
                    opacity: isPast ? 0.4 : 1,
                    border: isCurrentSlot ? '1px solid #f59e0b' : '1px solid var(--hs-border)',
                    boxShadow: isCurrentSlot ? '0 0 12px rgba(245,158,11,0.08)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: GAP }}>
                    <div style={{ width: BAR, height: 28, borderRadius: 2, background: SLOT_META[slot].color, flex: 'none' }} />
                    <MealThumb meal={meal} size={PHOTO} radius={8} emojiSize={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: 'var(--hs-text-faint)', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', lineHeight: '15px' }}>
                          {slotLabel}{isCurrentSlot ? t('mealsTab.weekView.activeNowSuffix') : ''}
                        </span>
                        {time && (
                          <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: SLOT_META[slot].color,
                            fontVariantNumeric: 'tabular-nums',
                            lineHeight: '16px',
                          }}>
                            {formatMealTime(time, effectiveTimeFormat)}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--hs-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '21px' }}>
                        {name}
                      </div>
                    </div>
                    {shown && (
                      <span style={{ fontSize: 11, color: 'var(--hs-text-faint)', flexShrink: 0 }}>
                        {formatShownMinutes(shown, t)}
                      </span>
                    )}
                  </div>
                  {courses.length > 0 && (
                    <div
                      data-testid="meals-week-courses"
                      style={{
                        margin: `8px 0 0 ${BAR + GAP + (hasPhoto ? PHOTO + GAP : 0)}px`,
                        paddingTop: 7,
                        borderTop: '1px solid var(--hs-border)',
                        display: 'grid',
                        // Every label as wide as the widest, so the names line
                        // up whatever the language calls a side.
                        gridTemplateColumns: 'minmax(50px, max-content) minmax(0, 1fr)',
                        columnGap: 8,
                        rowGap: 3,
                        alignItems: 'baseline',
                      }}
                    >
                      {courses.map((course, i) => (
                        <div key={i} style={{ display: 'contents' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--hs-text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '18px', whiteSpace: 'nowrap' }}>
                            {tModules(getMealCourseLabelKey(course.kind))}
                          </span>
                          <span style={{ fontSize: 13, color: 'var(--hs-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '18px', minWidth: 0 }}>
                            {course.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}

      {nothingPlanned && (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ fontSize: 15, color: 'var(--hs-text-faint)', marginBottom: 4 }}>
            {week.thisWeek ? t('mealsTab.weekView.empty.title') : t('mealsTab.weekView.empty.titleDates', { range: week.range })}
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
