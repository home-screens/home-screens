// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import WeatherNarrativeView from '../WeatherNarrativeView';
import { WEEK, renderView, stubBox, viewProps } from './view-test-helpers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T19:10:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOAA = WEEK.map((d, i) => ({ ...d, detailedForecast: `Narrative ${i}: ${d.description} with a high near ${d.high}.` }));

describe('WeatherNarrativeView', () => {
  it('shows the written forecast per day, bounded by daysToShow', () => {
    stubBox(640, 360);
    const { container } = renderView(<WeatherNarrativeView {...viewProps({ forecast: NOAA }, { daysToShow: 3 })} />);
    expect(container.querySelectorAll('[data-weather-day]')).toHaveLength(3);
    expect(screen.getAllByTestId('weather-narrative-text')).toHaveLength(3);
    expect(screen.getByText(/Narrative 0: Partly cloudy with a high near 58\./)).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('H:58° L:41°')).toBeTruthy();
  });

  it('falls back to the condition with rain and wind when the provider writes nothing', () => {
    stubBox(640, 360);
    renderView(<WeatherNarrativeView {...viewProps({}, { daysToShow: 2 })} />);
    expect(screen.queryByTestId('weather-narrative-text')).toBeNull();
    expect(screen.getByText('Partly cloudy')).toBeTruthy();
    expect(screen.getByText('10%')).toBeTruthy();
    expect(screen.getByText('9 mph')).toBeTruthy();
  });

  it('hides the high and low when the toggle is off', () => {
    stubBox(640, 360);
    renderView(<WeatherNarrativeView {...viewProps({ forecast: NOAA }, { showHighLow: false })} />);
    expect(screen.queryByText(/H:58°/)).toBeNull();
  });
});

describe('WeatherNarrativeView in a wide strip', () => {
  it('stands the days side by side when the box is much wider than tall', () => {
    stubBox(1040, 160);
    const { container } = renderView(<WeatherNarrativeView {...viewProps({ forecast: NOAA }, { daysToShow: 5 })} />);
    const root = container.querySelector('[data-weather-narrative-mode]')!;
    expect(root.getAttribute('data-weather-narrative-mode')).toBe('columns');
    const list = container.querySelector('[data-weather-day]')!.parentElement as HTMLElement;
    expect(list.style.gridTemplateColumns).toBe('repeat(5, minmax(0, 1fr))');
    expect(container.querySelectorAll('[data-weather-day]')).toHaveLength(5);
    expect(screen.getAllByTestId('weather-narrative-text')).toHaveLength(5);
  });

  it('keeps the list in a box of ordinary shape, and for a single day', () => {
    stubBox(640, 360);
    const wide = renderView(<WeatherNarrativeView {...viewProps({ forecast: NOAA })} />);
    expect(wide.container.querySelector('[data-weather-narrative-mode]')!.getAttribute('data-weather-narrative-mode')).toBe('rows');
    wide.unmount();
    stubBox(1040, 160);
    const one = renderView(<WeatherNarrativeView {...viewProps({ forecast: NOAA }, { daysToShow: 1 })} />);
    expect(one.container.querySelector('[data-weather-narrative-mode]')!.getAttribute('data-weather-narrative-mode')).toBe('rows');
  });
});
