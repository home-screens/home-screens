// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { addDays, addHours, format } from 'date-fns';
import { DEFAULT_MODULE_STYLE, type CalendarConfig, type CalendarEvent, type ModuleStyle } from '@/types/config';
import { LOCAL, NOW } from '@/lib/__tests__/helpers/calendar-fixtures';
import { installResizeObserverStub, I18nWrapper as Wrapper } from './helpers/harness';

installResizeObserverStub();

import { TEXT_OPACITY } from '@/lib/constants';
import CalendarModule from '../CalendarModule';

const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE };

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

// NOW/LOCAL come from the shared calendar fixtures — a fixed midweek
// instant, not the real clock (see calendar-fixtures for the drift rationale).

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

describe('CalendarModule agenda view: agendaShowFinishedToday', () => {
  // The race-weekend shape from the live display: subscribed motorsport
  // feeds model a weekend as one long timed event (started days ago, still
  // running) or a multi-day all-day block. Everything else is a plain
  // single-day row around them.
  const agendaEvents: CalendarEvent[] = [
    {
      id: 'ongoing-multiday',
      title: 'Race Weekend',
      start: format(new Date(2026, 6, 13, 8, 0), LOCAL),   // Monday 08:00
      end: format(new Date(2026, 6, 16, 18, 0), LOCAL),    // Thursday 18:00
    },
    {
      id: 'allday-yesterday',
      title: 'Support Series',
      start: '2026-07-14',
      end: '2026-07-15',
      allDay: true,
    },
    {
      id: 'allday-today',
      title: 'Festival Today',
      start: '2026-07-15',
      end: '2026-07-16',
      allDay: true,
    },
    {
      id: 'ended-today',
      title: 'Morning Standup',
      start: format(new Date(2026, 6, 15, 9, 0), LOCAL),
      end: format(new Date(2026, 6, 15, 10, 0), LOCAL),
    },
    {
      id: 'ended-yesterday',
      title: 'Tuesday Retro',
      start: format(new Date(2026, 6, 14, 15, 0), LOCAL),
      end: format(new Date(2026, 6, 14, 16, 0), LOCAL),
    },
    {
      id: 'tomorrow',
      title: 'Thursday Race',
      start: format(new Date(2026, 6, 16, 7, 0), LOCAL),
      end: format(new Date(2026, 6, 16, 8, 0), LOCAL),
    },
  ] as CalendarEvent[];

  it('default (flag off): an ongoing multi-day event groups under its start day', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'agenda' })} style={style} events={agendaEvents} /></Wrapper>,
    );
    expect(queryByText('Race Weekend')).not.toBeNull();
    // Grouped under the Monday it started, not under Today.
    expect(queryByText('Monday, Jul 13')).not.toBeNull();
  });

  it('flag on: shows events that ended earlier today', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'agenda', agendaShowFinishedToday: true })} style={style} events={agendaEvents} /></Wrapper>,
    );
    expect(queryByText('Morning Standup')).not.toBeNull();
  });

  it('flag on: re-homes an ongoing multi-day event under Today', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'agenda', agendaShowFinishedToday: true })} style={style} events={agendaEvents} /></Wrapper>,
    );
    expect(queryByText('Race Weekend')).not.toBeNull();
    expect(queryByText('Monday, Jul 13')).toBeNull();
    expect(queryByText('Today')).not.toBeNull();
  });

  it('flag on: maxEvents keeps upcoming rows ahead of finished ones', () => {
    // Ascending slice would spend the budget on the 09:00 standup first;
    // the budget is upcoming-first, so the finished row is what gets cut.
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'agenda', agendaShowFinishedToday: true, maxEvents: 3 })} style={style} events={agendaEvents} /></Wrapper>,
    );
    expect(queryByText('Race Weekend')).not.toBeNull();
    expect(queryByText('Festival Today')).not.toBeNull();
    expect(queryByText('Thursday Race')).not.toBeNull();
    expect(queryByText('Morning Standup')).toBeNull();
  });

  it('flag on: a re-homed multi-day event reads day-relative, not as its original start time', () => {
    // Monday 08:00 to Thursday 18:00 sits under Today (Wednesday) as a
    // middle segment: "All day", never "8:00 AM".
    const { queryByText, getByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'agenda', agendaShowFinishedToday: true })} style={style} events={agendaEvents} /></Wrapper>,
    );
    const card = getByText('Race Weekend').closest('[data-event-id]') as HTMLElement;
    expect(card.textContent).toContain('All day');
    expect(card.textContent).not.toContain('8:00 AM');
    expect(queryByText(/8:00 AM/)).toBeNull();
  });

  it('flag on: finished rows are dimmed, upcoming rows are not', () => {
    const { getByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'agenda', agendaShowFinishedToday: true })} style={style} events={agendaEvents} /></Wrapper>,
    );
    const finished = getByText('Morning Standup').closest('[data-event-id]') as HTMLElement;
    const upcoming = getByText('Thursday Race').closest('[data-event-id]') as HTMLElement;
    expect(finished.style.opacity).toBe('0.4');
    expect(upcoming.style.opacity).toBe('1');
  });

  it('flag on: hides fully past events, keeps today\'s all-day event', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'agenda', agendaShowFinishedToday: true })} style={style} events={agendaEvents} /></Wrapper>,
    );
    expect(queryByText('Tuesday Retro')).toBeNull();
    expect(queryByText('Support Series')).toBeNull();
    expect(queryByText('Festival Today')).not.toBeNull();
    expect(queryByText('Thursday Race')).not.toBeNull();
  });
});

