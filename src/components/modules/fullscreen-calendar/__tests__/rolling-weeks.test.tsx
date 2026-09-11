// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { addDays, startOfDay } from 'date-fns';
import type { FullscreenCalendarConfig } from '@/types/config';
import { installResizeObserverStub, I18nWrapper as Wrapper, testScale } from '../../__tests__/helpers/harness';

installResizeObserverStub();

import { RollingWeeksView } from '../RollingWeeksView';
import { VIEW_TRAITS, rollingRangeTitle } from '../view-traits';
import type { CalendarEvent } from '../view-support';
import { clampRollingWeeks } from '@/lib/calendar-utils';

const scale = testScale({ isDark: false });

const config = {
  view: 'rolling', density: 'cozy', typographySize: 'medium', accentColor: '',
  dimPastEvents: false, shadeWeekends: true,
} as FullscreenCalendarConfig;

// Friday Sep 11 2026, 8:00 — Sat/Sun are cells 1 and 2.
const today = new Date(2026, 8, 11);
const now = new Date(2026, 8, 11, 8, 0);

const ev = (id: string, title: string, start: string, end: string): CalendarEvent =>
  ({ id, title, start, end, allDay: false });

afterEach(cleanup);

describe('RollingWeeksView', () => {
  it('renders 7 x weeks cells anchored at today, today’s column accented', () => {
    const { container, getByText } = render(
      <RollingWeeksView events={[ev('e1', 'Soccer', '2026-09-11T10:00:00', '2026-09-11T11:00:00')]}
        config={{ ...config, rollingWeeksToShow: 2 } as FullscreenCalendarConfig}
        scale={scale} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    const cells = container.querySelectorAll('[role="gridcell"]');
    expect(cells).toHaveLength(14);
    expect(cells[0].getAttribute('aria-label')).toContain('September 11');
    expect(getByText('Soccer')).toBeDefined();
    const headers = container.querySelectorAll('[role="columnheader"]');
    expect(headers).toHaveLength(7);
    expect(headers[0].getAttribute('style')).toContain('--cal-accent');
    expect(headers[1].getAttribute('style')).not.toContain('--cal-accent');
  });

  it('shades weekend cells from the date when shadeWeekends is on, and not when off', () => {
    const on = render(
      <RollingWeeksView events={[]} config={{ ...config, rollingWeeksToShow: 1 } as FullscreenCalendarConfig}
        scale={scale} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    const onCells = on.container.querySelectorAll('[role="gridcell"]');
    expect(onCells[1].getAttribute('style')).toContain('--cal-weekend-shade'); // Sat
    expect(onCells[2].getAttribute('style')).toContain('--cal-weekend-shade'); // Sun
    expect(onCells[3].getAttribute('style')).not.toContain('--cal-weekend-shade'); // Mon
    cleanup();

    const off = render(
      <RollingWeeksView events={[]} config={{ ...config, rollingWeeksToShow: 1, shadeWeekends: false } as FullscreenCalendarConfig}
        scale={scale} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    const offCells = off.container.querySelectorAll('[role="gridcell"]');
    expect(offCells[1].getAttribute('style')).not.toContain('--cal-weekend-shade');
  });

  it('marks the month start and keeps the default at 6 weeks', () => {
    const { container } = render(
      <RollingWeeksView events={[]} config={{ ...config, rollingWeeksToShow: 4 } as FullscreenCalendarConfig}
        scale={scale} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    const cells = container.querySelectorAll('[role="gridcell"]');
    expect(cells).toHaveLength(28);
    expect(cells[20].textContent).toContain('Oct'); // Oct 1

    cleanup();
    const base = render(
      <RollingWeeksView events={[]} config={config}
        scale={scale} today={today} now={now} />,
      { wrapper: Wrapper },
    );
    expect(base.container.querySelectorAll('[role="gridcell"]')).toHaveLength(42);
  });
});

describe('rolling traits', () => {
  it('titles the header with the drawn range and windows the legend to it', () => {
    const ctx = { today, t: (k: string) => k, locale: 'en-US', config: { ...config, rollingWeeksToShow: 6 }, scaleWidth: 800 };
    expect(VIEW_TRAITS.rolling.headerTitle(ctx)).toBe('September 11 – October 22, 2026');
    const win = VIEW_TRAITS.rolling.legendWindow({ ...ctx, weekStartsOn: 0 });
    expect(win.start).toEqual(startOfDay(today));
    expect(win.end).toEqual(addDays(startOfDay(today), 42));
    expect(rollingRangeTitle(today, 6, 'en-US')).toBe('September 11 – October 22, 2026');
    expect(clampRollingWeeks(undefined)).toBe(6);
  });
});
