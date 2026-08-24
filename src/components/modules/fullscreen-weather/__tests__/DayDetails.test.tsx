// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DayDetails } from '../weather-parts';
import { DAILY_RAIN_SHOWN_PCT, type WeatherViewProps } from '../weather-view-utils';
import type { ForecastDay } from '@/lib/weather';

const props = (units: 'metric' | 'imperial' = 'imperial'): WeatherViewProps => ({
  scale: { s: 10, u: 10 }, units, t: (key: string) => key,
} as unknown as WeatherViewProps);

const day = (over: Partial<ForecastDay>): ForecastDay =>
  ({ date: '2026-08-24', high: 80, low: 60, icon: 'sun', description: 'Sunny', ...over });

describe('DayDetails', () => {
  it('shows the rain chance from the threshold up and hides it below', () => {
    const shown = render(<DayDetails p={props()} day={day({ precipProbability: DAILY_RAIN_SHOWN_PCT })} />);
    expect(shown.container.textContent).toContain(`${DAILY_RAIN_SHOWN_PCT}%`);
    const hidden = render(<DayDetails p={props()} day={day({ precipProbability: DAILY_RAIN_SHOWN_PCT - 1 })} />);
    expect(hidden.container.textContent).not.toContain('%');
  });

  it('shows wind only when the provider gives a daily figure, in the household unit', () => {
    const none = render(<DayDetails p={props()} day={day({})} />);
    expect(none.container.textContent).toBe('');
    const mph = render(<DayDetails p={props()} day={day({ windSpeed: 12.4 })} />);
    expect(mph.container.textContent).toContain('12 mph');
    const kmh = render(<DayDetails p={props('metric')} day={day({ windSpeed: 20 })} />);
    expect(kmh.container.textContent).toContain('20 km/h');
  });
});
