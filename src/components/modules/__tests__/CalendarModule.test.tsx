// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { addDays, addHours, format } from 'date-fns';
import { DEFAULT_MODULE_STYLE, type CalendarConfig, type CalendarEvent, type ModuleStyle } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import enUSCore from '@/translations/en-US/core.json';

// jsdom doesn't ship ResizeObserver; scaled-font hooks need it.
class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

import CalendarModule from '../CalendarModule';

const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE };

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en-US" blob={{ modules: enUSModules, core: enUSCore }}>
      {children}
    </I18nProvider>
  );
}

function makeConfig(overrides: Partial<CalendarConfig> = {}): CalendarConfig {
  return {
    viewMode: 'daily',
    daysToShow: 3,
    showTime: true,
    showLocation: false,
    maxEvents: 20,
    showWeekNumbers: false,
    ...overrides,
  };
}

const LOCAL = "yyyy-MM-dd'T'HH:mm:ss";

// A fixed midweek instant, not the real clock. The module reads the current
// time to decide which week and month to show, so fixtures built off the real
// clock drift across those boundaries: run in the first three hours of a
// Sunday and "three hours ago" lands on Saturday, which the week view (which
// starts on Sunday) correctly puts in the *previous* week. That is a real
// 1.8%-of-the-week failure, and it only shows up in CI because CI runs in UTC
// while a developer three hours west is still on Saturday evening.
//
// Noon on a Wednesday leaves three clear days on either side, so every
// relative event below stays inside both the displayed week and the month.
const NOW = new Date(2026, 6, 15, 12, 0, 0); // Wednesday, 15 July 2026

beforeAll(() => {
  // shouldAdvanceTime keeps React's scheduler from stalling under fake timers.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

// One event that ended earlier today, one from yesterday, one upcoming
// tomorrow. The shared display fetch may hand every view a month-wide window,
// so the module itself must keep past events out of upcoming-only views.
const now = NOW;
const events: CalendarEvent[] = [
  {
    id: 'ended-today',
    title: 'Ended Today Standup',
    start: format(addHours(now, -3), LOCAL),
    end: format(addHours(now, -2), LOCAL),
  },
  {
    id: 'yesterday',
    title: 'Yesterday Retro',
    start: format(addHours(addDays(now, -1), -1), LOCAL),
    end: format(addDays(now, -1), LOCAL),
  },
  {
    id: 'tomorrow',
    title: 'Tomorrow Planning',
    start: format(addDays(now, 1), LOCAL),
    end: format(addHours(addDays(now, 1), 1), LOCAL),
  },
] as CalendarEvent[];

afterEach(cleanup);

describe('CalendarModule past-event visibility per view', () => {
  it('daily view hides events that already ended', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'daily' })} style={style} events={events} /></Wrapper>,
    );
    expect(queryByText('Ended Today Standup')).toBeNull();
    expect(queryByText('Tomorrow Planning')).not.toBeNull();
  });

  it('agenda view hides past events', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'agenda' })} style={style} events={events} /></Wrapper>,
    );
    expect(queryByText('Ended Today Standup')).toBeNull();
    expect(queryByText('Yesterday Retro')).toBeNull();
    expect(queryByText('Tomorrow Planning')).not.toBeNull();
  });

  it('month view shows past events (wall-calendar semantics)', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'month' })} style={style} events={events} /></Wrapper>,
    );
    expect(queryByText('Ended Today Standup')).not.toBeNull();
    expect(queryByText('Yesterday Retro')).not.toBeNull();
  });

  it('week view shows events from earlier in the current week', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'week' })} style={style} events={events} /></Wrapper>,
    );
    // With the clock pinned to midweek both past events sit inside the
    // displayed week, so the week view has to show them rather than filtering
    // them out the way the upcoming-only views do.
    expect(queryByText('Ended Today Standup')).not.toBeNull();
    expect(queryByText('Yesterday Retro')).not.toBeNull();
  });
});

