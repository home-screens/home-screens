// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import WeatherSunView from '../WeatherSunView';
import { renderView, stubBox, viewProps } from './view-test-helpers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T19:10:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WeatherSunView', () => {
  it('shows the day length, the sun times and the moon phase side by side in a wide box', () => {
    stubBox(640, 360);
    const { container } = renderView(<WeatherSunView {...viewProps()} />);
    expect(container.querySelector('[data-weather-sun-mode]')?.getAttribute('data-weather-sun-mode')).toBe('side');
    expect(screen.getByText('of daylight today')).toBeTruthy();
    expect(screen.getByText(/7:3\d AM/)).toBeTruthy();
    expect(screen.getByText(/6:3\d PM/)).toBeTruthy();
    // 2026-10-15 is a few days after the new moon of October 10.
    expect(screen.getByText('Waxing Crescent')).toBeTruthy();
    expect(screen.getByText(/\d+% lit/)).toBeTruthy();
  });

  it('says how far off the full moon is in a box wide enough for the caption', () => {
    stubBox(640, 360);
    renderView(<WeatherSunView {...viewProps()} />);
    expect(screen.getByTestId('weather-full-moon').textContent).toMatch(/^Full moon in \d+ days$/);
  });

  it('keeps the arc and drops the moon in a small box, and the headline in a short one', () => {
    stubBox(260, 260);
    const small = renderView(<WeatherSunView {...viewProps()} />);
    expect(small.queryByTestId('weather-moon-card')).toBeNull();
    expect(small.getByText('of daylight today')).toBeTruthy();
    small.unmount();
    stubBox(480, 140);
    const short = renderView(<WeatherSunView {...viewProps()} />);
    expect(short.queryByText('of daylight today')).toBeNull();
    expect(short.getByTestId('weather-moon-card')).toBeTruthy();
  });

  it('takes the sun off the arc after sunset', () => {
    stubBox(640, 360);
    const day = renderView(<WeatherSunView {...viewProps()} />);
    expect(day.container.querySelectorAll('[data-testid="weather-sun-card"] circle')).toHaveLength(2);
    day.unmount();
    vi.setSystemTime(new Date('2026-10-16T02:00:00Z')); // 9 PM in Chicago
    const night = renderView(<WeatherSunView {...viewProps()} />);
    expect(night.container.querySelectorAll('[data-testid="weather-sun-card"] circle')).toHaveLength(0);
  });

  it('stacks in a tall box', () => {
    stubBox(420, 600);
    const { container } = renderView(<WeatherSunView {...viewProps()} />);
    expect(container.querySelector('[data-weather-sun-mode]')?.getAttribute('data-weather-sun-mode')).toBe('stacked');
  });

  it('asks for a location when there are no coordinates', () => {
    stubBox(640, 360);
    renderView(<WeatherSunView {...viewProps({ latitude: undefined, longitude: undefined })} />);
    expect(screen.getByText('Location not set')).toBeTruthy();
  });
});

describe('WeatherSunView stacked floor', () => {
  it('keeps the sun card at the height its content needs when stacked, so the moon overflows instead of the times', () => {
    stubBox(500, 500);
    const stacked = renderView(<WeatherSunView {...viewProps()} />);
    expect(stacked.getByTestId('weather-sun-card').style.minHeight).toBe('7em');
    stacked.unmount();
    // A short stacked box has no headline, and the floor drops with it.
    stubBox(120, 150);
    const short = renderView(<WeatherSunView {...viewProps()} />);
    expect(short.queryByText('of daylight today')).toBeNull();
    expect(short.getByTestId('weather-sun-card').style.minHeight).toBe('4em');
    short.unmount();
    // Side by side the cards share the width, not the height.
    stubBox(640, 360);
    const side = renderView(<WeatherSunView {...viewProps()} />);
    expect(side.getByTestId('weather-sun-card').style.minHeight).toBe('');
  });
});