describe('CalendarModule daily view: dimPastEvents / showNowRule', () => {
  // One event that already ended today, one currently running.
  const dailyEvents: CalendarEvent[] = [
    {
      id: 'ended-today',
      title: 'Ended Today Standup',
      start: format(addHours(now, -3), LOCAL),
      end: format(addHours(now, -2), LOCAL),
    },
    {
      id: 'running-now',
      title: 'Running Now',
      start: format(addHours(now, -1), LOCAL),
      end: format(addHours(now, 1), LOCAL),
    },
  ] as CalendarEvent[];

  it('showNowRule alone (dimPastEvents off) keeps the ended event visible and undimmed', () => {
    const { container, queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'daily', daysToShow: 1, showNowRule: true })} style={style} events={dailyEvents} /></Wrapper>,
    );
    expect(queryByText('Ended Today Standup')).not.toBeNull();
    expect(container.querySelector('[data-now-rule]')).not.toBeNull();
    const card = container.querySelector('[data-event-id="ended-today"]') as HTMLElement;
    expect(card.style.opacity).toBe('1');
  });

  it('dimPastEvents alone (showNowRule off) dims the ended event and renders no now rule', () => {
    const { container } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'daily', daysToShow: 1, dimPastEvents: true })} style={style} events={dailyEvents} /></Wrapper>,
    );
    expect(container.querySelector('[data-now-rule]')).toBeNull();
    const card = container.querySelector('[data-event-id="ended-today"]') as HTMLElement;
    expect(card.style.opacity).toBe('0.4');
  });

  it('showNowRule rings the currently-running event but not an ended one', () => {
    const { container } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'daily', daysToShow: 1, showNowRule: true })} style={style} events={dailyEvents} /></Wrapper>,
    );
    const running = container.querySelector('[data-event-id="running-now"]') as HTMLElement;
    const ended = container.querySelector('[data-event-id="ended-today"]') as HTMLElement;
    expect(running.style.boxShadow).not.toBe('');
    expect(ended.style.boxShadow).toBe('');
  });

  it('places the now rule after already-ended events even when a multi-day timed event spans today', () => {
    // A trip logged with real times (not all-day): started two days ago,
    // continues two days from now. Its 'middle' segment for today must not
    // let it masquerade as "not past" and pull the now rule above events
    // that genuinely already ended today.
    const multiDayEvents: CalendarEvent[] = [
      {
        id: 'trip',
        title: 'Business Trip',
        start: format(addHours(addDays(now, -2), -1), LOCAL),
        end: format(addHours(addDays(now, 2), 1), LOCAL),
      },
      ...dailyEvents,
    ] as CalendarEvent[];
    const { container } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'daily', daysToShow: 1, showNowRule: true })} style={style} events={multiDayEvents} /></Wrapper>,
    );
    const order = Array.from(container.querySelectorAll('[data-event-id], [data-now-rule]'))
      .map((el) => el.getAttribute('data-event-id') ?? 'now-rule');
    expect(order.indexOf('now-rule')).toBeGreaterThan(order.indexOf('ended-today'));
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
    // Aug 1 is the only month-first day inside Jul 12 – Aug 8. The badge's
    // flex layout separates month and day with `gap`, so textContent holds
    // the two flex items back to back with no literal space.
    expect(container.textContent).toContain('Aug1');
    expect(container.textContent).not.toContain('Sep1');
    const gradientCells = container.querySelectorAll('[style*="linear-gradient"]');
    expect(gradientCells).toHaveLength(1);
    expect(gradientCells[0].textContent).toContain('Aug1');
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

  it('renders every day number in a shaded rectangle, today accented', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4 })} style={style} events={events} /></Wrapper>,
    );
    const today = queryByText('15') as HTMLElement;
    expect(today).not.toBeNull();
    expect(today.className).toContain('rounded');
    expect(today.className).not.toContain('rounded-full');
    // Exact accent alpha and weight: a plain-day badge is 0.25-tinted and
    // 400-weight, so anything looser would pass with the isToday ternaries
    // broken.
    expect(today.style.backgroundColor).toBe('rgba(59, 130, 246, 0.8)'); // #3b82f6cc
    expect(today.style.fontWeight).toBe('700');
    // A plain day gets the same rectangle shape tinted with the accent color
    const plain = queryByText('16') as HTMLElement;
    expect(plain).not.toBeNull();
    expect(plain.className).toContain('rounded');
    expect(plain.style.backgroundColor).toBe('rgba(59, 130, 246, 0.25)'); // #3b82f640
    expect(plain.style.fontWeight).toBe('400');
  });

  it('keeps the month abbreviation inside the month-first rectangle', () => {
    const { container } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4 })} style={style} events={events} /></Wrapper>,
    );
    // Aug 1 is the only gradient cell in the window; its date badge must wrap
    // the month abbreviation and the number as one shaded unit, spaced by the
    // badge's flex gap (a literal space would be collapsed by the flex
    // layout, rendering "Aug1").
    const cell = container.querySelector('[style*="linear-gradient"]') as HTMLElement;
    const badge = cell.querySelector('span.rounded') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent.trim()).toBe('Aug1');
    expect(badge.style.gap).toBe('0.25em');
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
      expect(cell.textContent).toContain('Aug1');
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
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4, gridMaxEventsPerCell: 2 })} style={style} events={busyDay} /></Wrapper>,
    );
    expect(queryByText('Cap Two')).not.toBeNull();
    expect(queryByText('Cap Three')).toBeNull();
    expect(queryByText('+1 more')).not.toBeNull();
  });

  // Week rows are the only grids with flex-1 in this view (the day-of-week
  // header grid doesn't stretch), so counting them counts rendered weeks.
  const countWeekRows = (container: HTMLElement) =>
    container.querySelectorAll('div.grid.flex-1').length;

  it('clamps out-of-range weeksToShow values', () => {
    const over = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 99 })} style={style} events={events} /></Wrapper>,
    );
    expect(countWeekRows(over.container)).toBe(12);
    // 12 weeks from Sun Jul 12 ends Sat Oct 3, so Oct 1 is the last month-first
    // marker; an uncapped 99-week grid would go on to render "Nov 1".
    expect(over.container.textContent).toContain('Oct1');
    expect(over.container.textContent).not.toContain('Nov');
    cleanup();

    const under = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 1 })} style={style} events={events} /></Wrapper>,
    );
    expect(countWeekRows(under.container)).toBe(4);
  });

  it('falls back to 6 weeks when a hand-edited weeksToShow is not a number', () => {
    // PUT /api/config doesn't type-check module config fields, so a
    // hand-edited string must degrade to the default, not NaN out the grid.
    const { container } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 'six' as unknown as number })} style={style} events={events} /></Wrapper>,
    );
    expect(countWeekRows(container)).toBe(6);
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

    it('numbers Monday-start weeks with the ISO convention', () => {
      // Wed Dec 30 2026: the Monday-start week runs Dec 28 – Jan 3 and is ISO
      // week 53. getWeek's US default (Sunday start, firstWeekContainsDate 1)
      // would label the same row "1" — mismatching its own cells.
      vi.setSystemTime(new Date(2026, 11, 30, 12, 0, 0));
      try {
        const { queryByText } = render(
          <Wrapper><CalendarModule config={makeConfig({ viewMode: 'week', startDay: 'monday', showWeekNumbers: true })} style={style} events={[]} /></Wrapper>,
        );
        expect(queryByText('53')).not.toBeNull();
      } finally {
        vi.setSystemTime(NOW);
      }
    });
  });
});