describe('CalendarModule multi-week view', () => {
  it('renders exactly weeksToShow rows starting at the current week', () => {
    // Pinned clock: Wed Jul 15 2026. Sunday-start grid of 4 weeks = Jul 12 – Aug 8.
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4 })} style={style} events={events} /></Wrapper>,
    );
    expect(queryByText('12')).not.toBeNull(); // first cell, Sun Jul 12
    expect(queryByText('8')).not.toBeNull();  // last cell, Sat Aug 8
    expect(queryByText('9')).toBeNull();      // Aug 9 would be a 5th week
  });

  it('marks each month first day with an accent abbreviation and a gradient', () => {
    const { container } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4 })} style={style} events={events} /></Wrapper>,
    );
    // Aug 1 is the only month-first day inside Jul 12 – Aug 8.
    expect(container.textContent).toContain('Aug 1');
    expect(container.textContent).not.toContain('Sep 1');
    const gradientCells = container.querySelectorAll('[style*="linear-gradient"]');
    expect(gradientCells).toHaveLength(1);
    expect(gradientCells[0].textContent).toContain('Aug 1');
  });

  it('dims first-row past days but not today', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4 })} style={style} events={events} /></Wrapper>,
    );
    const pastCell = (queryByText('12') as HTMLElement).closest('div');
    expect((pastCell as HTMLElement).style.opacity).toBe('0.35');
    const todayCell = (queryByText('15') as HTMLElement).closest('div');
    expect((todayCell as HTMLElement).style.opacity).not.toBe('0.35');
  });

  it('renders the today number as an accent pill', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4 })} style={style} events={events} /></Wrapper>,
    );
    const pill = queryByText('15') as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill.className).toContain('rounded-full');
    expect(pill.style.backgroundColor).toContain('rgba(59, 130, 246'); // #3b82f6cc
  });

  it('shows past-week events in row 1 (wall-calendar semantics)', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4 })} style={style} events={events} /></Wrapper>,
    );
    expect(queryByText('Yesterday Retro')).not.toBeNull();
    expect(queryByText('Ended Today Standup')).not.toBeNull();
  });

  it('stacks the today pill and the month-first gradient on the same cell', () => {
    vi.setSystemTime(new Date(2026, 7, 1, 12, 0, 0)); // Saturday, 1 Aug 2026
    try {
      const { container } = render(
        <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4 })} style={style} events={events} /></Wrapper>,
      );
      const cell = container.querySelector('[style*="linear-gradient"]') as HTMLElement;
      expect(cell).not.toBeNull();
      expect(cell.textContent).toContain('Aug 1');
      expect(cell.style.backgroundColor).toBe('rgba(59, 130, 246, 0.12)'); // today wash layered under the gradient
    } finally {
      vi.setSystemTime(NOW);
    }
  });

  it('caps event pills per cell and reports the overflow', () => {
    // Day+2 (Jul 17) is empty in the base fixture, so this cell holds exactly
    // the three cap events; maxPerCell 2 shows two and reports "+1 more".
    const busyDay = [
      ...events,
      { id: 'cap-1', title: 'Cap One', start: format(addDays(now, 2), LOCAL), end: format(addHours(addDays(now, 2), 1), LOCAL) },
      { id: 'cap-2', title: 'Cap Two', start: format(addHours(addDays(now, 2), 1), LOCAL), end: format(addHours(addDays(now, 2), 2), LOCAL) },
      { id: 'cap-3', title: 'Cap Three', start: format(addHours(addDays(now, 2), 2), LOCAL), end: format(addHours(addDays(now, 2), 3), LOCAL) },
    ] as CalendarEvent[];
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4, multiWeekMaxEventsPerCell: 2 })} style={style} events={busyDay} /></Wrapper>,
    );
    expect(queryByText('Cap Two')).not.toBeNull();
    expect(queryByText('Cap Three')).toBeNull();
    expect(queryByText('+1 more')).not.toBeNull();
  });

  it('clamps out-of-range weeksToShow values', () => {
    const { container } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 99 })} style={style} events={events} /></Wrapper>,
    );
    // 99 clamps to 12 weeks: Jul 12 + 84 days = Oct 4. Oct 1 is a month-first day.
    expect(container.textContent).toContain('Oct 1');
    // 12 weeks is the cap: Oct 5 would only exist at 13+ weeks.
    expect(container.textContent).not.toContain('Oct 5');
  });

  describe('startDay', () => {
    it('shifts the multi-week grid to a Monday start', () => {
      // Pinned clock: Wed Jul 15 2026. Monday-start 4-week grid = Jul 13 – Aug 9.
      const { queryByText } = render(
        <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4, startDay: 'monday' })} style={style} events={events} /></Wrapper>,
      );
      expect(queryByText('12')).toBeNull();    // Sun Jul 12 no longer leads the grid
      expect(queryByText('9')).not.toBeNull(); // Sat Aug 9 now closes it
    });

    it('shifts the week view to a Monday start', () => {
      const { queryByText } = render(
        <Wrapper><CalendarModule config={makeConfig({ viewMode: 'week', startDay: 'monday' })} style={style} events={events} /></Wrapper>,
      );
      expect(queryByText('12')).toBeNull();
      expect(queryByText('19')).not.toBeNull(); // Sun Jul 19 closes a Monday-start week
    });

    it('shifts the month view to a Monday start', () => {
      const { queryAllByText } = render(
        <Wrapper><CalendarModule config={makeConfig({ viewMode: 'month', startDay: 'monday' })} style={style} events={events} /></Wrapper>,
      );
      // July 2026 starts on a Wednesday. Both grids contain Jul 28, but only
      // the Sunday-start grid also leads with Jun 28 — so exactly one '28'
      // cell means the Monday start took effect.
      expect(queryAllByText('28')).toHaveLength(1);
    });

    it('keeps the Sunday start when startDay is unset', () => {
      const { queryByText } = render(
        <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4 })} style={style} events={events} /></Wrapper>,
      );
      expect(queryByText('12')).not.toBeNull();
    });
  });
});
