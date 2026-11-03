// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { addDays, startOfWeek } from 'date-fns';
import type { CalendarEvent, CalendarPerson, FullscreenCalendarConfig, ModuleStyle } from '@/types/config';
import { EMPTY_EXTRAS } from '@/lib/calendar-extras';
import { getModuleDefinition } from '@/lib/module-registry';
import { LOOK_AHEAD_DAYS } from '@/lib/look-ahead';
import { useLookAheadStore } from '@/stores/look-ahead-store';
import { I18nWrapper, installResizeObserverStub, testScale } from '../../__tests__/helpers/harness';

// Monday Aug 24 2026, 3:40 PM; the week (Sunday start) is Aug 23 to 29.
const NOW = new Date(2026, 7, 24, 15, 40);
vi.mock('@/hooks/useFullscreenDims', () => ({ useFullscreenDims: () => ({ containerRef: () => {}, dims: { w: 1080, h: 1920 } }) }));
vi.mock('@/hooks/useTZClock', () => ({ useTZClock: () => new Date(2026, 7, 24, 15, 40) }));
vi.mock('../useCalendarExtras', () => ({ useCalendarExtras: () => EMPTY_EXTRAS }));

installResizeObserverStub();

import FullscreenCalendarModule, { selectVisibleEvents } from '../FullscreenCalendarModule';
import { VIEW_TRAITS } from '../view-traits';
import { scheduleFirstDay } from '../view-support';
import { WeekListView } from '../WeekListView';
import { MonthGridView } from '../MonthGridView';
import { AgendaView } from '../AgendaView';
import { FamilyGridView } from '../FamilyGridView';
import { DayTimelineView } from '../DayTimelineView';
import { RollingWeeksView } from '../RollingWeeksView';

afterEach(() => {
  cleanup();
  act(() => {
    for (const id of Object.keys(useLookAheadStore.getState().reaches)) useLookAheadStore.getState().setReach(id, null);
  });
});

const today = new Date(2026, 7, 24);
const defaults = getModuleDefinition('fullscreen-calendar')!.defaultConfig as unknown as FullscreenCalendarConfig;
const scale = testScale({ isDark: false });

const ev = (id: string, title: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, title, start, end, allDay: false, ...extra });

const EVENTS: CalendarEvent[] = [
  ev('this-week', 'Piano lesson', '2026-08-25T16:00:00', '2026-08-25T17:00:00'),
  ev('next-week', 'Soccer camp', '2026-09-01T09:00:00', '2026-09-01T12:00:00'),
  ev('last-week', 'Dentist', '2026-08-18T09:00:00', '2026-08-18T10:00:00'),
];

function Calendar({ config = {}, events = EVENTS, display = true }: { config?: Partial<FullscreenCalendarConfig>; events?: CalendarEvent[]; display?: boolean }) {
  return (
    <FullscreenCalendarModule
      config={{ ...defaults, view: 'week-list', ...config } as FullscreenCalendarConfig}
      style={{} as ModuleStyle}
      events={events}
      screenId={display ? 's1' : undefined}
      moduleId={display ? 'cal' : undefined}
    />
  );
}

const title = (container: HTMLElement) => container.querySelector('.fsc-header-title')?.textContent;

