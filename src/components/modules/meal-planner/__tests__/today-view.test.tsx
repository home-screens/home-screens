// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import { I18nProvider } from '@/i18n/provider';
import { DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import type { MealPlannerConfig, PlannedMeal, SavedMeal } from '@/types/config';
import { TodayView } from '../TodayView';

afterEach(cleanup);

const meals: SavedMeal[] = [
  { id: 'tacos', name: 'Tacos', tags: ['kid-friendly'] },
  { id: 'soup', name: 'Soup' },
];
// Saturday's dinner, and Sunday's, which starts the next week.
const plan: PlannedMeal[] = [
  { date: '2026-04-04', slot: 'dinner', mealId: 'tacos' },
  { date: '2026-04-05', slot: 'dinner', mealId: 'soup' },
];

function todayAt(nowMinutes: number, showTitle = true) {
  return render(
    <I18nProvider locale="en-US" blob={{ core, modules }}>
      <TodayView
        config={{ view: 'today', showTags: true, showTitle } as MealPlannerConfig}
        settings={DEFAULT_MEAL_SETTINGS}
        timeFormat="12h"
        plan={plan}
        savedMeals={meals}
        todayISO="2026-04-04"
        nowMinutes={nowMinutes}
        recipeTapMode="off"
      />
    </I18nProvider>,
  );
}

describe('the small Today view', () => {
  it("shows today's meals while today has one to come, its tags worded as the phone words them", () => {
    const { container } = todayAt(12 * 60);
    expect(container.textContent).toContain("Today's Meals");
    expect(container.textContent).toContain('Tacos');
    expect(container.textContent).toContain('Kid-Friendly');
  });

  /* It kept tonight's finished dinner up until midnight, while the
   * full-screen Today and Next meal had moved on to tomorrow. */
  it("turns to tomorrow once today's last meal is over, into next week too", () => {
    const { container } = todayAt(21 * 60);
    expect(container.textContent).toContain("Tomorrow's Meals");
    expect(container.textContent).toContain('Soup');
    expect(container.textContent).not.toContain('Tacos');
  });

  /* With the title off nothing would say the meals shown are tomorrow's. */
  it('stays on today with its title off', () => {
    const { container } = todayAt(21 * 60, false);
    expect(container.textContent).toContain('Tacos');
    expect(container.textContent).not.toContain('Soup');
  });
});
