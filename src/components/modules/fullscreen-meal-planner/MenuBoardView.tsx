import type { MealSlotType, SavedMeal } from '@/types/config';
import { SLOT_META, SLOT_ORDER, getMealSlotLabelKey, resolveMealWithEntry, toISODate, formatMealTime, resolvePlannedMealTime } from '@/lib/meal-constants';
import { useFormattingLocale, useTranslate, formatDateSync } from '@/i18n';
import { FIT_MEASURE_ATTR } from '@/hooks/useFitScale';
import type { MealPlannerViewProps } from './meal-planner-utils';
import { getDifficultyColor, px } from './meal-planner-utils';
import { MealTapTarget } from '../shared/MealTapTarget';

/**
 * Today's menu as a restaurant board. The courses spread over the whole
 * height between the two ornaments, so four courses fill a 1920px panel and
 * two courses get twice the air rather than a stack stranded in the top
 * third. Sizes are authored canvas pixels at 1080 wide / `medium` (see `px`).
 */
export default function MenuBoardView({
  settings, timeFormat, savedMeals, plan, now, slots, s, showEmoji, showPrepTime, showDifficulty, showTitle, headerFont, bodyFont, recipeTapMode, landscape,
}: MealPlannerViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const P = (n: number) => px(s, n);
  const todayISO = toISODate(now);
  const dateStr = formatDateSync(now, 'EEEE, MMMM d', { locale });
  const activeOrder = SLOT_ORDER.filter((sl) => slots.includes(sl));

  const courses = activeOrder
    .map((sl) => {
      const { meal, planned } = resolveMealWithEntry(todayISO, sl, plan, savedMeals);
      const time = resolvePlannedMealTime(planned, sl, settings.defaultSlotTimes);
      return { slot: sl, meal, time, meta: SLOT_META[sl] };
    })
    .filter((c) => c.meal !== null) as { slot: MealSlotType; meal: SavedMeal; time: string | undefined; meta: { color: string } }[];

  // A wide panel with a full four-course day reads better two-up; anything
  // shorter stays a single centred column like the portrait board.
  const twoUp = landscape && courses.length >= 4;

  const divider = (
    <div style={{ width: '70%', display: 'flex', alignItems: 'center', gap: P(16), flexShrink: 0 }}>
      <div style={{ flex: 1, height: 2, background: 'var(--fmp-border)' }} />
      <span style={{ fontSize: P(22), color: 'var(--fmp-text-3)' }}>&#9670;</span>
      <div style={{ flex: 1, height: 2, background: 'var(--fmp-border)' }} />
    </div>
  );

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'space-between', height: '100%', fontFamily: bodyFont,
      padding: `${P(64)}px ${P(72)}px`, textAlign: 'center' as const,
    }}>
      {/* Ornament, title, date */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: P(30), color: 'var(--fmp-text-3)', letterSpacing: '0.5em' }}>
          &#10022; &#10022; &#10022;
        </div>
        {showTitle && (
          <div style={{
            fontFamily: headerFont, fontSize: P(84), fontWeight: 400, lineHeight: 1,
            color: 'var(--fmp-text)', marginTop: P(18), letterSpacing: '-0.01em',
          }}>
            {t('fullscreen-meal-planner.todaysMenu')}
          </div>
        )}
        <div style={{ fontSize: P(30), color: 'var(--fmp-text-3)', marginTop: P(14) }}>
          {dateStr}
        </div>
      </div>

      <div style={{ margin: `${P(30)}px 0`, width: '100%', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{divider}</div>

      {/* Courses */}
      <div
        {...{ [FIT_MEASURE_ATTR]: '' }}
        style={{
          flex: 1, minHeight: 0, width: '100%',
          display: twoUp ? 'grid' : 'flex',
          gridTemplateColumns: twoUp ? '1fr 1fr' : undefined,
          alignItems: twoUp ? 'center' : undefined,
          flexDirection: 'column', justifyContent: 'space-evenly',
          rowGap: twoUp ? P(40) : undefined,
        }}
      >
        {courses.length === 0 ? (
          <div style={{ fontFamily: headerFont, color: 'var(--fmp-text-3)', fontSize: P(60), lineHeight: 1.1 }}>
            {t('fullscreen-meal-planner.noMealsPlannedToday')}
          </div>
        ) : courses.map((course, i) => (
          <div key={course.slot} style={{ display: 'contents' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: P(10) }}>
              {/* Slot pill + serving time */}
              <span style={{
                fontSize: P(24), fontWeight: 700, textTransform: 'uppercase' as const,
                letterSpacing: '0.14em', color: course.meta.color,
                background: `${course.meta.color}1a`,
                padding: `${P(8)}px ${P(22)}px`, borderRadius: P(10),
                display: 'inline-flex', alignItems: 'baseline', gap: P(12),
              }}>
                <span>{t(getMealSlotLabelKey(course.slot))}</span>
                {course.time && (
                  <span style={{
                    fontWeight: 600, color: 'var(--fmp-text-3)', letterSpacing: 0,
                    textTransform: 'none' as const, fontVariantNumeric: 'tabular-nums',
                  }}>
                    {formatMealTime(course.time, timeFormat)}
                  </span>
                )}
              </span>

              {/* Emoji + name */}
              <MealTapTarget
                meal={course.meal}
                mode={recipeTapMode}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: P(10), width: '100%' }}
              >
                {showEmoji && course.meal.emoji && (
                  <div style={{ fontSize: P(150), lineHeight: 1 }}>
                    {course.meal.emoji}
                  </div>
                )}
                <div style={{
                  fontFamily: headerFont, fontSize: P(64), fontWeight: 400, lineHeight: 1.05,
                  color: 'var(--fmp-text)', letterSpacing: '-0.01em',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                }}>
                  {course.meal.name}
                </div>
              </MealTapTarget>

              {/* Notes */}
              {course.meal.notes && (
                <div style={{
                  fontSize: P(26), fontStyle: 'italic', color: 'var(--fmp-text-2)',
                  maxWidth: '80%', lineHeight: 1.3,
                }}>
                  {course.meal.notes}
                </div>
              )}

              {/* Meta */}
              {(showPrepTime || showDifficulty) && (course.meal.prepTime || course.meal.difficulty) && (
                <div style={{
                  display: 'flex', justifyContent: 'center', gap: P(20),
                  fontSize: P(26), color: 'var(--fmp-text-3)',
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
            </div>

            {/* Separator between courses (single column only) */}
            {!twoUp && i < courses.length - 1 && (
              <div style={{ width: '40%', height: 1, background: 'var(--fmp-border-sub)', margin: '0 auto', flexShrink: 0 }} />
            )}
          </div>
        ))}
      </div>

      <div style={{ margin: `${P(30)}px 0`, width: '100%', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{divider}</div>

      {/* Bottom ornament */}
      <div style={{ fontSize: P(30), color: 'var(--fmp-text-3)', letterSpacing: '0.5em', flexShrink: 0 }}>
        &#10022; &#10022; &#10022;
      </div>
    </div>
  );
}