describe('the full-screen calendar header arrows', () => {
  it('step the week list a week, name it, and come back with Back to this week', () => {
    const { container } = render(<Calendar />, { wrapper: I18nWrapper });
    expect(title(container)).toBe('August 23 – 29, 2026');
    const bar = screen.getByTestId('look-ahead-bar');
    // On the header's right, after the spacer: a longer title or the tag never moves the arrows.
    expect(bar.previousElementSibling?.getAttribute('style')).toContain('flex: 1');
    expect(screen.queryByTestId('look-ahead-words')).toBeNull();
    expect(screen.queryByTestId('look-ahead-home')).toBeNull();
    expect(container.querySelector('[data-event-id="this-week"]')).not.toBeNull();

    fireEvent.click(screen.getByTestId('look-ahead-forward'));
    expect(title(container)).toBe('August 30 – September 5, 2026');
    expect(screen.getByTestId('look-ahead-words').textContent).toBe('Next week');
    expect(screen.getByTestId('look-ahead-home').textContent).toBe('Back to this week');
    expect(container.querySelector('[data-event-id="next-week"]')).not.toBeNull();
    expect(container.querySelector('[data-event-id="this-week"]')).toBeNull();

    fireEvent.click(screen.getByTestId('look-ahead-home'));
    expect(title(container)).toBe('August 23 – 29, 2026');
    expect(screen.queryByTestId('look-ahead-words')).toBeNull();
  });

  it('registers what the arrows can reach with the shared fetch while away, and clears it back home', () => {
    render(<Calendar />, { wrapper: I18nWrapper });
    expect(useLookAheadStore.getState().span).toBeNull();
    fireEvent.click(screen.getByTestId('look-ahead-back'));
    expect(screen.getByTestId('look-ahead-words').textContent).toBe('Last week');
    const span = useLookAheadStore.getState().span;
    const weekStart = startOfWeek(today);
    expect(span).toEqual({
      start: addDays(weekStart, -LOOK_AHEAD_DAYS).getTime(),
      end: addDays(weekStart, LOOK_AHEAD_DAYS + 7).getTime(),
    });
    fireEvent.click(screen.getByTestId('look-ahead-home'));
    expect(useLookAheadStore.getState().span).toBeNull();
  });

  it('steps the month grid a month', () => {
    const { container } = render(<Calendar config={{ view: 'month-grid' }} />, { wrapper: I18nWrapper });
    expect(title(container)).toBe('August 2026');
    fireEvent.click(screen.getByTestId('look-ahead-forward'));
    expect(title(container)).toBe('September 2026');
    expect(screen.getByTestId('look-ahead-words').textContent).toBe('Next month');
    expect(screen.getByTestId('look-ahead-home').textContent).toBe('Back to this month');
    expect(container.querySelector('[role="grid"]')?.getAttribute('aria-label')).toBe('September 2026');
  });

  it('steps the day timeline a day and carries that day’s title', () => {
    const { container } = render(<Calendar config={{ view: 'day-timeline' }} />, { wrapper: I18nWrapper });
    expect(title(container)).toBe('Monday, August 24');
    fireEvent.click(screen.getByTestId('look-ahead-forward'));
    expect(title(container)).toBe('Tuesday, August 25');
    expect(screen.getByTestId('look-ahead-words').textContent).toBe('Tomorrow');
    expect(screen.getByTestId('look-ahead-home').textContent).toBe('Back to today');
    expect(container.querySelector('[data-event-id="this-week"]')).not.toBeNull();
  });

  it('steps the agenda its run of days and lists them from their first day', () => {
    const { container } = render(<Calendar config={{ view: 'agenda', agendaDaysAhead: 7 }} />, { wrapper: I18nWrapper });
    expect(title(container)).toBe('Upcoming');
    expect(container.querySelector('[data-event-id="last-week"]')).toBeNull();
    fireEvent.click(screen.getByTestId('look-ahead-back'));
    expect(title(container)).toBe('August 17 – 23, 2026');
    expect(screen.getByTestId('look-ahead-words').textContent).toBe('Last week');
    // Ended long ago, but it is on a day the stepped list draws.
    expect(container.querySelector('[data-event-id="last-week"]')).not.toBeNull();
    expect(container.querySelector('[data-event-id="this-week"]')).toBeNull();
  });

  it.each(['up-next', 'free-time'] as const)('draws no arrows on %s', (view) => {
    render(<Calendar config={{ view }} />, { wrapper: I18nWrapper });
    expect(screen.queryByTestId('look-ahead-bar')).toBeNull();
  });

  it('draws no arrows with taps off, or in the editor preview', () => {
    const { container, unmount } = render(<Calendar config={{ eventTapDetails: false }} />, { wrapper: I18nWrapper });
    expect(screen.queryByTestId('look-ahead-bar')).toBeNull();
    const header = container.querySelector('header');
    expect(header?.style.height).toBe(`${(1080 / 100) * 5}px`);
    unmount();
    render(<Calendar display={false} />, { wrapper: I18nWrapper });
    expect(screen.queryByTestId('look-ahead-bar')).toBeNull();
  });
});

describe('selectVisibleEvents from a stepped agenda day', () => {
  const ended = ev('ended', 'Ended', '2026-08-18T09:00:00', '2026-08-18T10:00:00');
  const before = ev('before', 'Before', '2026-08-16T09:00:00', '2026-08-16T10:00:00');
  const later = ev('later', 'Later', '2026-09-02T09:00:00', '2026-09-02T10:00:00');

  it('keeps what ends after the stepped day began, past or not', () => {
    const from = new Date(2026, 7, 17);
    expect(selectVisibleEvents([before, ended, later], 'agenda', undefined, NOW, { from }).map((e) => e.id)).toEqual(['ended', 'later']);
  });

  it('drops what ends before a day stepped ahead to', () => {
    const from = new Date(2026, 7, 31);
    expect(selectVisibleEvents([ended, later], 'agenda', undefined, NOW, { from }).map((e) => e.id)).toEqual(['later']);
  });

  it('leaves the other views and a resting agenda as they were', () => {
    expect(selectVisibleEvents([ended, later], 'agenda', undefined, NOW, { from: null }).map((e) => e.id)).toEqual(['later']);
    expect(selectVisibleEvents([ended, later], 'week-list', undefined, NOW, { from: new Date(2026, 8, 7) }).map((e) => e.id)).toEqual(['ended', 'later']);
  });
});

