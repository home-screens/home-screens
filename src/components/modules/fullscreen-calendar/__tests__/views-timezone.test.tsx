// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { FullscreenCalendarConfig } from '@/types/config';
import type { CalendarEvent } from '../view-support';
import { installResizeObserverStub, I18nWrapper as Wrapper, testScale } from '../../__tests__/helpers/harness';

installResizeObserverStub();

import { WeekListView } from '../WeekListView';
import { MonthGridView } from '../MonthGridView';
import { AgendaView } from '../AgendaView';
import { ScheduleView } from '../ScheduleView';
import { DayTimelineView } from '../DayTimelineView';

const scale = testScale();

const config: FullscreenCalendarConfig = {
  view: 'week-list',
  density: 'cozy',
  typographySize: 'medium',
  accentColor: '#EA580C',
  dimPastEvents: false,
  shadeWeekends: false,
  startDay: 'sunday',
  agendaDaysAhead: 7,
} as FullscreenCalendarConfig;

// 14:00 UTC on Aug 24 is 02:00 on Tuesday Aug 25 in Auckland (UTC+12). Every
// plausible CI/dev OS timezone (UTC, US, EU) still reads it as Aug 24, so a
// view that buckets by the OS clock puts it on Monday.
const TZ = 'Pacific/Auckland';
const event: CalendarEvent = {
  id: 'nz',
  title: 'Early swim',
  allDay: false,
  start: '2026-08-24T14:00:00Z',
  end: '2026-08-24T15:00:00Z',
};
// Auckland wall-clock "today": Tuesday Aug 25, 10:00.
const today = new Date(2026, 7, 25);
const now = new Date(2026, 7, 25, 10, 0);

afterEach(cleanup);

function sectionOf(text: string, title: string, before: string, after: string): boolean {
  const i = text.indexOf(before);
  const j = text.indexOf(after);
  const k = text.indexOf(title);
  return i >= 0 && j > i && k > i && k < j;
}

describe('fullscreen views bucket events by the display timezone', () => {
  it('week-list puts a UTC event on its Auckland day', () => {
    const { container } = render(
      <WeekListView events={[event]} timezone={TZ} config={config} scale={scale} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    const text = container.textContent ?? '';
    expect(sectionOf(text, 'Early swim', 'Tuesday, August 25', 'Wednesday, August 26')).toBe(true);
    expect(text).toContain('2:00 AM');
  });

  it('agenda puts a UTC event on its Auckland day', () => {
    const { container } = render(
      <AgendaView events={[event]} timezone={TZ} config={{ ...config, view: 'agenda' }} scale={scale} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Early swim');
    expect(text).toContain('2:00 AM');
    expect(text).not.toContain('9:00 AM');
  });

  // The pill's inline `top`/`height` come from a second eventHoursOnDay call in
  // the render loop, separate from the overlap layout — geometry asserted here
  // so that call site can't silently fall back to the OS clock. In jsdom the
  // container measures 0, so hourHeight is the deterministic baseHourHeight.
  it('schedule positions the pill at the Auckland wall hours', () => {
    const { container } = render(
      <ScheduleView
        events={[event]}
        timezone={TZ}
        config={{ ...config, view: 'schedule', scheduleDaysToShow: 7, scheduleHourStart: 0, scheduleHourEnd: 22, scheduleStartAnchor: 'today' }}
        scale={scale}
        today={today}
        now={now}
      />,
      { wrapper: Wrapper },
    );
    const pill = container.querySelector('[data-event-id="nz"]') as HTMLElement;
    expect(pill).not.toBeNull();
    // cozy schedule hourHeight = bu * 5.5 = 55px; event is 02:00-03:00 Auckland.
    expect(pill.style.top).toBe('110px');
    expect(pill.style.height).toBe('55px');
  });

  it('day-timeline positions the pill at the Auckland wall hours', () => {
    const { container } = render(
      <DayTimelineView
        events={[event]}
        timezone={TZ}
        config={{ ...config, view: 'day-timeline', dayHourStart: 0, dayHourEnd: 22 }}
        scale={scale}
        today={today}
        now={now}
      />,
      { wrapper: Wrapper },
    );
    const pill = container.querySelector('[data-event-id="nz"]') as HTMLElement;
    expect(pill).not.toBeNull();
    // cozy day-timeline hourHeight = bu * 6.5 = 65px.
    expect(pill.style.top).toBe('130px');
    expect(pill.style.height).toBe('65px');
  });

  it('month-grid places the event in the 25th, not the 24th', () => {
    const { container } = render(
      <MonthGridView events={[event]} timezone={TZ} config={{ ...config, view: 'month-grid' }} scale={scale} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    // Cells carry no day attribute; assert by text order between day numbers.
    const text = container.textContent ?? '';
    const i24 = text.indexOf('24');
    const i25 = text.indexOf('25', i24 + 1);
    const i26 = text.indexOf('26', i25 + 1);
    const k = text.indexOf('Early swim');
    expect(k).toBeGreaterThan(i25);
    expect(k).toBeLessThan(i26);
  });
});
