'use client';

import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import type { SavedMeal } from '@/types/config';
import { currentMealSlot, minutesOfDay, resolvePlannedMealTime, toISODate } from '@/lib/meal-constants';
import { nextRecipeMeal } from '@/lib/meal-recipe';
import { useTranslate } from '@/i18n';
import type { MealPlannerViewProps } from './meal-planner-utils';
import { px } from './meal-planner-utils';
import { RecipeSheet } from '../shared/RecipeSheet';
import { useMealRecipe } from '../shared/useMealRecipe';

// Lazy, like the tap target's: the card brings qrcode.react, which the other
// meal views never need.
const RecipeCard = lazy(() => import('../shared/RecipeCard').then((m) => ({ default: m.RecipeCard })));

/**
 * The next meal's recipe, big enough to read from across the kitchen: the
 * next meal that has one (a typed "Eating out" is passed over), on today
 * while today has a meal to come and on tomorrow once it is over
 * (`nextRecipeMeal`). On a touch screen its courses open their own recipes
 * on a card.
 */
export default function RecipeView({
  settings, timeFormat, savedMeals, plan, now, slots, s, pad, showEmoji, headerFont, bodyFont, landscape, interactive,
}: MealPlannerViewProps) {
  const t = useTranslate('modules');
  const P = useCallback((n: number) => px(s, n), [s]);
  const todayISO = toISODate(now);
  const nowMinutes = minutesOfDay(now);
  const lead = useMemo(
    () => nextRecipeMeal(todayISO, nowMinutes, plan, savedMeals, slots, settings.defaultSlotTimes),
    [todayISO, nowMinutes, plan, savedMeals, slots, settings.defaultSlotTimes],
  );
  const next = lead.kind === 'meal' ? lead.next : null;
  const recipe = useMealRecipe(next?.meal ?? null);
  const [course, setCourse] = useState<SavedMeal | null>(null);

  const serving = useMemo(() => {
    if (!next) return null;
    const planned = plan.find((p) => p.date === next.date && p.slot === next.slot);
    const time = resolvePlannedMealTime(planned, next.slot, settings.defaultSlotTimes);
    const servingNow = next.date === todayISO
      && currentMealSlot(todayISO, nowMinutes, slots, plan, savedMeals, settings.defaultSlotTimes) === next.slot;
    return { slot: next.slot, ...(time ? { time } : {}), now: servingNow };
  }, [next, plan, settings.defaultSlotTimes, todayISO, nowMinutes, slots, savedMeals]);

  if (!next) {
    const day = lead.kind === 'none' ? lead.day : 'today';
    return (
      <div data-testid="fmp-recipe-none" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%',
        fontFamily: bodyFont, gap: P(28), padding: pad, textAlign: 'center',
      }}>
        <span style={{ fontSize: P(220), lineHeight: 1, opacity: 0.3 }}>&#127869;</span>
        <span style={{ fontFamily: headerFont, fontSize: P(76), lineHeight: 1.1, color: 'var(--fmp-text)' }}>
          {t(day === 'today' ? 'fullscreen-meal-planner.noRecipeToday' : 'fullscreen-meal-planner.noRecipeTomorrow')}
        </span>
        <span style={{ fontSize: P(36), color: 'var(--fmp-text-3)', maxWidth: '80%', lineHeight: 1.35 }}>
          {t(day === 'today' ? 'fullscreen-meal-planner.noRecipeTodayHint' : 'fullscreen-meal-planner.noRecipeTomorrowHint')}
        </span>
      </div>
    );
  }

  return (
    <div data-testid="fmp-recipe" style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: bodyFont }}>
      <RecipeSheet
        meal={next.meal}
        recipe={recipe}
        serving={serving}
        courses={next.courses}
        timeFormat={timeFormat}
        P={P}
        padding={`${P(56)}px ${P(56)}px ${P(52)}px`}
        headerFont={headerFont}
        layout={landscape ? 'landscape' : 'portrait'}
        showPicture={showEmoji}
        interactive={interactive}
        onCourse={setCourse}
        resetKey={`${next.date}|${next.slot}|${next.meal.id}`}
      />
      {course && (
        <Suspense fallback={null}>
          <RecipeCard meal={course} at={{ date: next.date, slot: next.slot }} onClose={() => setCourse(null)} />
        </Suspense>
      )}
    </div>
  );
}
