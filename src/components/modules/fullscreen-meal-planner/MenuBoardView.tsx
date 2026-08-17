import type { MealSlotType, SavedMeal } from '@/types/config';
import { SLOT_META, SLOT_ORDER, getMealSlotLabelKey, resolveMealWithEntry, toISODate, formatMealTime, resolvePlannedMealTime } from '@/lib/meal-constants';
import { useFormattingLocale, useTranslate, formatDateSync } from '@/i18n';
import type { MealPlannerViewProps } from './meal-planner-utils';
import { getDifficultyColor } from './meal-planner-utils';
import { MealTapTarget } from '../shared/MealTapTarget';

export default function MenuBoardView({
  settings, timeFormat, savedMeals, plan, now, slots, s, pad, showEmoji, showPrepTime, showDifficulty, headerFont, bodyFont, recipeTapMode,
}: MealPlannerViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const todayISO = toISODate(now);
  const dateStr = formatDateSync(now, 'EEEE, MMMM d', { locale });
  const activeOrder = SLOT_ORDER.filter((sl) => slots.includes(sl));

  // Only show slots that have a meal planned
  const courses = activeOrder
    .map((sl) => {
      const { meal, planned } = resolveMealWithEntry(todayISO, sl, plan, savedMeals);
      const time = resolvePlannedMealTime(planned, sl, settings.defaultSlotTimes);
      return { slot: sl, meal, time, meta: SLOT_META[sl] };
    })
    .filter((c) => c.meal !== null) as { slot: MealSlotType; meal: SavedMeal; time: string | undefined; meta: { color: string } }[];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', fontFamily: bodyFont,
      padding: pad, textAlign: 'center' as const,
    }}>
      {/* Ornamental top */}
      <div style={{ fontSize: s * 1, color: 'var(--fmp-text-3)', letterSpacing: '0.5em', marginBottom: s * 1 }}>
        &#10022; &#10022; &#10022;
      </div>

      {/* Title */}
      <div style={{
        fontFamily: headerFont, fontSize: s * 2.4, fontWeight: 400,
        color: 'var(--fmp-text)', marginBottom: s * 0.5,
      }}>
        {t('fullscreen-meal-planner.todaysMenu')}
      </div>

      {/* Date */}
      <div style={{ fontSize: s * 0.85, color: 'var(--fmp-text-3)', marginBottom: s * 1.5 }}>
        {dateStr}
      </div>

      {/* Decorative divider */}
      <div style={{
        width: '60%', display: 'flex', alignItems: 'center', gap: s * 0.5,
        marginBottom: s * 1.5,
      }}>
        <div style={{ flex: 1, height: 1, background: 'var(--fmp-border)' }} />
        <span style={{ fontSize: s * 0.7, color: 'var(--fmp-text-3)' }}>&#9670;</span>
        <div style={{ flex: 1, height: 1, background: 'var(--fmp-border)' }} />
      </div>

      {/* Courses */}
      <div className="fmp-scroll" style={{
        display: 'flex', flexDirection: 'column', gap: s * 1.5,
        width: '100%', maxWidth: s * 40, flex: courses.length > 3 ? 1 : undefined, minHeight: 0,
      }}>
        {courses.length === 0 ? (
          <div style={{ color: 'var(--fmp-text-3)', fontSize: s * 1, padding: `${s * 3}px 0` }}>
            {t('fullscreen-meal-planner.noMealsPlannedToday')}
          </div>
        ) : courses.map((course, i) => (
          <div key={course.slot}>
            {/* Slot pill + serving time */}
            <div style={{ marginBottom: s * 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: s * 0.5 }}>
              <span style={{
                fontSize: s * 0.6, fontWeight: 700, textTransform: 'uppercase' as const,
                letterSpacing: '0.12em', color: course.meta.color,
                background: `${course.meta.color}1a`,
                padding: `${s * 0.15}px ${s * 0.6}px`, borderRadius: s * 0.3,
              }}>
                {t(getMealSlotLabelKey(course.slot))}
              </span>
              {course.time && (
                <span style={{
                  fontSize: s * 0.6, fontWeight: 600, color: 'var(--fmp-text-3)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatMealTime(course.time, timeFormat)}
                </span>
              )}
            </div>

            {/* Emoji + name */}
            <MealTapTarget
              meal={course.meal}
              mode={recipeTapMode}
              style={{ display: 'block', width: '100%' }}
            >
              {showEmoji && course.meal.emoji && (
                <div style={{ fontSize: s * 2, lineHeight: 1, marginBottom: s * 0.3 }}>
                  {course.meal.emoji}
                </div>
              )}
              <div style={{
                fontFamily: headerFont, fontSize: s * 1.6, fontWeight: 400,
                color: 'var(--fmp-text)', marginBottom: s * 0.3,
              }}>
                {course.meal.name}
              </div>
            </MealTapTarget>

            {/* Notes */}
            {course.meal.notes && (
              <div style={{
                fontSize: s * 0.75, fontStyle: 'italic', color: 'var(--fmp-text-2)',
                marginBottom: s * 0.3, maxWidth: '80%', marginLeft: 'auto', marginRight: 'auto',
              }}>
                {course.meal.notes}
              </div>
            )}

            {/* Meta */}
            {(showPrepTime || showDifficulty) && (course.meal.prepTime || course.meal.difficulty) && (
              <div style={{
                display: 'flex', justifyContent: 'center', gap: s * 0.8,
                fontSize: s * 0.65, color: 'var(--fmp-text-3)',
              }}>
                {showPrepTime && course.meal.prepTime && (
                  <span>&#128339; {t('fullscreen-meal-planner.prepTimeMin', { minutes: course.meal.prepTime })}</span>
                )}
                {showDifficulty && course.meal.difficulty && (() => {
                  const dc = getDifficultyColor(course.meal.difficulty);
                  return <span style={{ color: dc ?? undefined }}>{course.meal.difficulty}</span>;
                })()}
              </div>
            )}

            {/* Divider between courses */}
            {i < courses.length - 1 && (
              <div style={{
                width: '40%', height: 1, background: 'var(--fmp-border-sub)',
                margin: `${s * 1}px auto 0`,
              }} />
            )}
          </div>
        ))}
      </div>

      {/* Bottom ornament */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: s * 0.5,
        width: '60%', marginTop: s * 1.5,
      }}>
        <div style={{ flex: 1, height: 1, background: 'var(--fmp-border)' }} />
        <span style={{ fontSize: s * 0.7, color: 'var(--fmp-text-3)' }}>&#9670;</span>
        <div style={{ flex: 1, height: 1, background: 'var(--fmp-border)' }} />
      </div>
      <div style={{ fontSize: s * 1, color: 'var(--fmp-text-3)', letterSpacing: '0.5em', marginTop: s * 1 }}>
        &#10022; &#10022; &#10022;
      </div>
    </div>
  );
}