describe('grid event styling', () => {
  const allDayYellow = {
    id: 'g1', title: 'Market day',
    start: format(now, 'yyyy-MM-dd'), end: format(addDays(now, 1), 'yyyy-MM-dd'),
    allDay: true, calendarColor: '#eab308',
  } as CalendarEvent;
  const timedBlue = {
    id: 'g2', title: 'Haircut',
    start: format(new Date(2026, 6, 15, 8, 5), LOCAL), end: format(new Date(2026, 6, 15, 9, 5), LOCAL),
    allDay: false, calendarColor: '#3b82f6',
  } as CalendarEvent;
  const timedLate = {
    id: 'g3', title: 'Soccer',
    start: format(new Date(2026, 6, 15, 14, 0), LOCAL), end: format(new Date(2026, 6, 15, 15, 0), LOCAL),
    allDay: false, calendarColor: '#10b981',
  } as CalendarEvent;
  const multiWeek = (overrides: Partial<CalendarConfig> = {}) =>
    makeConfig({ viewMode: 'multi-week', ...overrides });

  // jsdom normalizes inline colors through its CSSOM (hex becomes rgb()), so
  // style assertions read element.style directly rather than a matcher lib.
  it('colored style renders a solid all-day pill with auto-contrast text', () => {
    const { getByText } = render(
      <Wrapper><CalendarModule config={multiWeek({ gridEventStyle: 'colored' })} style={style} events={[timedBlue, allDayYellow]} /></Wrapper>,
    );
    const pill = (getByText('Market day') as HTMLElement).closest('div') as HTMLElement | null;
    expect(pill?.style.backgroundColor).toBe('rgb(234, 179, 8)'); // #eab308
    expect(pill?.style.color).toBe('rgb(27, 27, 31)');           // #1b1b1f, auto-contrast
  });

  it('colored style renders timed events as colored text with a time prefix and no background', () => {
    const { getByText } = render(
      <Wrapper><CalendarModule config={multiWeek({ gridEventStyle: 'colored' })} style={style} events={[timedBlue]} /></Wrapper>,
    );
    const time = getByText('08:05 AM') as HTMLElement;
    expect(time.style.color).toBe('rgb(59, 130, 246)'); // #3b82f6
    expect((time.parentElement as HTMLElement).style.backgroundColor).toBe(''); // no pill by default
    expect((getByText('Haircut') as HTMLElement).style.color).toBe('rgb(59, 130, 246)');
  });

  it('honors a 24h timeFormat prop', () => {
    const { getByText, queryByText } = render(
      <Wrapper><CalendarModule config={multiWeek({ gridEventStyle: 'colored' })} style={style} events={[timedBlue]} timeFormat="24h" /></Wrapper>,
    );
    expect(getByText('08:05')).toBeTruthy();
    expect(queryByText('08:05 AM')).toBeNull();
  });

  it('gridEventPillBackground adds the faint pill behind timed events', () => {
    const { getByText } = render(
      <Wrapper><CalendarModule config={multiWeek({ gridEventStyle: 'colored', gridEventPillBackground: true })} style={style} events={[timedBlue]} /></Wrapper>,
    );
    expect(((getByText('Haircut') as HTMLElement).parentElement as HTMLElement).style.backgroundColor).toBe('rgba(255, 255, 255, 0.1)');
  });

  it('orders all-day events before timed events within a day cell', () => {
    const { getByText } = render(
      <Wrapper><CalendarModule config={multiWeek({ gridEventStyle: 'colored' })} style={style} events={[timedLate, timedBlue, allDayYellow]} /></Wrapper>,
    );
    const cell = ((getByText('Market day') as HTMLElement).closest('div') as HTMLElement | null)?.parentElement ?? null;
    const text = cell?.textContent ?? '';
    expect(text.indexOf('Market day')).toBeLessThan(text.indexOf('08:05 AM'));
    expect(text.indexOf('08:05 AM')).toBeLessThan(text.indexOf('Soccer'));
  });

  it('colored style reaches the week view with the solid all-day pill', () => {
    const { getByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'week', gridEventStyle: 'colored' })} style={style} events={[allDayYellow]} /></Wrapper>,
    );
    const pill = (getByText('Market day') as HTMLElement).closest('div') as HTMLElement | null;
    expect(pill?.style.backgroundColor).toBe('rgb(234, 179, 8)'); // #eab308
    expect(pill?.style.color).toBe('rgb(27, 27, 31)');           // #1b1b1f, auto-contrast
  });

  it('reports per-cell overflow under the colored style', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={multiWeek({ gridEventStyle: 'colored', gridMaxEventsPerCell: 2 })} style={style} events={[timedLate, timedBlue, allDayYellow]} /></Wrapper>,
    );
    expect(queryByText('+1 more')).not.toBeNull();
  });

  it('classic style keeps the dot + faint pill markup and no time prefix', () => {
    const { container, queryByText } = render(
      <Wrapper><CalendarModule config={multiWeek({})} style={style} events={[timedBlue]} /></Wrapper>,
    );
    expect(container.querySelector('.w-1\\.5')).toBeTruthy();
    expect(queryByText('08:05 AM')).toBeNull();
  });

  it('daily view time line honors the 24h timeFormat prop', () => {
    // The daily view is upcoming-only and the clock is pinned to noon, so the
    // timed fixture must sit after NOW to appear at all: tomorrow 08:05-09:05.
    const tomorrowTimed = {
      id: 'g7', title: 'Haircut',
      start: format(new Date(2026, 6, 16, 8, 5), LOCAL), end: format(new Date(2026, 6, 16, 9, 5), LOCAL),
      allDay: false, calendarColor: '#3b82f6',
    } as CalendarEvent;
    const { getByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ showTime: true })} style={style} events={[tomorrowTimed]} timeFormat="24h" /></Wrapper>,
    );
    expect(getByText(/08:05 · 1h/)).toBeTruthy();
  });
});

