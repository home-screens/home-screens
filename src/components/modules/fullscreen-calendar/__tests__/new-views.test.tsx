// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import enUSCore from '@/translations/en-US/core.json';
import type { CalendarPerson, FullscreenCalendarConfig } from '@/types/config';
import type { CalendarEvent, CalendarScale } from '../FullscreenCalendarModule';

class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

import { FamilyGridView } from '../FamilyGridView';
import { UpNextView } from '../UpNextView';
import { FreeTimeView } from '../FreeTimeView';

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en-US" blob={{ modules: enUSModules, core: enUSCore }}>
      {children}
    </I18nProvider>
  );
}

const scale: CalendarScale = {
  bu: 10, width: 1080, height: 1920, orientation: 'portrait', densityMul: 1, typoMul: 1, isDark: false, eventStyle: 'wash',
};

const config = {
  view: 'family-grid', density: 'cozy', typographySize: 'medium', accentColor: '', dimPastEvents: false, shadeWeekends: false,
  startDay: 'monday',
} as FullscreenCalendarConfig;

// Monday Aug 24 2026, 3:40 PM.
const today = new Date(2026, 7, 24);
const now = new Date(2026, 7, 24, 15, 40);

const ev = (id: string, title: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, title, start, end, allDay: false, ...extra });

const people: CalendarPerson[] = [
  { id: 'p-ella', name: 'Ella', color: '#db2777', sourceIds: ['src-ella'] },
  { id: 'p-owen', name: 'Owen', color: '#ea580c', sourceIds: ['src-owen'] },
];

afterEach(cleanup);

