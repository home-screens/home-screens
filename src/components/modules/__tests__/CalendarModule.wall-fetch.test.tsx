// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { act, render, cleanup, fireEvent } from '@testing-library/react';
import { startOfDay } from 'date-fns';
import { DEFAULT_MODULE_STYLE, type CalendarConfig } from '@/types/config';
import { NOW } from '@/lib/__tests__/helpers/calendar-fixtures';
import { borrowedViewReach } from '@/lib/calendar-window';
import { getModuleDefinition } from '@/lib/module-registry';
import { useLookAheadStore } from '@/stores/look-ahead-store';
import { installResizeObserverStub, I18nWrapper as Wrapper } from './helpers/harness';

installResizeObserverStub();

vi.mock('@/hooks/useDayNotes', async () => {
  const { NO_DAY_NOTES } = await import('@/lib/day-notes');
  return { useDayNotes: () => NO_DAY_NOTES };
});
// A card tall enough for the row of view buttons.
vi.mock('@/hooks/useElementBox', () => ({ useElementBox: () => [() => {}, { width: 900, height: 900 }] }));

import CalendarModule from '../CalendarModule';

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});
afterEach(() => {
  cleanup();
  act(() => {
    for (const id of Object.keys(useLookAheadStore.getState().reaches)) useLookAheadStore.getState().setReach(id, null);
  });
});

const defaults = getModuleDefinition('calendar')!.defaultConfig as unknown as CalendarConfig;

/* A card saved as Daily, switched to Month on the wall, drew a month with only this week's events. */
describe('a Calendar card showing a view borrowed from the wall\'s buttons', () => {
  it('has the borrowed view fetched while it shows, and nothing extra once it is back on its own', () => {
    const config: CalendarConfig = { ...defaults, viewMode: 'daily', eventTapDetails: true, wallViews: ['week', 'month'] };
    const { container } = render(
      <CalendarModule config={config} style={{ ...DEFAULT_MODULE_STYLE }} events={[]} screenId="s1" moduleId="card" />,
      { wrapper: Wrapper },
    );
    const press = (view: string) => fireEvent.click(container.querySelector(`[data-wall-view="${view}"]`)!);
    const span = (view: CalendarConfig['viewMode']) => {
      const reach = borrowedViewReach('calendar', { ...config, viewMode: view }, startOfDay(NOW))!;
      return { start: reach.start.getTime(), end: reach.end.getTime() };
    };
    expect(useLookAheadStore.getState().span).toBeNull();

    press('month');
    expect(useLookAheadStore.getState().reaches.card).toEqual(span('month'));
    press('week');
    expect(useLookAheadStore.getState().reaches.card).toEqual(span('week'));
    press('daily');
    expect(useLookAheadStore.getState().span).toBeNull();
  });
});