describe('month and multi-week grid themes', () => {
  const mw = (overrides: Partial<CalendarConfig> = {}) =>
    makeConfig({ viewMode: 'multi-week', weeksToShow: 4, ...overrides });
  const timedBlue = {
    id: 'mt1', title: 'Haircut',
    start: format(new Date(2026, 6, 15, 8, 5), LOCAL), end: format(new Date(2026, 6, 15, 9, 5), LOCAL),
    allDay: false, calendarColor: '#3b82f6',
  } as CalendarEvent;
  const onHour = {
    id: 'mt2', title: 'Piano',
    start: format(new Date(2026, 6, 16, 16, 0), LOCAL), end: format(new Date(2026, 6, 16, 17, 0), LOCAL),
    allDay: false, calendarColor: '#8e24aa',
  } as CalendarEvent;
  // Fri Jul 17 – Sun Jul 19 (exclusive all-day end), crossing the week-row boundary
  const trip = {
    id: 'mt3', title: 'Cabin weekend',
    start: '2026-07-17', end: '2026-07-20',
    allDay: true, calendarColor: '#4073ff',
  } as CalendarEvent;

  it('defaults to the banner theme when gridTheme is unset', () => {
    const { container, queryByText } = render(
      <Wrapper><CalendarModule config={mw()} style={style} events={[]} /></Wrapper>,
    );
    expect(container.querySelector('[data-grid-theme]')).toBeNull();
    expect(queryByText('July – August 2026')).toBeNull();
    // The banner strip is still on plain day numbers (default accent #3b82f6 at 0.25)
    expect((queryByText('16') as HTMLElement).style.backgroundColor).toBe('rgba(59, 130, 246, 0.25)');
  });

  it('clean: renders the month-range header, quiet day numbers, and a solid today badge', () => {
    const { container, queryByText } = render(
      <Wrapper><CalendarModule config={mw({ gridTheme: 'clean' })} style={style} events={[]} /></Wrapper>,
    );
    expect(container.querySelector('[data-grid-theme="clean"]')).not.toBeNull();
    expect(queryByText('July – August 2026')).not.toBeNull();
    const plain = queryByText('16') as HTMLElement;
    expect(plain.style.backgroundColor).toBe(''); // no strip
    const today = queryByText('15') as HTMLElement;
    expect(today.className).toContain('rounded-full');
    expect(today.style.backgroundColor).toBe('rgb(59, 130, 246)');
  });

  it('clean: rings the today cell and shades weekend cells', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={mw({ gridTheme: 'clean' })} style={style} events={[]} /></Wrapper>,
    );
    const todayCell = (queryByText('15') as HTMLElement).parentElement!.parentElement as HTMLElement;
    expect(todayCell.style.boxShadow).toContain('inset 0 0 0 1.5px');
    expect(todayCell.style.backgroundColor).toContain('rgba(59, 130, 246');
    const saturday = (queryByText('18') as HTMLElement).parentElement!.parentElement as HTMLElement;
    expect(saturday.style.backgroundColor).toBe('rgba(255, 255, 255, 0.065)');
    const thursday = (queryByText('16') as HTMLElement).parentElement!.parentElement as HTMLElement;
    expect(thursday.style.backgroundColor).toBe('rgba(255, 255, 255, 0.045)');
  });

  it('clean: bolds the first of the month with the month name and an accent hairline', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={mw({ gridTheme: 'clean' })} style={style} events={[]} /></Wrapper>,
    );
    const aug1 = queryByText('Aug 1') as HTMLElement; // real space — no banner flex-gap collapse
    expect(aug1).not.toBeNull();
    expect(aug1.style.fontWeight).toBe('700');
    const cell = aug1.parentElement!.parentElement as HTMLElement;
    expect(cell.style.boxShadow).toContain('inset 0 2px 0');
  });

  it('clean: pills lead with a compact colored time and a semibold title', () => {
    const { getByText, queryByText } = render(
      <Wrapper><CalendarModule config={mw({ gridTheme: 'clean' })} style={style} events={[timedBlue, onHour]} /></Wrapper>,
    );
    expect(queryByText('08:05 AM')).toBeNull(); // padded banner format gone
    expect(getByText('8:05a')).toBeTruthy();    // off the hour keeps minutes
    expect(getByText('4p')).toBeTruthy();       // on the hour drops them
    const title = getByText('Haircut') as HTMLElement;
    expect(title.className).toContain('font-semibold');
    expect((title.parentElement as HTMLElement).style.backgroundColor).toBe('rgba(255, 255, 255, 0.1)');
  });

  it('clean: supersedes gridEventStyle for this view', () => {
    const { getByText } = render(
      <Wrapper><CalendarModule config={mw({ gridTheme: 'clean', gridEventStyle: 'colored' })} style={style} events={[timedBlue]} /></Wrapper>,
    );
    // colored style would paint the title span in the calendar color; the
    // clean pill colors the wrapper via style.textColor and leaves the span alone
    expect((getByText('Haircut') as HTMLElement).style.color).toBe('');
  });

  it('minimal: drops times and marks pills with a calendar-color bar', () => {
    const { getByText, queryByText } = render(
      <Wrapper><CalendarModule config={mw({ gridTheme: 'minimal' })} style={style} events={[timedBlue]} /></Wrapper>,
    );
    expect(queryByText('8:05a')).toBeNull();
    const pill = (getByText('Haircut') as HTMLElement).parentElement as HTMLElement;
    expect(pill.style.boxShadow).toContain('#3b82f6');
  });

  it('vivid: timed pills go solid in the calendar color with auto-contrast text', () => {
    const { getByText } = render(
      <Wrapper><CalendarModule config={mw({ gridTheme: 'vivid' })} style={style} events={[timedBlue]} /></Wrapper>,
    );
    const pill = (getByText('Haircut') as HTMLElement).parentElement as HTMLElement;
    expect(pill.style.backgroundColor).toBe('rgb(59, 130, 246)');
    expect(pill.style.color).toBe('rgb(255, 255, 255)');
    expect(getByText('8:05a')).toBeTruthy(); // vivid keeps the compact time
  });

  it('stitches a multi-day all-day event: solid first day, hollow squared continuations', () => {
    const { container } = render(
      <Wrapper><CalendarModule config={mw({ gridTheme: 'clean' })} style={style} events={[trip]} /></Wrapper>,
    );
    const pills = Array.from(container.querySelectorAll('[data-event-id="mt3"]')) as HTMLElement[];
    expect(pills).toHaveLength(3); // Jul 17, 18, 19 — 19 is in the next week row
    const [first, middle, last] = pills;
    expect(first.className).toContain('rounded-l');
    expect(first.style.backgroundColor).toBe('rgb(64, 115, 255)'); // #4073ff solid
    expect(middle.className).toContain('rounded-none');
    expect(middle.style.backgroundColor).toBe('');
    expect(middle.style.boxShadow).toContain('#4073ff');
    expect(last.className).toContain('rounded-r');
    expect(last.style.boxShadow).toContain('#4073ff');
  });

  it('dims past-day events but keeps the day number readable', () => {
    const pastEvent = {
      id: 'mt4', title: 'Monday Thing',
      start: format(new Date(2026, 6, 13, 10, 0), LOCAL), end: format(new Date(2026, 6, 13, 11, 0), LOCAL),
      allDay: false,
    } as CalendarEvent;
    const { getByText, queryByText } = render(
      <Wrapper><CalendarModule config={mw({ gridTheme: 'clean' })} style={style} events={[pastEvent]} /></Wrapper>,
    );
    const eventsWrap = (getByText('Monday Thing') as HTMLElement).closest('div')!.parentElement as HTMLElement;
    expect(eventsWrap.style.opacity).toBe('0.45');
    // whole-cell dimming (banner behavior) must NOT apply
    const cell = (queryByText('13') as HTMLElement).parentElement!.parentElement as HTMLElement;
    expect(cell.style.opacity).toBe('');
  });

  it('clean: bolds and accents the weekday header over today’s column', () => {
    const { getByText } = render(
      <Wrapper><CalendarModule config={mw({ gridTheme: 'clean' })} style={style} events={[]} /></Wrapper>,
    );
    // The clock is pinned to a Wednesday, so only that column's header lights up.
    const wed = getByText('Wed') as HTMLElement;
    expect(wed.className).toContain('font-bold');
    expect(wed.style.color).toBe('rgb(59, 130, 246)'); // default accent
    const thu = getByText('Thu') as HTMLElement;
    expect(thu.className).not.toContain('font-bold');
    expect(thu.style.color).toBe('');
  });

  it('banner month view leaves its weekday headers unhighlighted', () => {
    // The header row is shared with the modern skeleton; the today-column
    // highlight is opt-in and must not leak into the banner grid.
    const { container } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'month' })} style={style} events={[]} /></Wrapper>,
    );
    const headers = Array.from(container.querySelectorAll('[class*="tracking-wider"]')) as HTMLElement[];
    expect(headers).toHaveLength(7);
    expect(headers.some((h) => h.style.color !== '' || h.className.includes('font-bold'))).toBe(false);
  });

  it('clean: keeps the week-number column and a Monday start', () => {
    const { container } = render(
      <Wrapper><CalendarModule config={mw({ gridTheme: 'clean', showWeekNumbers: true, startDay: 'monday' })} style={style} events={[]} /></Wrapper>,
    );
    const headers = Array.from(container.querySelectorAll('[class*="tracking-wider"]')) as HTMLElement[];
    expect(headers[0].textContent).toBe('Mon');
    // One week-number cell per row, and Mon Jul 13 2026 opens ISO week 29.
    const weekNumbers = Array.from(container.querySelectorAll('div.items-start.justify-center')) as HTMLElement[];
    expect(weekNumbers).toHaveLength(4);
    expect(weekNumbers[0].textContent).toBe('29');
  });

  it('month grid: honors the theme with a month header and out-of-month dimming', () => {
    const { container, queryByText, queryAllByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'month', gridTheme: 'clean' })} style={style} events={[]} /></Wrapper>,
    );
    expect(container.querySelector('[data-grid-theme="clean"]')).not.toBeNull();
    // Month, not month-range: the padding days from June/August don't widen the label.
    expect(queryByText('July 2026')).not.toBeNull();
    expect(queryByText('June – August 2026')).toBeNull();
    // Jun 28 leads the Sunday-start grid: out of month, so its number is dimmed
    // while the in-month Jul 16 keeps the regular weight.
    const jun28 = queryAllByText('28')[0]; // Jul 28 is the second match
    expect(jun28.style.opacity).toBe(String(TEXT_OPACITY.dim));
    const jul16 = queryByText('16') as HTMLElement;
    expect(jul16.style.opacity).toBe(String(TEXT_OPACITY.secondary));
    // Past in-month days are not dimmed (wall-calendar semantics).
    const jul13 = queryByText('13') as HTMLElement;
    expect(jul13.style.opacity).toBe(String(TEXT_OPACITY.secondary));
  });

  it('month grid: banner dims out-of-month cells and keeps the month title', () => {
    const { queryByText, queryAllByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'month' })} style={style} events={[]} /></Wrapper>,
    );
    expect(queryByText('July 2026')).not.toBeNull();
    const jun28Cell = queryAllByText('28')[0].parentElement as HTMLElement;
    expect(jun28Cell.style.opacity).toBe(String(TEXT_OPACITY.tertiary));
    const jul13Cell = (queryByText('13') as HTMLElement).parentElement as HTMLElement;
    expect(jul13Cell.style.opacity).toBe('1');
  });

  it('month grid: honors gridMaxEventsPerCell', () => {
    const busy = [1, 2, 3].map((n) => ({
      id: `mmo${n}`, title: `Busy ${n}`,
      start: format(new Date(2026, 6, 21, 8 + n, 0), LOCAL), end: format(new Date(2026, 6, 21, 9 + n, 0), LOCAL),
      allDay: false,
    })) as CalendarEvent[];
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'month', gridTheme: 'vivid', gridMaxEventsPerCell: 2 })} style={style} events={busy} /></Wrapper>,
    );
    expect(queryByText('Busy 2')).not.toBeNull();
    expect(queryByText('Busy 3')).toBeNull();
    expect(queryByText('+1 more')).not.toBeNull();
  });

  it('reports per-cell overflow with the chip', () => {
    const busy = [1, 2, 3].map((n) => ({
      id: `mo${n}`, title: `Busy ${n}`,
      start: format(new Date(2026, 6, 21, 8 + n, 0), LOCAL), end: format(new Date(2026, 6, 21, 9 + n, 0), LOCAL),
      allDay: false,
    })) as CalendarEvent[];
    const { queryByText } = render(
      <Wrapper><CalendarModule config={mw({ gridTheme: 'clean', gridMaxEventsPerCell: 2 })} style={style} events={busy} /></Wrapper>,
    );
    expect(queryByText('Busy 2')).not.toBeNull();
    expect(queryByText('Busy 3')).toBeNull();
    expect(queryByText('+1 more')).not.toBeNull();
  });
});