describe('view traits with an anchor', () => {
  const t = (k: string) => k;
  const ctx = (config: Partial<FullscreenCalendarConfig>, anchor?: Date) => ({
    today, anchor, t, locale: 'en-US', config: { ...defaults, ...config } as FullscreenCalendarConfig, scaleWidth: 1080, weekStartsOn: 0 as const,
  });

  it('titles and windows the stepped week, month and day', () => {
    const nextWeek = addDays(today, 7);
    expect(VIEW_TRAITS['week-list'].headerTitle(ctx({}, nextWeek))).toBe('August 30 – September 5, 2026');
    expect(VIEW_TRAITS['week-list'].legendWindow(ctx({}, nextWeek))).toEqual({ start: new Date(2026, 7, 30), end: new Date(2026, 8, 6) });
    expect(VIEW_TRAITS['family-grid'].headerTitle(ctx({}, nextWeek))).toBe('August 30 – September 5, 2026');
    expect(VIEW_TRAITS['month-grid'].headerTitle(ctx({}, new Date(2026, 9, 24)))).toBe('October 2026');
    expect(VIEW_TRAITS['month-grid'].legendWindow(ctx({}, new Date(2026, 9, 24))).start).toEqual(new Date(2026, 8, 27));
    expect(VIEW_TRAITS['day-timeline'].headerTitle(ctx({}, addDays(today, -1)))).toBe('Sunday, August 23');
    expect(VIEW_TRAITS.rolling.headerTitle(ctx({ rollingWeeksToShow: 2 }, nextWeek))).toBe('August 31 – September 13, 2026');
  });

  it('keeps the agenda’s Upcoming at rest and names its days when stepped', () => {
    expect(VIEW_TRAITS.agenda.headerTitle(ctx({ agendaDaysAhead: 14 }))).toBe('fullscreen-calendar.headerUpcoming');
    expect(VIEW_TRAITS.agenda.headerTitle(ctx({ agendaDaysAhead: 14 }, today))).toBe('fullscreen-calendar.headerUpcoming');
    expect(VIEW_TRAITS.agenda.headerTitle(ctx({ agendaDaysAhead: 14 }, addDays(today, 14)))).toBe('September 7 – 20, 2026');
    expect(VIEW_TRAITS.agenda.legendWindow(ctx({ agendaDaysAhead: 14 }, addDays(today, 14)))).toEqual({ start: new Date(2026, 8, 7), end: new Date(2026, 8, 21) });
  });

  it('pages a narrow schedule by its columns from where its start setting put it', () => {
    // Three columns from the week's first day (Sunday Aug 23): the next tap is Wednesday, not Sunday again.
    const config = { view: 'schedule', scheduleDaysToShow: 3, scheduleStartAnchor: 'start-of-week' } as const;
    expect(VIEW_TRAITS.schedule.headerTitle(ctx(config))).toBe('August 23 – 25, 2026');
    expect(VIEW_TRAITS.schedule.headerTitle(ctx(config, addDays(today, 3)))).toBe('August 26 – 28, 2026');
    expect(scheduleFirstDay(today, addDays(today, -3), config)).toEqual(new Date(2026, 7, 20));
    expect(scheduleFirstDay(today, today, { scheduleStartAnchor: 'next-weekend', startDay: 'sunday' })).toEqual(new Date(2026, 7, 29));
  });
});

