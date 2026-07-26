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
