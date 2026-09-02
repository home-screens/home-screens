// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE, type WeatherConfig } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import WeatherModule from '../WeatherModule';
import type { HourlyWeather } from '@/lib/weather';

// jsdom has no ResizeObserver; the font-fit hook only needs it to exist.
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

/** Three fixed UTC hours, rendered in UTC so the assertion is machine-independent. */
const hourly: HourlyWeather[] = [
  { time: '2026-03-01T20:00:00Z', temp: 40, icon: '01d', description: 'Clear' },
  { time: '2026-03-01T21:00:00Z', temp: 39, icon: '01d', description: 'Clear' },
  { time: '2026-03-01T22:00:00Z', temp: 38, icon: '01d', description: 'Clear' },
];

const ui = (locale: string, props: Record<string, unknown>) => (
  <I18nProvider locale={locale} blob={{ modules: enUSModules }}>
    <WeatherModule
      config={{ view: 'hourly', hoursToShow: 3 } as WeatherConfig}
      style={{ ...DEFAULT_MODULE_STYLE }}
      hourly={hourly}
      forecast={[]}
      timezone="UTC"
      latitude={44.7}
      longitude={-93.4}
      {...props}
    />
  </I18nProvider>
);

afterEach(cleanup);

describe('weather hourly labels follow the household clock', () => {
  it('uses 12-hour labels by default', () => {
    render(ui('en-US', {}));
    expect(screen.getByText('9 PM')).toBeTruthy();
  });

  it('uses 24-hour labels when the household picked 24h', () => {
    render(ui('en-US', { timeFormat: '24h' }));
    expect(screen.getByText('21')).toBeTruthy();
    expect(screen.queryByText('9 PM')).toBeNull();
  });

  it('a German household on 24h gets 24-hour labels, not "9 PM"', () => {
    render(ui('de-DE', { timeFormat: '24h' }));
    expect(document.body.textContent).not.toMatch(/PM/);
  });
});
