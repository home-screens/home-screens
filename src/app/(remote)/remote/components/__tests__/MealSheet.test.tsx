// @vitest-environment jsdom

/**
 * The phone's meal sheet offers the ways to add a dish only while the meal
 * has room for one: at twelve dishes the picker opened, the pick was refused
 * without a word, and nothing said why.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import core from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import remote from '@/translations/en-US/remote.json';
import { DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import { MAX_COURSES } from '@/lib/meal-courses';
import type { PlannedMeal } from '@/types/config';
import MealSheet from '../MealSheet';

afterEach(cleanup);

function renderSheet(planned: PlannedMeal) {
  return render(
    <I18nProvider locale="en-US" blob={{ core, modules, remote }}>
      <MealSheet
        date="2026-11-02"
        slot="dinner"
        planned={planned}
        meals={[]}
        settings={DEFAULT_MEAL_SETTINGS}
        globalTimeFormat="12h"
        todayISO="2026-11-02"
        fromMealie={false}
        paused={null}
        onRetry={() => {}}
        onClose={() => {}}
        onPick={() => {}}
        onMoveCourse={() => {}}
        onRemoveCourse={() => {}}
        onSetTime={() => {}}
        onClear={() => {}}
      />
    </I18nProvider>,
  );
}

describe('the meal sheet', () => {
  it('offers a side, a dessert, a drink and another main for a meal with room', () => {
    renderSheet({ date: '2026-11-02', slot: 'dinner', customText: 'Tacos' });
    for (const name of ['Add a side', 'Add a dessert', 'Add a drink', 'Add another main']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('offers nothing to add once the meal is full', () => {
    const courses = Array.from({ length: MAX_COURSES }, (_, i) => ({ kind: 'side' as const, customText: `Side ${i + 1}` }));
    renderSheet({ date: '2026-11-02', slot: 'dinner', customText: 'Tacos', courses });
    expect(screen.queryByRole('button', { name: /^Add a/ })).toBeNull();
    expect(screen.getAllByTestId('meal-sheet-course')).toHaveLength(MAX_COURSES);
  });
});
