import { useMemo } from 'react';
import { FIT_MEASURE_ATTR } from '@/hooks/useFitScale';
import { SLOT_META, getLocalizedDayNames, getMealSlotLabelKey, resolveMealWithEntry, toISODate, getWeekDatesForRange, getWeekRange, formatMealTime, resolvePlannedMealTime, formatShortDayMonth, fromISODate } from '@/lib/meal-constants';
import { useFormattingLocale, useTranslate, formatDayRange } from '@/i18n';
import type { MealPlannerViewProps } from './meal-planner-utils';
import { countPlanned, px } from './meal-planner-utils';
import { MealTapTarget } from '../shared/MealTapTarget';
import FamilyEmptyState from '../FamilyEmptyState';
import MealPicture, { mealHasPicture } from '@/components/meals/MealPicture';
import { MealCourseNames } from '../shared/MealCourseLines';
import { useMealMinutes } from '../shared/useMealMinutes';

/**
 * The week as one row per day and a card per meal, sized for reading across
 * a kitchen. Every size is an authored canvas pixel at 1080 wide / `medium`
 * (see `px`), larger than the week can ever use: the module's fit loop shrinks
 * it until all seven days fit, and the days share whatever height is left, so
 * a light week reads large and a full one still fills the panel to the
 * bottom. On a landscape wall the day names stand to the left of their row
 * and each picture beside its dish, since the rows there are wide and short.
 */
