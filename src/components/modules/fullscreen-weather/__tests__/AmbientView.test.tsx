// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import AmbientView from '../AmbientView';
import type { WeatherViewProps } from '../weather-view-utils';
import type { ForecastDay } from '@/lib/weather';

const day = (date: string): ForecastDay => ({ date, high: 70, low: 50, icon: 'sun', description: 'Sunny' });

function props(timezone: string): WeatherViewProps {
  return {
    config: {},
    timeFormat: '12h',
    scale: { s: 10, u: 10, orientation: 'portrait' },
    hourly: [{ time: '2026-08-24T00:00:00.000Z', temp: 60, icon: 'sun', description: 'Sunny' }],
    forecast: ['2026-08-24', '2026-08-25', '2026-08-26'].map(day),
    minutely: [],
    alerts: [],
    units: 'imperial',
    now: new Date('2026-08-24T00:00:00.000Z'),
    timezone,
    locationLabel: '',
    accent: '#fff',
    t: (key: string) => key,
    locale: 'en-US',
  } as unknown as WeatherViewProps;
}

describe('AmbientView day chips', () => {
  it('names each chip for its own calendar date, whatever the gap between the Pi and the household', () => {
    // 2026-08-25 is a Tuesday and 2026-08-26 a Wednesday everywhere. Local noon
    // on a UTC or US Pi is already the next day in Auckland, which used to
    // label Tuesday's chip "Wed".
    for (const tz of ['Pacific/Auckland', 'Pacific/Honolulu', 'UTC']) {
      const { getByTestId, unmount } = render(<AmbientView {...props(tz)} />);
      const chips = getByTestId('fsw-chips');
      expect(within(chips).getByText('Tue')).toBeTruthy();
      expect(within(chips).getByText('Wed')).toBeTruthy();
      expect(within(chips).queryByText('Thu')).toBeNull();
      unmount();
    }
  });
});