describe('views drawing from an anchor', () => {
  const config = { ...defaults, dimPastEvents: true } as FullscreenCalendarConfig;

  it('the week list draws the stepped week without a Today badge', () => {
    const { container } = render(
      <WeekListView events={EVENTS} config={{ ...config, view: 'week-list' }} scale={scale} today={today} anchor={addDays(today, 7)} now={NOW} timeFormat="12h" />,
      { wrapper: I18nWrapper },
    );
    expect(container.textContent).toContain('Sunday, August 30');
    expect(container.textContent).toContain('Saturday, September 5');
    expect(container.textContent).not.toContain('Monday, August 24');
    expect(screen.queryByText('Today')).toBeNull();
  });

  it('the month grid draws the stepped month and still marks only the real past', () => {
    const { container } = render(
      <MonthGridView events={[]} config={{ ...config, view: 'month-grid' }} scale={scale} today={today} anchor={new Date(2026, 6, 24)} now={NOW} timeFormat="12h" />,
      { wrapper: I18nWrapper },
    );
    expect(container.querySelector('[role="grid"]')?.getAttribute('aria-label')).toBe('July 2026');
    const cells = Array.from(container.querySelectorAll('[role="gridcell"]'));
    const july15 = cells.find((c) => c.getAttribute('aria-label')?.startsWith('July 15'));
    expect(july15?.getAttribute('style')).toContain('--cal-past-opacity');
  });

  /* A month someone stepped back to was too faded to read. */
  it('the month grid fades nothing in a month someone stepped back to', () => {
    const { container } = render(
      <MonthGridView events={[]} config={{ ...config, view: 'month-grid' }} scale={scale} today={today} anchor={new Date(2026, 6, 24)} stepped now={NOW} timeFormat="12h" />,
      { wrapper: I18nWrapper },
    );
    const cells = Array.from(container.querySelectorAll('[role="gridcell"]'));
    const july15 = cells.find((c) => c.getAttribute('aria-label')?.startsWith('July 15'));
    expect(july15?.getAttribute('style') ?? '').not.toContain('--cal-past-opacity');
  });

  it('the agenda starts at the stepped day and dims days before today', () => {
    const { container } = render(
      <AgendaView events={EVENTS} config={{ ...config, view: 'agenda', agendaDaysAhead: 7 }} scale={scale} today={today} anchor={addDays(today, -7)} now={NOW} timeFormat="12h" />,
      { wrapper: I18nWrapper },
    );
    expect(container.textContent).toContain('Monday, August 17');
    expect(container.textContent).not.toContain('Monday, August 24');
    const dentist = container.querySelector('[data-event-id="last-week"]');
    expect(dentist?.parentElement?.getAttribute('style')).toContain('--cal-past-opacity');
  });

  it('the agenda fades nothing in days someone stepped back to', () => {
    const { container } = render(
      <AgendaView events={EVENTS} config={{ ...config, view: 'agenda', agendaDaysAhead: 7 }} scale={scale} today={today} anchor={addDays(today, -7)} stepped now={NOW} timeFormat="12h" />,
      { wrapper: I18nWrapper },
    );
    const dentist = container.querySelector('[data-event-id="last-week"]');
    expect(dentist?.parentElement?.getAttribute('style') ?? '').not.toContain('--cal-past-opacity');
  });

  it('the family grid counts another week’s events without calling it this week', () => {
    const people: CalendarPerson[] = [{ id: 'p', name: 'Ella', color: '#db2777', sourceIds: ['ella'] }];
    const events = [ev('camp', 'Soccer camp', '2026-09-01T09:00:00', '2026-09-01T12:00:00', { sourceId: 'ella' })];
    const { container } = render(
      <FamilyGridView events={events} config={{ ...config, view: 'family-grid' }} scale={scale} today={today} anchor={addDays(today, 7)} now={NOW} people={people} timeFormat="12h" />,
      { wrapper: I18nWrapper },
    );
    const ella = Array.from(container.querySelectorAll('[role="rowheader"]')).map((el) => el.textContent ?? '').find((h) => h.includes('Ella'));
    expect(ella).toContain('1 event');
    expect(ella).not.toContain('this week');
  });

  it('the day timeline draws another day and dims a day gone by', () => {
    const { container } = render(
      <DayTimelineView events={EVENTS} config={{ ...config, view: 'day-timeline', dayHourStart: 6, dayHourEnd: 22 }} scale={scale} today={today} anchor={new Date(2026, 7, 18)} now={NOW} timeFormat="12h" />,
      { wrapper: I18nWrapper },
    );
    const dentist = container.querySelector<HTMLElement>('[data-event-id="last-week"]');
    expect(dentist).not.toBeNull();
    expect(dentist?.style.opacity).toBe('0.4');
    expect(container.querySelector('[data-event-id="this-week"]')).toBeNull();
  });

  it('the rolling window moves with the anchor and dims days before today', () => {
    const { container } = render(
      <RollingWeeksView events={[]} config={{ ...config, view: 'rolling', rollingWeeksToShow: 1 }} scale={scale} today={today} anchor={addDays(today, -7)} now={NOW} timeFormat="12h" />,
      { wrapper: I18nWrapper },
    );
    const cells = container.querySelectorAll('[role="gridcell"]');
    expect(cells[0].getAttribute('aria-label')).toContain('August 17');
    expect(cells[0].getAttribute('style')).toContain('--cal-past-opacity');
  });
});