describe('month grid: month-start marks belong to the rolling grid only', () => {
  // Pinned clock: Wed Jul 15 2026. The Sunday-start July grid runs Jun 28 –
  // Aug 1, so the trailing Sat Aug 1 is an out-of-month padding cell.
  it('modern: the padding Aug 1 is a plain muted digit, not a bold "Aug 1" under a rule', () => {
    const { container, queryByText, queryAllByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'month', gridTheme: 'clean' })} style={style} events={[]} /></Wrapper>,
    );
    expect(queryByText('Aug 1')).toBeNull();
    expect(queryByText('Jul 1')).toBeNull();
    const aug1 = queryAllByText('1').at(-1) as HTMLElement;
    expect(aug1.style.fontWeight).toBe('400');
    expect(aug1.style.opacity).toBe(String(TEXT_OPACITY.dim));
    // No cell carries the month-start hairline (only today's ring exists).
    const ruled = Array.from(container.querySelectorAll<HTMLElement>('[style*="inset 0 2px 0"]'));
    expect(ruled).toHaveLength(0);
  });

  it('banner: no month abbreviation or gradient on either 1st', () => {
    const { container } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'month' })} style={style} events={[]} /></Wrapper>,
    );
    expect(container.textContent).not.toContain('Aug1');
    expect(container.textContent).not.toContain('Jul1');
    expect(container.querySelectorAll('[style*="linear-gradient"]')).toHaveLength(0);
  });

  it('rolling grid still marks Aug 1 with its month name (muted only when it has passed)', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4, gridTheme: 'clean' })} style={style} events={[]} /></Wrapper>,
    );
    const aug1 = queryByText('Aug 1') as HTMLElement;
    expect(aug1).not.toBeNull();
    expect(aug1.style.fontWeight).toBe('700');
    expect(aug1.style.opacity).toBe(String(TEXT_OPACITY.primary));
  });
});

