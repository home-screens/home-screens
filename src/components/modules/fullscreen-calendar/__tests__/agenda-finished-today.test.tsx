// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { format } from 'date-fns';
import type { FullscreenCalendarConfig } from '@/types/config';
import type { CalendarEvent } from '../view-support';
import { LOCAL } from '@/lib/__tests__/helpers/calendar-fixtures';
import { installResizeObserverStub, I18nWrapper as Wrapper, testScale } from '../../__tests__/helpers/harness';

installResizeObserverStub();

import { AgendaView } from '../AgendaView';

const scale = testScale();

const base: FullscreenCalendarConfig = {
  view: 'agenda',
  density: 'cozy',
  typographySize: 'medium',
  accentColor: '#EA580C',
  dimPastEvents: true,
  shadeWeekends: false,
  startDay: 'sunday',
  agendaDaysAhead: 7,
} as FullscreenCalendarConfig;

const today = new Date(2026, 7, 25);
const now = new Date(2026, 7, 25, 17, 0);
const at = (h: number, m = 0) => format(new Date(2026, 7, 25, h, m), LOCAL);

// Five finished hour-long events, one upcoming tonight. The module-level
// filter (selectVisibleEvents) has already let all of them through.
const finished = [7, 8, 9, 10, 11].map((h) => ({
  id: `f${h}`, title: `Finished ${h}`, allDay: false, start: at(h), end: at(h + 1),
})) as CalendarEvent[];
const dinner = { id: 'dinner', title: 'Dinner', allDay: false, start: at(19), end: at(20) } as CalendarEvent;

afterEach(cleanup);

describe('fullscreen agenda with agendaShowFinishedToday', () => {
  it('keeps only the most recent few finished rows so upcoming rows stay on screen', () => {
    const { queryByText } = render(
      <AgendaView events={[...finished, dinner]} config={{ ...base, agendaShowFinishedToday: true }} scale={scale} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    expect(queryByText('Finished 7')).toBeNull();
    expect(queryByText('Finished 8')).toBeNull();
    expect(queryByText('Finished 9')).not.toBeNull();
    expect(queryByText('Finished 10')).not.toBeNull();
    expect(queryByText('Finished 11')).not.toBeNull();
    expect(queryByText('Dinner')).not.toBeNull();
  });

  it('dims the finished rows it keeps via dimPastEvents', () => {
    const { getByText } = render(
      <AgendaView events={[...finished, dinner]} config={{ ...base, agendaShowFinishedToday: true }} scale={scale} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    const done = getByText('Finished 11').closest('[data-event-id]') as HTMLElement;
    const next = getByText('Dinner').closest('[data-event-id]') as HTMLElement;
    expect(done.style.opacity).toBe('0.4');
    expect(next.style.opacity).toBe('1');
  });

  it('does not trim anything when the flag is off', () => {
    const { queryByText } = render(
      <AgendaView events={[...finished, dinner]} config={base} scale={scale} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    expect(queryByText('Finished 7')).not.toBeNull();
  });
});
