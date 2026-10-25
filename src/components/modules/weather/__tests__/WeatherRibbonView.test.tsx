// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import WeatherRibbonView, { hourTickEvery, ribbonFontSize } from '../WeatherRibbonView';
import { renderView, stubBox, viewProps } from './view-test-helpers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T19:10:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WeatherRibbonView', () => {
  it('draws the run with its warmest and coldest hour labelled and the sunset and sunrise marked', () => {
    stubBox(640, 360);
    renderView(<WeatherRibbonView {...viewProps({}, { hoursToShow: 24 })} />);
    expect(screen.getByText('Next 24 hours')).toBeTruthy();
    // The current reading sits in the title row.
    expect(screen.getByText('54°')).toBeTruthy();
    const callouts = screen.getAllByTestId('weather-ribbon-callout').map((el) => el.textContent);
    expect(callouts).toContain('61°');
    expect(callouts).toContain('41°');
    // 2 PM to 2 PM across a Prior Lake night: one sunset, one sunrise.
    expect(screen.getAllByTestId('weather-ribbon-sunset')).toHaveLength(1);
    expect(screen.getAllByTestId('weather-ribbon-sunrise')).toHaveLength(1);
  });

  it('draws no day and night marks without coordinates', () => {
    stubBox(640, 360);
    renderView(<WeatherRibbonView {...viewProps({ latitude: undefined, longitude: undefined }, { hoursToShow: 24 })} />);
    expect(screen.queryByTestId('weather-ribbon-sunset')).toBeNull();
    expect(screen.getAllByTestId('weather-ribbon-callout').length).toBeGreaterThan(0);
  });

  it('shows the empty state with fewer than two hours', () => {
    stubBox(640, 360);
    renderView(<WeatherRibbonView {...viewProps({ hourly: [] })} />);
    expect(screen.getByText('No weather data')).toBeTruthy();
  });
});

describe('WeatherRibbonView in a narrow column', () => {
  it('caps the type by the width and thins the hour labels to what the width seats', () => {
    // A side column: the module's size from the height would be 80 px.
    stubBox(360, 1000);
    const { container } = renderView(<WeatherRibbonView {...viewProps({ scaledFontSize: 80 }, { hoursToShow: 8 })} />);
    const root = container.firstElementChild as HTMLElement;
    expect(parseFloat(root.style.fontSize)).toBeCloseTo(30);
    const axis = Array.from(container.querySelectorAll('svg text')).filter((el) => !el.hasAttribute('data-testid'));
    expect(axis.length).toBeGreaterThan(1);
    expect(axis.length).toBeLessThan(8);
    // The low's callout is anchored inward from the right edge rather than centred past it.
    const low = screen.getAllByTestId('weather-ribbon-callout').find((el) => el.textContent === '47°')!;
    expect(low.getAttribute('text-anchor')).toBe('end');
  });

  it('leaves a wide box at the module size with a label every hour', () => {
    stubBox(1000, 300);
    const { container } = renderView(<WeatherRibbonView {...viewProps({ scaledFontSize: 24 }, { hoursToShow: 8 })} />);
    expect(parseFloat((container.firstElementChild as HTMLElement).style.fontSize)).toBe(24);
    const axis = Array.from(container.querySelectorAll('svg text')).filter((el) => !el.hasAttribute('data-testid'));
    expect(axis).toHaveLength(8);
  });

  it('thins labels by the room between them', () => {
    // Eight hours 40 px apart with 21 px labels: every other one.
    expect(hourTickEvery(8, 40, 21, 3)).toBe(2);
    // Plenty of room: every hour; a day of hours: about eight across.
    expect(hourTickEvery(8, 200, 21, 3)).toBe(1);
    expect(hourTickEvery(24, 200, 21, 3)).toBe(3);
  });

  it('caps the chart type at a twelfth of the width', () => {
    expect(ribbonFontSize(80, 360)).toBe(30);
    expect(ribbonFontSize(24, 1000)).toBe(24);
    expect(ribbonFontSize(24, 0)).toBe(24);
  });
});