describe('gridMaxEventsPerCell governs all three grids', () => {
  const busyDay = (count: number) => Array.from({ length: count }, (_, i) => ({
    id: `cap${i}`, title: `Cap ${i + 1}`,
    start: format(new Date(2026, 6, 15, 8 + i, 0), LOCAL), end: format(new Date(2026, 6, 15, 8 + i, 30), LOCAL),
    allDay: false,
  })) as CalendarEvent[];

  it('week grid: unset shows 5, an explicit cap applies', () => {
    const five = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'week' })} style={style} events={busyDay(6)} /></Wrapper>,
    );
    expect(five.queryByText('Cap 5')).not.toBeNull();
    expect(five.queryByText('Cap 6')).toBeNull();
    expect(five.queryByText('+1 more')).not.toBeNull();
    five.unmount();

    const two = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'week', gridMaxEventsPerCell: 2 })} style={style} events={busyDay(6)} /></Wrapper>,
    );
    expect(two.queryByText('Cap 2')).not.toBeNull();
    expect(two.queryByText('Cap 3')).toBeNull();
    expect(two.queryByText('+4 more')).not.toBeNull();
  });

  it('banner month grid: unset shows 4', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'month' })} style={style} events={busyDay(6)} /></Wrapper>,
    );
    expect(queryByText('Cap 4')).not.toBeNull();
    expect(queryByText('Cap 5')).toBeNull();
    expect(queryByText('+2 more')).not.toBeNull();
  });

  it('a hand-edited non-numeric cap falls back to the default instead of blanking cells', () => {
    const { queryByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'month', gridTheme: 'clean', gridMaxEventsPerCell: 'abc' as unknown as number })} style={style} events={busyDay(6)} /></Wrapper>,
    );
    expect(queryByText('Cap 4')).not.toBeNull();
    expect(queryByText('+2 more')).not.toBeNull();
  });
});