describe('FamilyGridView', () => {
  it('draws one row per person plus Everyone for the shared event, and routes events to rows', () => {
    const events = [
      ev('soccer', 'Soccer practice', '2026-08-24T16:30:00', '2026-08-24T18:00:00', { sourceId: 'src-ella' }),
      ev('dinner', 'Family dinner', '2026-08-24T18:30:00', '2026-08-24T19:30:00', { sourceId: 'src-family' }),
    ];
    const { container } = render(
      <FamilyGridView events={events} config={config} scale={scale} today={today} now={now} people={people} />,
      { wrapper: Wrapper },
    );
    const headers = Array.from(container.querySelectorAll('[role="rowheader"]')).map((el) => el.textContent ?? '');
    expect(headers[0]).toContain('Everyone');
    expect(headers[1]).toContain('Ella');
    expect(headers[2]).toContain('Owen');
    expect(headers[1]).toContain('1 this week');
    expect(headers[2]).toContain('0 this week');
    expect(container.querySelectorAll('[data-event-id]')).toHaveLength(2);
  });

  it('falls back to one row per source when no people are configured', () => {
    const events = [
      ev('a', 'Alpha thing', '2026-08-25T09:00:00', '2026-08-25T10:00:00', { sourceId: 'src-a', sourceName: 'Alpha' }),
      ev('b', 'Beta thing', '2026-08-26T09:00:00', '2026-08-26T10:00:00', { sourceId: 'src-b', sourceName: 'Beta' }),
    ];
    const { container } = render(
      <FamilyGridView events={events} config={config} scale={scale} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    const headers = Array.from(container.querySelectorAll('[role="rowheader"]')).map((el) => el.textContent ?? '');
    expect(headers.map((h) => h.replace(/\d+ this week/, '').trim())).toEqual(['AAlpha', 'BBeta']);
  });
});

describe('UpNextView', () => {
  const upNextConfig = { ...config, view: 'up-next' } as FullscreenCalendarConfig;

  it('makes the nearest upcoming event the hero with a countdown, lists later today, earlier, and tomorrow', () => {
    const events = [
      ev('done', 'Dentist', '2026-08-24T13:00:00', '2026-08-24T14:00:00'),
      ev('running', 'Piano lesson', '2026-08-24T15:30:00', '2026-08-24T16:30:00'),
      ev('next', 'Soccer practice', '2026-08-24T16:30:00', '2026-08-24T18:00:00', { location: 'Lakefront Park' }),
      ev('later', 'Family dinner', '2026-08-24T18:30:00', '2026-08-24T19:30:00'),
      ev('tmrw', 'Gym', '2026-08-25T06:00:00', '2026-08-25T07:00:00'),
      ev('cake', 'Trash night', '2026-08-24', '2026-08-25', { allDay: true }),
    ];
    const { container } = render(
      <UpNextView events={events} config={upNextConfig} scale={scale} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    const text = container.textContent ?? '';
    const hero = container.querySelector('[data-event-id="next"]');
    expect(hero?.textContent).toContain('Soccer practice');
    expect(hero?.textContent).toContain('in 50 minutes');
    expect(hero?.textContent).toContain('Lakefront Park');
    expect(text).toContain('Later today');
    expect(text).toContain('Family dinner');
    expect(text).toContain('Earlier today');
    expect(text).toContain('Piano lesson');
    expect(text).toContain('Dentist');
    expect(text).toContain('Tomorrow, Tuesday');
    expect(text).toContain('Gym');
    expect(text).toContain('Trash night');
  });

  it('shows the running event as NOW when nothing else is upcoming', () => {
    const events = [ev('running', 'Piano lesson', '2026-08-24T15:30:00', '2026-08-24T16:30:00')];
    const { container } = render(
      <UpNextView events={events} config={upNextConfig} scale={scale} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    expect(container.querySelector('[data-event-id="running"]')?.textContent).toContain('Now');
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it('says nothing else today when every event is over', () => {
    const events = [ev('done', 'Dentist', '2026-08-24T13:00:00', '2026-08-24T14:00:00')];
    const { container } = render(
      <UpNextView events={events} config={upNextConfig} scale={scale} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    expect(container.textContent).toContain('Nothing else today');
  });
});

describe('FreeTimeView', () => {
  const freeConfig = { ...config, view: 'free-time', freeTimeHourStart: 7, freeTimeHourEnd: 22 } as FullscreenCalendarConfig;

  it('builds a track per person, treats shared events as busy for all, and finds when everyone is free', () => {
    const events = [
      ev('soccer', 'Soccer', '2026-08-24T16:30:00', '2026-08-24T18:00:00', { sourceId: 'src-ella' }),
      ev('robotics', 'Robotics', '2026-08-24T16:00:00', '2026-08-24T17:30:00', { sourceId: 'src-owen' }),
      ev('dinner', 'Dinner', '2026-08-24T18:30:00', '2026-08-24T19:30:00', { sourceId: 'src-family' }),
    ];
    const { container } = render(
      <FreeTimeView events={events} config={freeConfig} scale={scale} today={today} now={now} people={people} />,
      { wrapper: Wrapper },
    );
    const text = container.textContent ?? '';
    // Dinner is drawn on both tracks (shared), each person's own event once.
    expect(container.querySelectorAll('[data-event-id="dinner"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-event-id="soccer"]')).toHaveLength(1);
    expect(text).toContain('Everyone is free');
    expect(text).toContain('7:30 PM – 10:00 PM today');
    expect(container.querySelectorAll('[data-free-gap]').length).toBeGreaterThan(0);
  });

  it('reports no shared time when someone is busy through the evening', () => {
    const events = [
      ev('shift', 'Work', '2026-08-24T15:00:00', '2026-08-24T22:00:00', { sourceId: 'src-ella' }),
    ];
    const { container } = render(
      <FreeTimeView events={events} config={{ ...freeConfig, freeTimeShowTomorrow: false }} scale={scale} today={today} now={now} people={people} />,
      { wrapper: Wrapper },
    );
    const text = container.textContent ?? '';
    expect(text).toContain('No shared free time');
    expect(text).not.toContain('Tomorrow');
  });
});
