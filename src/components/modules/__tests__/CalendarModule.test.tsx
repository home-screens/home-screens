// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
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

// Events relative to the real clock (the module reads the current time):
// one that ended earlier today, one from yesterday, one upcoming tomorrow.
// The shared display fetch may hand every view a month-wide window, so the
// module itself must keep past events out of upcoming-only views.
const now = new Date();
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
    // "Ended today" is always within the displayed week; "yesterday" may
    // fall in the previous week, so only assert the guaranteed one.
    expect(queryByText('Ended Today Standup')).not.toBeNull();
  });
});