describe('gridDayLabelScale sizes the date furniture only', () => {
  const timed = [{
    id: 'dls1', title: 'Haircut',
    start: format(new Date(2026, 6, 15, 8, 5), LOCAL), end: format(new Date(2026, 6, 15, 9, 5), LOCAL),
    allDay: false,
  }] as CalendarEvent[];

  /** Weekday headers are the only uppercase tracking-wider spans in a grid. */
  const dayNames = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.uppercase.tracking-wider'));

  it('banner multi-week: headers and day numbers grow, event pills do not', () => {
    const base = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4 })} style={style} events={timed} /></Wrapper>,
    );
    const pillBefore = (base.getByText('Haircut') as HTMLElement).style.fontSize;
    expect(dayNames(base.container)[0].style.fontSize).toBe('0.6em');
    base.unmount();

    const scaled = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4, gridDayLabelScale: 1.5 })} style={style} events={timed} /></Wrapper>,
    );
    expect(dayNames(scaled.container)[0].style.fontSize).toBe('0.9em');
    // The strip's height stays 1.35em: that em resolves against the strip's
    // OWN font-size, so it already grew with the digits. Scaling it here too
    // would grow the box quadratically.
    const strip = scaled.getByText('15').closest('span') as HTMLElement;
    expect(strip.style.fontSize).toBe('0.975em');
    expect(strip.style.height).toBe('1.35em');
    expect((scaled.getByText('Haircut') as HTMLElement).style.fontSize).toBe(pillBefore);
  });

  it('clean multi-week: today badge and its box scale together, pills untouched', () => {
    const { container, getByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4, gridTheme: 'clean', gridDayLabelScale: 1.5 })} style={style} events={timed} /></Wrapper>,
    );
    expect(dayNames(container)[0].style.fontSize).toBe('0.9em');
    const todayBadge = getByText('15') as HTMLElement;
    expect(todayBadge.style.fontSize).toBe('0.975em');
    expect(todayBadge.style.minWidth).toBe('1.4em');
    expect(todayBadge.style.height).toBe('1.4em');
    // The row around it has no font-size of its own, so it does scale.
    expect((todayBadge.parentElement as HTMLElement).style.height).toBe('2.1em');
    expect((getByText('Haircut') as HTMLElement).style.fontSize).toBe('0.7em');
  });

  it('week grid: day names, day circles and week numbers scale', () => {
    const { container, getByText } = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'week', showWeekNumbers: true, gridDayLabelScale: 2 })} style={style} events={timed} /></Wrapper>,
    );
    expect(dayNames(container)[0].style.fontSize).toBe('1.2em');
    const circle = getByText('15') as HTMLElement;
    expect(circle.style.fontSize).toBe('1.7em');
    expect(circle.style.width).toBe('1.8em');
    // Week 29 of 2026 contains Jul 15; its column widens with the digits.
    expect((getByText('29') as HTMLElement).style.fontSize).toBe('1.2em');
  });

  it('unset leaves every size alone and out-of-range values are clamped', () => {
    const unset = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4 })} style={style} events={[]} /></Wrapper>,
    );
    expect(dayNames(unset.container)[0].style.fontSize).toBe('0.6em');
    unset.unmount();

    // Hand-edited config.json isn't type-checked, so absurd values must land
    // on the bounds rather than blowing the cell apart.
    const huge = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4, gridDayLabelScale: 12 })} style={style} events={[]} /></Wrapper>,
    );
    expect(dayNames(huge.container)[0].style.fontSize).toBe('1.2em');
    huge.unmount();

    const junk = render(
      <Wrapper><CalendarModule config={makeConfig({ viewMode: 'multi-week', weeksToShow: 4, gridDayLabelScale: 'big' as unknown as number })} style={style} events={[]} /></Wrapper>,
    );
    expect(dayNames(junk.container)[0].style.fontSize).toBe('0.6em');
  });
});

