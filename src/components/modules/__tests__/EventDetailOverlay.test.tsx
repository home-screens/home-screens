// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { CalendarEvent } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import enUSCore from '@/translations/en-US/core.json';
import { getThemeTokens } from '@/lib/fullscreen-themes';
import { useInteractionHeld } from '@/lib/interaction-hold';
import {
  EventDetailOverlay,
  describeEventTime,
  EVENT_DETAIL_AUTO_DISMISS_MS,
} from '../shared/EventDetailOverlay';

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en-US" blob={{ modules: enUSModules, core: enUSCore }}>
      {children}
    </I18nProvider>
  );
}

// Frozen clock: Wednesday 2026-08-05, 2:00 PM local.
const NOW = new Date('2026-08-05T14:00:00');
const LABELS = { allDay: 'All Day', today: 'Today', happeningNow: 'Happening now' };

function timedEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'ev-1',
    title: 'Soccer Practice',
    start: '2026-08-05T17:00:00',
    end: '2026-08-05T19:00:00',
    allDay: false,
    location: 'Ryan Park',
    description: 'Bring shin guards.',
    sourceName: 'Family',
    calendarColor: '#10b981',
    ...overrides,
  };
}

describe('describeEventTime', () => {
  it('timed future event: time range plus relative distance', () => {
    const out = describeEventTime(timedEvent(), NOW, 'en-US', LABELS);
    expect(out.main).toBe('5:00 PM – 7:00 PM');
    expect(out.sub).toBe('in 3 hours');
  });

  it('timed ongoing event: happening-now label', () => {
    const out = describeEventTime(
      timedEvent({ start: '2026-08-05T13:00:00', end: '2026-08-05T15:00:00' }),
      NOW, 'en-US', LABELS,
    );
    expect(out.sub).toBe('Happening now');
  });

  it('timed past event: no sub-line', () => {
    const out = describeEventTime(
      timedEvent({ start: '2026-08-05T09:00:00', end: '2026-08-05T10:00:00' }),
      NOW, 'en-US', LABELS,
    );
    expect(out.main).toBe('9:00 AM – 10:00 AM');
    expect(out.sub).toBe('');
  });

  it("all-day today: 'Today', not happening-now", () => {
    const out = describeEventTime(
      timedEvent({ allDay: true, start: '2026-08-05', end: '2026-08-06' }),
      NOW, 'en-US', LABELS,
    );
    expect(out.main).toBe('All Day');
    expect(out.sub).toBe('Today');
  });

  it('all-day two days out compares midnights, not elapsed hours', () => {
    // Regression: Friday seen from Wednesday 2 PM is ~34h away, which
    // Intl rounds to "tomorrow" — the calendar-day answer is "in 2 days".
    const out = describeEventTime(
      timedEvent({ allDay: true, start: '2026-08-07', end: '2026-08-08' }),
      NOW, 'en-US', LABELS,
    );
    expect(out.sub).toBe('in 2 days');
  });

  it('all-day tomorrow says tomorrow', () => {
    const out = describeEventTime(
      timedEvent({ allDay: true, start: '2026-08-06', end: '2026-08-07' }),
      NOW, 'en-US', LABELS,
    );
    expect(out.sub).toBe('tomorrow');
  });

  it('multi-day all-day event appends the inclusive date range', () => {
    // Exclusive end Aug 10 means the event's last day is Aug 9.
    const out = describeEventTime(
      timedEvent({ allDay: true, start: '2026-08-07', end: '2026-08-10' }),
      NOW, 'en-US', LABELS,
    );
    expect(out.main).toBe('All Day · Aug 7 – Aug 9');
  });
});

// ─── Component behavior ───

const theme = getThemeTokens('linen');

function overlayElement(onClose: () => void) {
  return (
    <EventDetailOverlay
      event={timedEvent()}
      variant="sheet"
      theme={theme}
      accentColor="#10b981"
      now={NOW}
      onClose={onClose}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('EventDetailOverlay', () => {
  it('renders the event fields inside a labeled dialog', () => {
    render(overlayElement(() => {}), { wrapper: Wrapper });
    const dialog = screen.getByRole('dialog', { name: 'Soccer Practice' });
    expect(dialog.textContent).toContain('5:00 PM – 7:00 PM');
    expect(dialog.textContent).toContain('Ryan Park');
    expect(dialog.textContent).toContain('Bring shin guards.');
    expect(dialog.textContent).toContain('Family');
    expect(dialog.textContent).toContain('Close');
  });

  it('scrim tap closes; taps inside the panel do not', () => {
    const onClose = vi.fn();
    render(overlayElement(onClose), { wrapper: Wrapper });

    // The panel body stops propagation — load-bearing against the scrim's
    // dismiss-on-click since the dialog root IS the scrim.
    fireEvent.click(screen.getByText('Soccer Practice'));
    fireEvent.click(screen.getByText('Ryan Park'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Close button closes', () => {
    const onClose = vi.fn();
    render(overlayElement(onClose), { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after 45 seconds', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(overlayElement(onClose), { wrapper: Wrapper });

    act(() => {
      vi.advanceTimersByTime(EVENT_DETAIL_AUTO_DISMISS_MS - 1);
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses on time even when the parent re-renders (clock ticks)', () => {
    // The parent passes an inline onClose whose identity changes every render
    // and re-renders each minute; the countdown must not restart.
    vi.useFakeTimers();
    let closed = 0;
    const { rerender } = render(overlayElement(() => { closed += 1; }), { wrapper: Wrapper });

    for (let tick = 0; tick < 45; tick += 15) {
      rerender(overlayElement(() => { closed += 1; }));
      act(() => {
        vi.advanceTimersByTime(15_000);
      });
    }
    expect(closed).toBe(1);
  });

  it('holds screen rotation while mounted and releases on unmount', () => {
    function HoldProbe() {
      const held = useInteractionHeld();
      return <span data-testid="hold-probe">{held ? 'held' : 'free'}</span>;
    }
    const { unmount } = render(
      <>
        {overlayElement(() => {})}
      </>,
      { wrapper: Wrapper },
    );
    const probe = render(<HoldProbe />);
    expect(probe.getByTestId('hold-probe').textContent).toBe('held');

    unmount();
    expect(probe.getByTestId('hold-probe').textContent).toBe('free');
  });
});
