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
 * drink) listed under it, the pictures in one column and the names in the
 * next. Sizes are authored canvas pixels at 1080 wide / `medium` (see `px`).
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
  // With a picture anywhere on the board, every row keeps a picture's width
  // at its start, so the pictures stand in one column and a meal typed in
  // with none starts where the names do. A board with no pictures centres
  // each meal instead, as there is no column to line up with.
  const anyPictured = showEmoji && meals.some((c) => mealHasPicture(c.meal));
  const align = anyPictured ? 'flex-start' : 'center';

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

      {/* Courses: as wide as the widest meal and centred, so the rows share
          a left edge; a name too long for the panel wraps at its edge. Two-up,
          each column is as wide as its widest meal. */}
      <div
        {...{ [FIT_MEASURE_ATTR]: '' }}
        style={{
          flex: 1, minHeight: 0,
          width: twoUp ? '100%' : 'fit-content', maxWidth: '100%',
          display: twoUp ? 'grid' : 'flex',
          gridTemplateColumns: twoUp ? 'repeat(2, minmax(0, max-content))' : undefined,
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
          // Emoji count as pictures too, so a board mixing photos and emoji
          // lines up.
          const pictured = showEmoji && mealHasPicture(course.meal);
          const minutes = showPrepTime ? mealMinutes(course.meal) : null;
          return (
          <div key={course.slot} style={{ display: 'contents' }}>
            {/* Picture beside everything else, which shares one edge: slot
                pill, name, courses, note, cooking time */}
            <MealTapTarget
              meal={course.meal}
              mode={recipeTapMode}
              style={{ display: 'flex', alignItems: 'center', gap: P(30), minWidth: 0, textAlign: anyPictured ? 'left' : 'center' }}
            >
              {pictured ? (
                <MealPicture
                  meal={course.meal}
                  photoSize={`${P(140)}px`}
                  emojiStyle={{
                    width: P(140), height: P(140), flexShrink: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: P(110), lineHeight: 1,
                  }}
                />
              ) : anyPictured && (
                <span aria-hidden="true" style={{ width: P(140), flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: align }}>
                {/* Slot pill + serving time */}
                <span style={{
                  fontSize: P(24), fontWeight: 700, textTransform: 'uppercase' as const,
                  letterSpacing: '0.14em', color: course.meta.color,
                  background: `${course.meta.color}1a`,
                  padding: `${P(8)}px ${P(22)}px`, borderRadius: P(10),
                  display: 'inline-flex', alignItems: 'baseline', gap: P(12),
                  marginBottom: P(14),
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
                {/* Wraps across the whole row; three lines hold a long name
                    even at the largest text size. */}
                <div style={{
                  fontFamily: headerFont, fontSize: P(64), fontWeight: 400, lineHeight: 1.05,
                  color: 'var(--fmp-text)', letterSpacing: '-0.01em',
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                }}>
                  {course.name}
                </div>
                <MealCourseLines
                  courses={course.courses}
                  labelSize={`${P(22)}px`}
                  nameSize={`${P(32)}px`}
                  gap={`${P(16)}px`}
                  rowGap={`${P(6)}px`}
                  centered={!anyPictured}
                  labelStyle={{ color: 'var(--fmp-text-3)', fontWeight: 700, letterSpacing: '0.14em' }}
                  nameStyle={{ color: 'var(--fmp-text-2)', lineHeight: 1.2, whiteSpace: 'normal' }}
                  style={{ marginTop: P(14) }}
                />
                {course.notes.map((note) => (
                  <div key={note} style={{
                    fontSize: P(26), fontStyle: 'italic', color: 'var(--fmp-text-2)',
                    lineHeight: 1.3, marginTop: P(10),
                  }}>
                    {note}
                  </div>
                ))}
                {(minutes || (showDifficulty && course.meal?.difficulty)) && (
                  <div style={{ display: 'flex', gap: P(20), fontSize: P(26), color: 'var(--fmp-text-3)', marginTop: P(12) }}>
                    {minutes && (
                      <span>&#128339; {minutes}</span>
                    )}
                    {showDifficulty && course.meal?.difficulty && (() => {
                      const dc = getDifficultyColor(course.meal.difficulty);
                      return <span style={{ color: dc ?? undefined }}>{course.meal.difficulty}</span>;
                    })()}
                  </div>
                )}
              </div>
            </MealTapTarget>

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
