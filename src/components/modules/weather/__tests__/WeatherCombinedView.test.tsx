// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import WeatherCombinedView from '../WeatherCombinedView';
import WeatherHourlyView from '../WeatherHourlyView';
import { renderView, stubBox, viewProps } from './view-test-helpers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T19:10:00Z'));
  stubBox(600, 600);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * The Combined view draws the same stats row as Current and Compact, so a chip
 * added there (UV, sunrise and sunset) shows here too instead of being
 * quietly missing, as the UV and sun chips were for a while.
 */
describe('WeatherCombinedView', () => {
  it('shows the UV and sun-time chips when their toggles are on', () => {
    renderView(<WeatherCombinedView {...viewProps({}, { view: 'combined', showUV: true, showSunTimes: true })} />);
    expect(screen.getByTestId('weather-stat-uv').textContent).toBe('UV 3');
    expect(screen.getByTestId('weather-stat-sunrise').textContent).toMatch(/7:3\d AM/);
    expect(screen.getByTestId('weather-stat-sunset').textContent).toMatch(/6:3\d PM/);
  });

  it('shows neither by default', () => {
    renderView(<WeatherCombinedView {...viewProps({}, { view: 'combined' })} />);
    expect(screen.queryByTestId('weather-stat-uv')).toBeNull();
    expect(screen.queryByTestId('weather-stat-sunrise')).toBeNull();
  });

  it('draws the current header and one hour column per upcoming hour, as the Hourly view does', () => {
    renderView(<WeatherCombinedView {...viewProps({}, { view: 'combined', hoursToShow: 6, daysToShow: 3 })} />);
    const header = screen.getByTestId('weather-current-header');
    expect(header.textContent).toContain('54°');
    expect(header.textContent).toContain('58°');
    expect(header.textContent).toContain('41°');
    expect(screen.getAllByTestId('weather-hour')).toHaveLength(5);
  });
});

describe('WeatherHourlyView', () => {
  it('draws the shared header and hour columns', () => {
    renderView(<WeatherHourlyView {...viewProps({}, { view: 'hourly', hoursToShow: 4 })} />);
    expect(screen.getByTestId('weather-current-header').textContent).toContain('54°');
    expect(screen.getAllByTestId('weather-hour')).toHaveLength(3);
  });
});
