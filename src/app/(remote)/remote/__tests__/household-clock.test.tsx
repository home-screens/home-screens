// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import core from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';
import { DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import { isoDateInTZ } from '@/lib/timezone';
import type { TodoList } from '@/types/todos';
import { HouseholdClockProvider, useHouseholdNow, useHouseholdToday } from '../household-clock';

/**
 * The phone surfaces read "today", "this week" and the hour from the
 * household's zone, not the phone's. The instant is 10:30 pm Sunday in UTC
 * and 5:30 pm Sunday in Chicago, which for a Berlin household is already
 * 12:30 am Monday: a new day and, for a Monday-start week, a new week. Run
 * under TZ=UTC and TZ=America/Chicago, both phone zones land on Sunday.
 */
const INSTANT = new Date('2026-09-27T22:30:00Z');
const HOUSEHOLD = 'Europe/Berlin';
const HOUSEHOLD_TODAY = '2026-09-28';

let list: TodoList;
vi.mock('../hooks/useTodoLists', () => ({
  useTodoLists: () =>
    new Proxy(
      { lists: [list], loaded: true, loadError: null, selectedList: list },
      { get: (target, key) => (key in target ? target[key as keyof typeof target] : vi.fn()) },
    ),
}));
vi.mock('@/hooks/useFamilyData', () => ({
  useFamilyData: () => ({ members: [], groups: [], revision: 'r1', loading: false, loaded: true, error: null }),
}));

const { useMealsWeekNav } = await import('../hooks/useMealsWeekNav');
const { default: ListsTab } = await import('../components/ListsTab');
const { default: MealsTabHeader } = await import('../components/MealsTabHeader');

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en-US" blob={{ core, modules, remote }}>
      <HouseholdClockProvider timezone={HOUSEHOLD} today={isoDateInTZ(new Date(), HOUSEHOLD)} timeFormat="12h">{children}</HouseholdClockProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(INSTANT);
  list = {
    id: 'l1', name: 'Before school', slug: 'before_school', repeat: 'never', createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z',
    items: [{ id: 'i1', text: 'Permission slip', completed: false, createdAt: '2026-09-20T00:00:00.000Z', dueDate: HOUSEHOLD_TODAY }],
  };
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('the household clock', () => {
  it('gives the household day and hour, not the phone\'s', () => {
    const { result } = renderHook(() => ({ today: useHouseholdToday(), now: useHouseholdNow() }), { wrapper });
    expect(result.current.today).toBe(HOUSEHOLD_TODAY);
    expect(result.current.now.getHours()).toBe(0);
  });

  it('refuses to run without the household zone rather than fall back to the phone\'s', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useHouseholdToday())).toThrow(/HouseholdClockProvider/);
  });
});

describe('the Lists tab', () => {
  // A parent taps Today on a phone in another zone: the item is due on the
  // household's day, and the phone must call that day "Today" like the wall.
  it('labels an item due on the household day as Today', async () => {
    render(<ListsTab selectedListId="l1" onSelectList={() => {}} />, { wrapper });
    await act(async () => {});
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.queryByText('Tomorrow')).toBeNull();
  });
});

describe('the Meals tab', () => {
  it('opens on the household week, with the household day as Today', () => {
    const settings = { ...DEFAULT_MEAL_SETTINGS, weekStartDay: 'monday' as const };
    const { result } = renderHook(() => useMealsWeekNav(settings), { wrapper });
    expect(result.current.todayISO).toBe(HOUSEHOLD_TODAY);
    expect(result.current.weekDates[0].date).toBe(HOUSEHOLD_TODAY);
    expect(result.current.isCurrentWeek).toBe(true);
    expect(result.current.currentHour).toBe(0);

    act(() => result.current.navigateWeek(-1));
    expect(result.current.weekDates[0].date).toBe('2026-09-21');
    act(() => result.current.jumpToToday());
    expect(result.current.weekDates[0].date).toBe(HOUSEHOLD_TODAY);
  });

  // Left open at 11:58 pm Sunday household time: at midnight the grid walks
  // onto the new week with today, unless the parent had moved to another week.
  describe('left open across the household week boundary', () => {
    const settings = { ...DEFAULT_MEAL_SETTINGS, weekStartDay: 'monday' as const };
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
      vi.setSystemTime(new Date('2026-09-27T21:58:00Z'));
    });

    it('moves the week with today', () => {
      const { result } = renderHook(() => useMealsWeekNav(settings), { wrapper });
      expect(result.current.todayISO).toBe('2026-09-27');
      expect(result.current.weekDates[0].date).toBe('2026-09-21');

      act(() => { vi.advanceTimersByTime(3 * 60_000); });
      expect(result.current.todayISO).toBe(HOUSEHOLD_TODAY);
      expect(result.current.weekDates[0].date).toBe(HOUSEHOLD_TODAY);
      expect(result.current.isCurrentWeek).toBe(true);
    });

    it('leaves a parent who navigated to another week where they are', () => {
      const { result } = renderHook(() => useMealsWeekNav(settings), { wrapper });
      act(() => result.current.navigateWeek(1));
      act(() => result.current.navigateWeek(1));
      expect(result.current.weekDates[0].date).toBe('2026-10-05');

      act(() => { vi.advanceTimersByTime(3 * 60_000); });
      expect(result.current.todayISO).toBe(HOUSEHOLD_TODAY);
      expect(result.current.weekDates[0].date).toBe('2026-10-05');
    });
  });

  it('names the household weekday in the header', () => {
    render(<MealsTabHeader todayISO={HOUSEHOLD_TODAY} onOpenSettings={() => {}} />, { wrapper });
    expect(screen.getByText('Monday')).toBeTruthy();
  });
});
