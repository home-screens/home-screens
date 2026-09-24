// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSCore from '@/translations/en-US/core.json';
import enUSModules from '@/translations/en-US/modules.json';
import enUSWeather from '@/translations/en-US/weather.json';
import type { ForecastDay } from '@/lib/weather';
import type { WeatherConfig } from '@/types/config';
import WeatherDailyView from '../WeatherDailyView';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

const forecast: ForecastDay[] = [
  { date: '2026-03-15', high: 78, low: 61, icon: 'clear-day', description: 'Sunny' },
  { date: '2026-03-16', high: 80, low: 63, icon: 'partly-cloudy-day', description: 'Partly cloudy' },
  { date: '2026-03-17', high: 82, low: 64, icon: 'cloudy', description: 'Cloudy' },
];

function renderDaily(overrides: Partial<WeatherConfig> = {}, timezone?: string) {
  const config = {
    view: 'daily',
    iconSet: 'outline',
    daysToShow: 3,
    showHighLow: true,
    showPrecipitation: false,
    showTitle: false,
    ...overrides,
  } as WeatherConfig;

  return render(
    <I18nProvider locale="en-US" blob={{ core: enUSCore, modules: enUSModules, weather: enUSWeather }}>
      <WeatherDailyView config={config} hourly={[]} forecast={forecast} units="imperial" timezone={timezone} scaledFontSize={16} timeFormat="12h" />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WeatherDailyView day presentation', () => {
  it('keeps the first day in the regular forecast row when the featured day is hidden', () => {
    const { container } = renderDaily({ showFeaturedDay: false } as Partial<WeatherConfig>);

    expect(screen.getByText('78°')).toBeTruthy();
    expect(screen.getByText('78°').style.fontSize).toBe('');
    expect(container.querySelector('.w-px')).toBeNull();
  });

  it('uses weekday labels for today and tomorrow when relative labels are disabled', () => {
    renderDaily({ showRelativeDayLabels: false } as Partial<WeatherConfig>);

    expect(screen.getByText('Sun')).toBeTruthy();
    expect(screen.getByText('Mon')).toBeTruthy();
    expect(screen.queryByText('Today')).toBeNull();
    expect(screen.queryByText('Tmrw')).toBeNull();
  });

  // "Today" is the household's day, not the machine's. Run under TZ=UTC and
  // TZ=America/Chicago: each case puts the household on a different calendar
  // day from at least one of them.
  const labelOf = (date: string) => document.querySelector(`[data-weather-day="${date}"] span`)?.textContent;

  it('keeps today on the household day in a Chicago evening, when UTC is already tomorrow', () => {
    vi.setSystemTime(new Date('2026-03-16T01:00:00Z')); // 8 pm Sunday in Chicago
    renderDaily({ showFeaturedDay: false } as Partial<WeatherConfig>, 'America/Chicago');

    expect(labelOf('2026-03-15')).toBe('Today');
    expect(labelOf('2026-03-16')).toBe('Tmrw');
    expect(labelOf('2026-03-17')).toBe('Tue');
  });

  it('moves to the new day just after midnight in Berlin, while UTC and Chicago are still on yesterday', () => {
    vi.setSystemTime(new Date('2026-03-14T23:30:00Z')); // 00:30 Sunday in Berlin
    renderDaily({ showFeaturedDay: false } as Partial<WeatherConfig>, 'Europe/Berlin');

    expect(labelOf('2026-03-15')).toBe('Today');
    expect(labelOf('2026-03-16')).toBe('Tmrw');
  });

  it('flips the labels at the household midnight without new forecast data', () => {
    vi.setSystemTime(new Date('2026-03-16T04:58:00Z')); // 11:58 pm Sunday in Chicago
    renderDaily({ showFeaturedDay: false } as Partial<WeatherConfig>, 'America/Chicago');
    expect(labelOf('2026-03-15')).toBe('Today');

    act(() => { vi.advanceTimersByTime(3 * 60_000); });

    expect(labelOf('2026-03-15')).toBe('Sun');
    expect(labelOf('2026-03-16')).toBe('Today');
    expect(labelOf('2026-03-17')).toBe('Tmrw');
  });
});
