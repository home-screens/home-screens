// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import Screensaver from '../Screensaver';

function renderClock(timeFormat?: '12h' | '24h') {
  return render(
    <I18nProvider locale="en-US" blob={{}}>
      <Screensaver mode="clock" timezone="America/Chicago" timeFormat={timeFormat} />
    </I18nProvider>,
  );
}

describe('Screensaver clock', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // 10:15 PM in Chicago.
  const NIGHT = new Date('2026-09-23T03:15:00Z');

  it('follows a 24-hour household', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NIGHT);
    const { container } = renderClock('24h');
    expect(container.textContent).toBe('22:15');
  });

  it('stays on the 12-hour clock when nobody has chosen', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NIGHT);
    const { container } = renderClock();
    expect(container.textContent?.replace(/\s/g, ' ')).toBe('10:15 PM');
  });

  function clockBox(container: HTMLElement): HTMLElement {
    const el = container.querySelector<HTMLElement>('div[style*="left"]');
    if (!el) throw new Error('no clock');
    return el;
  }
  const spotOf = (el: HTMLElement) => `${el.style.left} ${el.style.top}`;

  it('holds still inside a minute and moves with the time when the minute changes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T03:15:40Z'));
    const { container } = renderClock('24h');
    const clock = clockBox(container);
    const first = spotOf(clock);
    // A glide would restyle the page every frame; the clock never animates.
    expect(clock.style.transition).toBe('');

    act(() => { vi.advanceTimersByTime(19_000); });
    expect(clock.textContent).toBe('22:15');
    expect(spotOf(clock)).toBe(first);

    act(() => { vi.advanceTimersByTime(1_010); });
    expect(clock.textContent).toBe('22:16');
    expect(spotOf(clock)).not.toBe(first);
  });

  it('keeps wandering inside the screen edges, one step a minute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T03:15:30Z'));
    const { container } = renderClock('24h');
    const clock = clockBox(container);
    const seen = new Set<string>();
    for (let minute = 0; minute < 120; minute++) {
      const before = spotOf(clock);
      act(() => { vi.advanceTimersByTime(60_000); });
      expect(spotOf(clock)).not.toBe(before);
      const x = parseFloat(clock.style.left);
      const y = parseFloat(clock.style.top);
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(90);
      expect(y).toBeGreaterThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(90);
      seen.add(spotOf(clock));
    }
    // Two hours visit many places, not a short back-and-forth.
    expect(seen.size).toBeGreaterThan(40);
  });
});
