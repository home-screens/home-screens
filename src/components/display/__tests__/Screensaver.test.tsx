// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
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
});