// ─── Feed health: not-updating badge, setup cards, tap chevrons ───

describe('CalendarModule feed health', () => {
  const upcoming = [events[2]];
  const HOUR = 60 * 60 * 1000;

  it('badges kept events quietly with the time of the last good refresh', () => {
    const { getByRole, queryByTestId } = render(
      <Wrapper>
        <CalendarModule config={makeConfig()} style={style} events={upcoming}
          calendarStatus={{ error: 'boom', updatedAt: NOW.getTime() - 3 * HOUR }} />
      </Wrapper>,
    );
    const badge = getByRole('status');
    expect(badge.textContent).toBe('Not updating since 9:00 AM');
    expect(badge.hasAttribute('data-loud')).toBe(false);
    expect(queryByTestId('calendar-stale-edge')).toBeNull();
  });

  it('gets loud with a tinted card edge once the refresh has failed for a day', () => {
    const { getByRole, getByTestId, queryByText } = render(
      <Wrapper>
        <CalendarModule config={makeConfig()} style={style} events={upcoming}
          calendarStatus={{ error: 'boom', updatedAt: NOW.getTime() - 25 * HOUR }} />
      </Wrapper>,
    );
    const badge = getByRole('status');
    expect(badge.textContent).toBe('Not updating since yesterday, 11:00 AM');
    expect(badge.hasAttribute('data-loud')).toBe(true);
    expect(getByTestId('calendar-stale-edge')).not.toBeNull();
    // The kept events stay on screen behind the badge.
    expect(queryByText('Tomorrow Planning')).not.toBeNull();
  });

  it('shows the no-calendars card instead of an empty day when nothing is picked', () => {
    const { getByTestId, getByText } = render(
      <Wrapper><CalendarModule config={makeConfig()} style={style} calendarSetup="noSources" /></Wrapper>,
    );
    expect(getByTestId('calendar-setup-card').getAttribute('data-setup')).toBe('noSources');
    expect(getByText('No calendars picked yet')).not.toBeNull();
    expect(getByText('Choose which calendars to show in Settings › Calendar.')).not.toBeNull();
  });

  it('shows the sign-in card instead of saved events when every source needs a Google sign-in', () => {
    const { getByTestId, getByText, queryByText } = render(
      <Wrapper>
        <CalendarModule config={makeConfig()} style={style} events={upcoming}
          sourceStatus={[{ id: 'g1', name: 'family', ok: false, messageKey: 'googleNotSignedIn', fetchedAt: null }]} />
      </Wrapper>,
    );
    expect(getByTestId('calendar-setup-card').getAttribute('data-setup')).toBe('signIn');
    expect(getByText('Calendar needs to sign in again')).not.toBeNull();
    expect(queryByText('Tomorrow Planning')).toBeNull();
  });

  it('names a single failing source and keeps live events when another source still updates', () => {
    const { getByRole, queryByText, queryByTestId } = render(
      <Wrapper>
        <CalendarModule config={makeConfig()} style={style} events={upcoming}
          sourceStatus={[
            { id: 'ok', name: 'Family', ok: true, fetchedAt: NOW.getTime() },
            { id: 'school', name: 'School', ok: false, fetchedAt: NOW.getTime() - 2 * HOUR },
          ]} />
      </Wrapper>,
    );
    expect(getByRole('status').textContent).toBe('School not updating since 10:00 AM');
    expect(queryByTestId('calendar-setup-card')).toBeNull();
    expect(queryByText('Tomorrow Planning')).not.toBeNull();
  });

  it('draws a chevron on event rows only when tapping opens a detail', () => {
    const plain = render(
      <Wrapper><CalendarModule config={makeConfig()} style={style} events={upcoming} /></Wrapper>,
    );
    expect(plain.queryByTestId('event-chevron')).toBeNull();
    plain.unmount();
    const tappable = render(
      <Wrapper><CalendarModule config={makeConfig({ eventTapDetails: true })} style={style} events={upcoming} /></Wrapper>,
    );
    expect(tappable.getAllByTestId('event-chevron')).toHaveLength(1);
  });
});
