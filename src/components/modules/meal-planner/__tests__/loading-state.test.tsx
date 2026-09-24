// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE, type FullscreenMealPlannerConfig, type MealPlannerConfig } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';

// The first fetch has not answered yet: no data, no error.
const fetchState = vi.hoisted(() => ({ result: [null, null, null] as [unknown, unknown, unknown] }));
vi.mock('@/hooks/useFetchData', () => ({ useFetchData: () => fetchState.result }));

import MealPlannerModule from '../MealPlannerModule';
import FullscreenMealPlannerModule from '../../fullscreen-meal-planner/FullscreenMealPlannerModule';

// jsdom has no ResizeObserver; the size hooks only need it to exist.
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

const wrap = (node: React.ReactNode) => render(
  <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{node}</I18nProvider>,
);

afterEach(() => {
  cleanup();
  fetchState.result = [null, null, null];
});

describe('meal planner before its first fetch settles', () => {
  it.each(['week', 'compact', 'today', 'next-meal', 'list'] as const)('shows loading, not "No meals planned yet" (%s)', (view) => {
    const { container } = wrap(
      <MealPlannerModule config={{ view } as MealPlannerConfig} style={{ ...DEFAULT_MODULE_STYLE }} timezone="America/Chicago" />,
    );
    expect(container.textContent).toContain('Loading meals…');
    expect(container.textContent).not.toContain('No meals planned');
  });

  it('shows the empty state once an empty plan arrives', () => {
    fetchState.result = [{ savedMeals: [], plan: [] }, null, Date.now()];
    const { container } = wrap(
      <MealPlannerModule config={{ view: 'week' } as MealPlannerConfig} style={{ ...DEFAULT_MODULE_STYLE }} timezone="America/Chicago" />,
    );
    expect(container.textContent).toContain('No meals planned yet');
  });

  it.each(['week', 'today', 'menu-board', 'next-meal'] as const)('fullscreen shows loading, not an empty plan (%s)', (view) => {
    const { getByTestId, container } = wrap(
      <FullscreenMealPlannerModule
        config={{ view } as FullscreenMealPlannerConfig}
        style={{ ...DEFAULT_MODULE_STYLE }}
        timezone="America/Chicago"
      />,
    );
    expect(getByTestId('fmp-loading').textContent).toBe('Loading meals…');
    expect(container.textContent).not.toMatch(/No (upcoming )?meals planned/);
  });
});
