// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE, type FullscreenMealPlannerConfig, type MealPlannerConfig } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import enUSCore from '@/translations/en-US/core.json';
import { toISODate } from '@/lib/meal-constants';

const fetchState = vi.hoisted(() => ({ result: [null, null, null] as [unknown, unknown, unknown] }));
vi.mock('@/hooks/useFetchData', () => ({ useFetchData: () => fetchState.result }));

import MealPlannerModule from '../MealPlannerModule';
import FullscreenMealPlannerModule from '../../fullscreen-meal-planner/FullscreenMealPlannerModule';

// jsdom has no ResizeObserver; the size hooks only need it to exist.
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

const wrap = (node: React.ReactNode) => render(
  <I18nProvider locale="en-US" blob={{ modules: enUSModules, core: enUSCore }}>{node}</I18nProvider>,
);

/** A day `days` from today, as the plan keys it. */
function day(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Tonight's dinner, and one a week on (the same weekday, so always next week). */
function seed() {
  fetchState.result = [{
    savedMeals: [{ id: 'a', name: 'Taco Night' }, { id: 'b', name: 'Kung Pao Chicken' }],
    plan: [{ slot: 'dinner', mealId: 'a', date: day(0) }, { slot: 'dinner', mealId: 'b', date: day(7) }],
  }, null, Date.now()];
}

afterEach(() => {
  cleanup();
  fetchState.result = [null, null, null];
});

describe('meal planner look-ahead arrows', () => {
  it.each(['week', 'list'] as const)('the small %s view steps to next week\'s meals and back', (view) => {
    seed();
    const { getByTestId, queryByTestId, container } = wrap(
      <MealPlannerModule config={{ view, accentColor: '#f59e0b' } as MealPlannerConfig} style={{ ...DEFAULT_MODULE_STYLE }} screenId="s1" moduleId="m1" />,
    );
    expect(getByTestId('look-ahead-words').textContent).toBe('This week');
    expect(container.textContent).toContain('Taco Night');
    expect(container.textContent).not.toContain('Kung Pao Chicken');

    fireEvent.click(getByTestId('look-ahead-forward'));
    expect(getByTestId('look-ahead-words').textContent).toBe('Next week');
    expect(container.textContent).toContain('Kung Pao Chicken');
    expect(container.textContent).not.toContain('Taco Night');

    fireEvent.click(getByTestId('look-ahead-home'));
    expect(getByTestId('look-ahead-words').textContent).toBe('This week');
    expect(queryByTestId('look-ahead-home')).toBeNull();
    expect(container.textContent).toContain('Taco Night');
  });

  it.each([
    ['taps off', { interactive: false }, { screenId: 's1', moduleId: 'm1' }],
    ['the editor preview', {}, {}],
  ] as const)('draws no arrows with %s', (_label, config, ids) => {
    seed();
    const { queryByTestId, container } = wrap(
      <MealPlannerModule config={{ view: 'week', accentColor: '#f59e0b', ...config } as MealPlannerConfig} style={{ ...DEFAULT_MODULE_STYLE }} {...ids} />,
    );
    expect(container.textContent).toContain('Taco Night');
    expect(queryByTestId('look-ahead-bar')).toBeNull();
  });

  it.each(['today', 'next-meal', 'compact', 'grocery'] as const)('draws no arrows on the %s view', (view) => {
    seed();
    const { queryByTestId } = wrap(
      <MealPlannerModule config={{ view, accentColor: '#f59e0b' } as MealPlannerConfig} style={{ ...DEFAULT_MODULE_STYLE }} screenId="s1" moduleId="m1" />,
    );
    expect(queryByTestId('look-ahead-bar')).toBeNull();
  });

  it('the full-screen Week steps, swapping its title for the dates and tagging the week', () => {
    seed();
    const { getByTestId, queryByTestId, container } = wrap(
      <FullscreenMealPlannerModule config={{ view: 'week' } as FullscreenMealPlannerConfig} style={{ ...DEFAULT_MODULE_STYLE }} screenId="s1" moduleId="m1" />,
    );
    expect(getByTestId('fmp-week-title').textContent).toBe('This Week\'s Meals');
    expect(queryByTestId('look-ahead-words')).toBeNull();

    fireEvent.click(getByTestId('look-ahead-forward'));
    expect(getByTestId('fmp-week-title').textContent).not.toBe('This Week\'s Meals');
    expect(getByTestId('look-ahead-words').textContent).toBe('Next week');
    expect(container.textContent).toContain('Kung Pao Chicken');
    expect(container.textContent).not.toContain('Taco Night');
  });

  it('the full-screen Week draws its heading as before with taps off', () => {
    seed();
    const { queryByTestId, container } = wrap(
      <FullscreenMealPlannerModule config={{ view: 'week', interactive: false } as FullscreenMealPlannerConfig} style={{ ...DEFAULT_MODULE_STYLE }} screenId="s1" moduleId="m1" />,
    );
    expect(container.textContent).toContain('This Week\'s Meals');
    expect(queryByTestId('look-ahead-bar')).toBeNull();
  });
});
