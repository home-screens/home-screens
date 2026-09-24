// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE, type WeatherConfig } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import WeatherModule from '../WeatherModule';
import type { ForecastDay } from '@/lib/weather';

// jsdom has no ResizeObserver; the font-fit hook only needs it to exist.
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

// Fetched on the evening of Sep 24, still on the wall after Chicago's midnight.
const forecast: ForecastDay[] = [
  { date: '2026-09-24', high: 71, low: 52, icon: '01d', description: 'Clear' },
  { date: '2026-09-25', high: 64, low: 48, icon: '10d', description: 'Rain' },
  { date: '2026-09-26', high: 66, low: 47, icon: '02d', description: 'Clouds' },
];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('weather after the household midnight, before the next refresh', () => {
  it('features today, not yesterday, on a UTC kiosk in Chicago', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T05:05:00Z')); // 00:05 Sep 25 in Chicago
    const { container } = render(
      <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
        <WeatherModule
          config={{ view: 'daily', daysToShow: 3, showFeaturedDay: true } as WeatherConfig}
          style={{ ...DEFAULT_MODULE_STYLE }}
          hourly={[]}
          forecast={forecast}
          timezone="America/Chicago"
          latitude={44.7}
          longitude={-93.4}
        />
      </I18nProvider>,
    );

    const featured = container.querySelector('[data-weather-featured-day]');
    expect(featured?.textContent).toContain('64°');
    expect(container.textContent).not.toContain('71°');
    expect(container.querySelector('[data-weather-day="2026-09-24"]')).toBeNull();
    expect(container.querySelector('[data-weather-day="2026-09-26"]')).not.toBeNull();
  });
});
