// @vitest-environment jsdom

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import { eventBus, type WeatherCondition } from '@/lib/event-bus';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import GreetingModule from '../GreetingModule';

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => vi.stubGlobal('ResizeObserver', NoopResizeObserver));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** What the greeting reads at `instant` in Chicago with `condition` outside. */
function greetingAt(instant: string, condition: WeatherCondition): string {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(instant));
  eventBus.publish('weather.conditions', { condition, temp: 60, units: 'imperial', icon: '', summary: '' });
  const { container } = render(
    <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
      <GreetingModule config={{ name: 'Taylor' }} style={{ ...DEFAULT_MODULE_STYLE }} timezone="America/Chicago" />
    </I18nProvider>,
  );
  return container.textContent ?? '';
}

describe('greeting weather line', () => {
  it('talks about the day ahead in the morning', () => {
    expect(greetingAt('2026-09-24T14:00:00Z', 'clear')).toBe('Good morning, TaylorBeautiful day ahead');
  });

  it('talks about the evening in the evening', () => {
    expect(greetingAt('2026-09-24T23:30:00Z', 'rain')).toBe('Good evening, TaylorRainy evening ahead');
  });

  it('does not promise a beautiful day at midnight or 3 AM', () => {
    // 11:59 PM and 3 AM in Chicago.
    expect(greetingAt('2026-09-25T04:59:00Z', 'clear')).toBe('Good night, TaylorClear skies tonight');
    expect(greetingAt('2026-09-25T08:00:00Z', 'clear')).toBe('Good night, TaylorClear skies tonight');
    expect(greetingAt('2026-09-25T08:00:00Z', 'snow')).toBe('Good night, TaylorSnow tonight');
  });
});
