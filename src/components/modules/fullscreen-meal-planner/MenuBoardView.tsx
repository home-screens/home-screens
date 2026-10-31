import { SLOT_META, SLOT_ORDER, getMealSlotLabelKey, resolveMealWithEntry, toISODate, formatMealTime, resolvePlannedMealTime } from '@/lib/meal-constants';
import { useFormattingLocale, useTranslate, fullDateHeading } from '@/i18n';
import { FIT_MEASURE_ATTR } from '@/hooks/useFitScale';
import type { MealPlannerViewProps } from './meal-planner-utils';
import { getDifficultyColor, px } from './meal-planner-utils';
import { MealTapTarget } from '../shared/MealTapTarget';
import MealPicture, { mealHasPicture } from '@/components/meals/MealPicture';
import { MealCourseLines } from '../shared/MealCourseLines';
import { useMealMinutes } from '../shared/useMealMinutes';

/**
 * Today's menu as a restaurant board. The day's meals spread over the whole
 * height between the two ornaments, so four meals fill a 1920px panel and
 * two get twice the air rather than a stack stranded in the top third. Each
 * dish has its picture beside its name and its courses (sides, dessert,
 * drink) listed under it. Sizes are authored canvas pixels at 1080 wide /
 * `medium` (see `px`).
 */
export default function MenuBoardView({
  settings, timeFormat, savedMeals, plan, now, slots, s, showEmoji, showPrepTime, showDifficulty, showTitle, headerFont, bodyFont, recipeTapMode, landscape,
}: MealPlannerViewProps) {
  const t = useTranslate('modules');
  const mealMinutes = useMealMinutes();
  const locale = useFormattingLocale();
  const P = (n: number) => px(s, n);
  const todayISO = toISODate(now);
  const dateStr = fullDateHeading(now, locale);
  const activeOrder = SLOT_ORDER.filter((sl) => slots.includes(sl));

  const meals = activeOrder
    .map((sl) => {
      const { meal, planned, name, courses, notes } = resolveMealWithEntry(todayISO, sl, plan, savedMeals);
      const time = resolvePlannedMealTime(planned, sl, settings.defaultSlotTimes);
      return { slot: sl, meal, name, courses, notes, time, meta: SLOT_META[sl] };
    })
    // A meal on the board is a slot with something in it, which includes one
    // typed straight into the day and so having no library entry behind it.
    .filter((c): c is typeof c & { name: string } => c.name !== null);

  // A wide panel with a full four-meal day reads better two-up; anything
  // shorter stays a single centred column like the portrait board.
  const twoUp = landscape && meals.length >= 4;

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
        {meals.length === 0 ? (
          <div style={{ fontFamily: headerFont, color: 'var(--fmp-text-3)', fontSize: P(60), lineHeight: 1.1 }}>
            {t('fullscreen-meal-planner.noMealsPlannedToday')}
          </div>
        ) : meals.map((course, i) => {
          // The picture sits beside the name for every dish, emoji too, so a
          // board mixing photos and emoji lines up; typed text has none and
          // stays centred.
          const pictured = showEmoji && mealHasPicture(course.meal);
          const minutes = showPrepTime ? mealMinutes(course.meal) : null;
          const prep = minutes || (showDifficulty && course.meal?.difficulty) ? (
            <div style={{
              display: 'flex', justifyContent: 'center', gap: P(20),
              fontSize: P(26), color: 'var(--fmp-text-3)', marginTop: pictured ? P(12) : 0,
            }}>
              {minutes && (
                <span>&#128339; {minutes}</span>
              )}
              {showDifficulty && course.meal?.difficulty && (() => {
                const dc = getDifficultyColor(course.meal.difficulty);
                return <span style={{ color: dc ?? undefined }}>{course.meal.difficulty}</span>;
              })()}
            </div>
          ) : null;
          return (
          <div key={course.slot} style={{ display: 'contents' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: P(14) }}>
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

              {/* Picture beside the name, courses under it */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: P(30), width: '100%', maxWidth: P(860) }}>
                <MealTapTarget
                  meal={course.meal}
                  mode={recipeTapMode}
                  style={{ display: 'flex', alignItems: 'center', gap: P(30), minWidth: 0 }}
                >
                  {pictured && (
                    <MealPicture
                      meal={course.meal}
                      photoSize={`${P(140)}px`}
                      emojiStyle={{
                        width: P(140), height: P(140), flexShrink: 0, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: P(110), lineHeight: 1,
                      }}
                    />
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: pictured ? 'flex-start' : 'center', minWidth: 0 }}>
                    <div style={{
                      fontFamily: headerFont, fontSize: P(64), fontWeight: 400, lineHeight: 1.05,
                      color: 'var(--fmp-text)', letterSpacing: '-0.01em', textAlign: pictured ? 'left' : 'center',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                    }}>
                      {course.name}
                    </div>
                    <MealCourseLines
                      courses={course.courses}
                      labelSize={`${P(22)}px`}
                      nameSize={`${P(32)}px`}
                      gap={`${P(16)}px`}
                      rowGap={`${P(6)}px`}
                      labelStyle={{ color: 'var(--fmp-text-3)', fontWeight: 700, letterSpacing: '0.14em' }}
                      nameStyle={{ color: 'var(--fmp-text-2)', lineHeight: 1.2, whiteSpace: 'normal' }}
                      style={{ marginTop: P(14), gridTemplateColumns: 'auto auto' }}
                    />
                    {course.notes && (
                      <div style={{
                        fontSize: P(26), fontStyle: 'italic', color: 'var(--fmp-text-2)',
                        lineHeight: 1.3, marginTop: P(10), textAlign: pictured ? 'left' : 'center',
                      }}>
                        {course.notes}
                      </div>
                    )}
                    {pictured && prep}
                  </div>
                </MealTapTarget>
              </div>
              {!pictured && prep}
            </div>

            {/* Separator between meals (single column only) */}
            {!twoUp && i < meals.length - 1 && (
              <div style={{ width: '40%', height: 1, background: 'var(--fmp-border-sub)', margin: '0 auto', flexShrink: 0 }} />
            )}
          </div>
          );
        })}
      </div>

      <div style={{ margin: `${P(30)}px 0`, width: '100%', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{divider}</div>

      {/* Bottom ornament */}
      <div style={{ fontSize: P(30), color: 'var(--fmp-text-3)', letterSpacing: '0.5em', flexShrink: 0 }}>
        &#10022; &#10022; &#10022;
      </div>
    </div>
  );
}