export default function WeekView({
  settings, timeFormat, savedMeals, plan, now, slots, activeSlot, s, showEmoji, showPrepTime, showTitle, headerFont, bodyFont, recipeTapMode, landscape,
}: MealPlannerViewProps) {
  const t = useTranslate('modules');
  const mealMinutes = useMealMinutes();
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const P = (n: number) => px(s, n);
  const dayNamesShort = useMemo(() => getLocalizedDayNames(locale, 'short'), [locale]);
  const weekStartDay = settings.weekStartDay;
  const { start } = getWeekRange(now, weekStartDay);
  const weekDates = getWeekDatesForRange(start, weekStartDay);
  const todayISO = toISODate(now);

  // In the language's own order, as the calendar heads its week:
  // "October 26 – November 1, 2026", "26. Oktober – 1. November 2026".
  const dateRange = formatDayRange(fromISODate(weekDates[0]), fromISODate(weekDates[6]), locale);

  // Only slots the week actually uses get a column: with Snack on and one
  // apple planned, three empty tiles per day said nothing. A week with no
  // meals at all is one panel that says where meals are planned.
  const usedSlots = useMemo(
    () => slots.filter((slot) => weekDates.some((date) => resolveMealWithEntry(date, slot, plan, savedMeals).name)),
    [slots, weekDates, plan, savedMeals],
  );
  const weekEmpty = usedSlots.length === 0;
  const { filled, total, pct } = countPlanned(plan, weekDates.length * usedSlots.length);

  const isPast = (date: string) => date < todayISO;
  const pictureSize = P(landscape ? 76 : 84);
  const anyPictured = useMemo(
    () => showEmoji && weekDates.some((date) => usedSlots.some((slot) => mealHasPicture(resolveMealWithEntry(date, slot, plan, savedMeals).meal))),
    [showEmoji, weekDates, usedSlots, plan, savedMeals],
  );

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', fontFamily: bodyFont,
      padding: `${P(44)}px ${P(36)}px ${P(32)}px`,
    }}>
      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: P(18) }}>
        {showTitle && (
          <div style={{ fontFamily: headerFont, fontSize: P(56), fontWeight: 400, lineHeight: 1, color: 'var(--fmp-text)', letterSpacing: '-0.01em' }}>
            {t('fullscreen-meal-planner.thisWeeksMeals')}
          </div>
        )}
        <div style={{ fontSize: P(24), color: 'var(--fmp-text-3)', marginTop: showTitle ? P(10) : 0 }}>
          {dateRange}
        </div>
      </div>

      {weekEmpty && (
        <div data-testid="fmp-week-empty" style={{ flex: 1, display: 'flex', color: 'var(--fmp-text-2)' }}>
          <FamilyEmptyState
            icon={<>&#127869;</>}
            title={t('meal-planner.nothingPlannedThisWeek')}
            hint={t('meal-planner.planFromPhoneHint')}
            fontSize={P(44)}
          />
        </div>
      )}

      {/* Day rows */}
      {!weekEmpty && (
      // Measured by the module's fit loop: all seven days have to fit in this
      // box, since nobody can scroll a wall. Each row is as tall as its
      // meals and takes a share of the height left over, never less.
      <div className="fmp-scroll" {...{ [FIT_MEASURE_ATTR]: '' }} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: P(8) }}>
        {weekDates.map((date) => {
          const isToday = date === todayISO;
          const dayPast = isPast(date);
          const day = fromISODate(date).getDay();

          return (
            <div
              key={date}
              style={{
                flex: '1 0 auto',
                display: 'flex', flexDirection: landscape ? 'row' : 'column', gap: landscape ? P(14) : P(8),
                opacity: dayPast && !isToday ? `var(--fmp-past-op)` : 1,
                background: isToday ? `color-mix(in srgb, var(--fmp-accent) 6%, transparent)` : 'transparent',
                border: isToday ? `1px solid color-mix(in srgb, var(--fmp-accent) 20%, transparent)` : '1px solid transparent',
                borderRadius: P(16),
                padding: `${P(8)}px ${P(10)}px`,
              } as React.CSSProperties}
            >
              {/* Day label: above the row, or beside it on a landscape wall */}
              <div style={{
                flexShrink: 0,
                display: 'flex', flexDirection: landscape ? 'column' : 'row',
                alignItems: landscape ? 'flex-start' : 'baseline', justifyContent: landscape ? 'center' : 'flex-start',
                gap: landscape ? P(4) : P(12),
                width: landscape ? P(128) : undefined,
              }}>
                <span style={{
                  fontSize: P(26), fontWeight: 700, textTransform: 'uppercase' as const, lineHeight: 1.1,
                  letterSpacing: '0.06em', color: isToday ? 'var(--fmp-accent)' : 'var(--fmp-text-2)',
                }}>
                  {dayNamesShort[day]}
                </span>
                {/* Dated as the phone dates its week: "10/26", "26.10." */}
                <span style={{ fontSize: P(24), color: 'var(--fmp-text-3)', fontWeight: 500, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                  {formatShortDayMonth(date, locale)}
                </span>
                {isToday && (
                  <span style={{
                    fontSize: P(18), fontWeight: 700, color: 'var(--fmp-accent)',
                    background: `color-mix(in srgb, var(--fmp-accent) 12%, transparent)`,
                    padding: `${P(3)}px ${P(10)}px`, borderRadius: P(6),
                    textTransform: 'uppercase' as const, letterSpacing: '0.08em',
                    marginLeft: landscape ? 0 : 'auto', marginTop: landscape ? P(4) : 0,
                    alignSelf: landscape ? 'flex-start' : 'center',
                  }}>
                    {tCore('today')}
                  </span>
                )}
              </div>

              {/* Meal cards: as tall as the row, their meals centred in them */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: P(10) }}>
                {usedSlots.map((slot) => {
                  const { meal, planned, name, courses } = resolveMealWithEntry(date, slot, plan, savedMeals);
                  const time = resolvePlannedMealTime(planned, slot, settings.defaultSlotTimes);
                  const minutes = showPrepTime ? mealMinutes(meal) : null;
                  const meta = SLOT_META[slot];
                  const isActiveSlot = isToday && slot === activeSlot;
                  const pictured = showEmoji && mealHasPicture(meal);
                  const align = landscape ? 'flex-start' : 'center';

                  const slotLabel = (
                    <span data-testid="fmp-week-slot" style={{
                      fontSize: P(17), fontWeight: 700, lineHeight: 1.2,
                      textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                      color: meta.color, opacity: 0.9,
                    }}>
                      {t(getMealSlotLabelKey(slot))}
                    </span>
                  );

                  if (!name) {
                    // Quiet: nothing on the wall is tappable, so a dashed
                    // "+" box only looked like a button that never worked.
                    return (
                      <div key={slot} data-testid="fmp-empty-slot" style={{
                        flex: 1, minWidth: 0,
                        border: `1px solid var(--fmp-border-sub)`,
                        borderRadius: P(12),
                        padding: P(12),
                        display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
                        justifyContent: landscape ? 'center' : 'flex-start', gap: P(6),
                        textAlign: 'center' as const,
                        opacity: 0.55,
                      }}>
                        {slotLabel}
                        <span style={{
                          color: 'var(--fmp-text-3)', fontSize: P(24), fontWeight: 400, lineHeight: 1,
                          // In line with the meals beside it, under a label in line with theirs.
                          ...(landscape ? {} : { flex: 1, display: 'flex', alignItems: 'center' }),
                        }}>&mdash;</span>
                      </div>
                    );
                  }

                  const words = (
                    <div style={{
                      flex: landscape ? 1 : undefined, minWidth: 0, maxWidth: '100%',
                      display: 'flex', flexDirection: 'column', alignItems: align, gap: P(4),
                    }}>
                      {landscape && slotLabel}
                      <span data-testid="fmp-week-name" style={{
                        fontSize: P(30), fontWeight: 600, lineHeight: 1.15, color: 'var(--fmp-text)',
                        // Two lines before it is cut, broken between words
                        // unless one word is wider than the card.
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                        overflow: 'hidden', overflowWrap: 'break-word', maxWidth: '100%',
                      }}>
                        {name}
                      </span>
                      <MealCourseNames
                        courses={courses}
                        style={{
                          fontSize: P(23), lineHeight: 1.25, color: 'var(--fmp-text-2)', maxWidth: '100%',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                        }}
                      />
                      {(time || minutes) && (
                        <span style={{ display: 'flex', flexWrap: 'wrap', justifyContent: align, columnGap: P(10), fontSize: P(21), lineHeight: 1.2 }}>
                          {time && (
                            <span style={{ fontWeight: 600, color: 'var(--fmp-accent)', fontVariantNumeric: 'tabular-nums' }}>
                              {formatMealTime(time, timeFormat)}
                            </span>
                          )}
                          {minutes && <span style={{ color: 'var(--fmp-text-3)' }}>{minutes}</span>}
                        </span>
                      )}
                    </div>
                  );

                  return (
                    <div key={slot} style={{
                      flex: 1, minWidth: 0,
                      background: 'var(--fmp-surface)',
                      borderRadius: P(12),
                      border: isActiveSlot
                        ? `2px solid var(--fmp-accent)`
                        : '1px solid var(--fmp-border-sub)',
                      borderTop: `${P(4)}px solid ${meta.color}`,
                      boxShadow: isActiveSlot
                        ? `0 0 0 2px var(--fmp-accent), var(--fmp-card-shadow)`
                        : 'var(--fmp-card-shadow)',
                      padding: `${P(12)}px ${P(12)}px`,
                      // The meal is centred top to bottom whether or not it
                      // has a picture, so a meal typed in sits level with the
                      // ones beside it; on a portrait wall the slot names sit
                      // level along the top of the row.
                      display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
                      justifyContent: landscape ? 'center' : 'flex-start', gap: P(8),
                      position: 'relative' as const,
                      textAlign: landscape ? 'left' as const : 'center' as const,
                    }}>
                      {isActiveSlot && (
                        <span className="fmp-now-dot" style={{
                          position: 'absolute' as const, top: P(10), right: P(10),
                          width: P(10), height: P(10), borderRadius: '50%',
                          background: 'var(--fmp-accent)',
                        }} />
                      )}
                      {!landscape && slotLabel}
                      <MealTapTarget
                        meal={meal}
                        mode={recipeTapMode}
                        style={{
                          display: 'flex', flexDirection: landscape ? 'row' : 'column', alignItems: 'center',
                          gap: landscape ? P(14) : P(8), maxWidth: '100%', minWidth: 0,
                          ...(landscape ? { alignSelf: 'stretch' } : { flex: 1, justifyContent: 'center' }),
                        }}
                      >
                        {pictured ? (
                          <MealPicture
                            meal={meal}
                            photoSize={`${pictureSize}px`}
                            // As wide as a photo, so names line up behind either.
                            emojiStyle={{ fontSize: pictureSize * 0.72, lineHeight: 1, flexShrink: 0, width: pictureSize, textAlign: 'center' }}
                          />
                        ) : landscape && anyPictured && (
                          // A meal typed in keeps a picture's room, so its
                          // name starts where the other names in the column do.
                          <span aria-hidden style={{ width: pictureSize, flexShrink: 0 }} />
                        )}
                        {words}
                      </MealTapTarget>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Footer */}
      {!weekEmpty && (
      <div style={{
        paddingTop: P(16), flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: P(14),
      }}>
        <span style={{ fontSize: P(22), color: 'var(--fmp-text-3)', fontWeight: 500, whiteSpace: 'nowrap' as const }}>
          {t('fullscreen-meal-planner.mealsPlannedCount', { filled, total })}
        </span>
        <div style={{
          width: P(90), height: P(5), background: 'var(--fmp-border-sub)',
          borderRadius: P(3), overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', background: 'var(--fmp-accent)',
            borderRadius: P(3), width: `${pct}%`, transition: 'width 0.5s ease',
          }} />
        </div>
      </div>
      )}
    </div>
  );
}
