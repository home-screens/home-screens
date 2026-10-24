// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import { I18nProvider } from '@/i18n/provider';
import { usePreviewWeatherStore } from '@/stores/preview-weather-store';
import { ForecastDaysHint } from '../ForecastDaysHint';

/**
 * The line under a days field reads the preview's real forecast length and
 * says where the source stops. These cases pin the three states and the
 * one-click fix.
 */
function render(props: Partial<Parameters<typeof ForecastDaysHint>[0]> = {}) {
  const onPickOpenMeteo = vi.fn();
  const utils = renderUI(
    <ForecastDaysHint
      provider="weatherapi"
      requested={7}
      followsHousehold={false}
      onPickOpenMeteo={onPickOpenMeteo}
      {...props}
    />,
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <I18nProvider locale="en-US" blob={{ core, editor }}>{children}</I18nProvider>
      ),
    },
  );
  return { ...utils, onPickOpenMeteo };
}

describe('ForecastDaysHint', () => {
  beforeEach(() => {
    usePreviewWeatherStore.setState({ forecastDays: {} });
  });

  afterEach(() => {
    cleanup();
  });

  it('says nothing until the preview has answered for that source', () => {
    usePreviewWeatherStore.setState({ forecastDays: { 'open-meteo': 7 } });
    render({ provider: 'weatherapi' });

    expect(screen.queryByTestId('forecast-days-hint')).toBeNull();
    expect(screen.queryByTestId('forecast-days-capped')).toBeNull();
  });

  it('reads as a plain caption while the ask fits what the source sends', () => {
    usePreviewWeatherStore.setState({ forecastDays: { openweathermap: 6 } });
    render({ provider: 'openweathermap', requested: 5 });

    expect(screen.getByTestId('forecast-days-hint').textContent).toBe('OpenWeatherMap sends 6 days.');
    expect(screen.queryByTestId('forecast-days-capped')).toBeNull();
  });

  it('warns when the ask is bigger than the answer, with the free-plan sentence for WeatherAPI', () => {
    usePreviewWeatherStore.setState({ forecastDays: { weatherapi: 3 } });
    render({ provider: 'weatherapi', requested: 7 });

    const box = screen.getByTestId('forecast-days-capped');
    expect(box.textContent).toContain('WeatherAPI.com only sends 3 days, so the list stops there.');
    expect(box.textContent).toContain('A free WeatherAPI key sends 3 days. Paid plans send more.');
  });

  it('keeps the free-plan sentence to WeatherAPI', () => {
    usePreviewWeatherStore.setState({ forecastDays: { openweathermap: 6 } });
    render({ provider: 'openweathermap', requested: 7 });

    const box = screen.getByTestId('forecast-days-capped');
    expect(box.textContent).toContain('OpenWeatherMap only sends 6 days');
    expect(box.textContent).not.toContain('free WeatherAPI key');
  });

  it('offers Open-Meteo in one click and points at the module', () => {
    usePreviewWeatherStore.setState({ forecastDays: { weatherapi: 3 } });
    const { onPickOpenMeteo } = render({ provider: 'weatherapi', requested: 7 });

    fireEvent.click(screen.getByRole('button', { name: 'Use Open-Meteo for this module' }));
    expect(onPickOpenMeteo).toHaveBeenCalledTimes(1);
  });

  it('links to Settings only while the module follows the household source', () => {
    usePreviewWeatherStore.setState({ forecastDays: { weatherapi: 3 } });
    const { unmount } = render({ provider: 'weatherapi', requested: 7, followsHousehold: true });
    expect(screen.getByRole('link', { name: 'Or change the weather source in Settings' }).getAttribute('href')).toContain('weather');
    unmount();

    render({ provider: 'weatherapi', requested: 7, followsHousehold: false });
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('ForecastDaysHint for hours', () => {
  beforeEach(() => {
    usePreviewWeatherStore.setState({ forecastDays: {}, forecastHours: {} });
  });

  afterEach(() => {
    cleanup();
  });

  it('reads the hour count the source sent, not the day count', () => {
    usePreviewWeatherStore.setState({ forecastDays: { pirateweather: 7 }, forecastHours: { pirateweather: 48 } });
    render({ provider: 'pirateweather', requested: 48, unit: 'hours' });

    expect(screen.getByTestId('forecast-hours-hint').textContent).toBe('Pirate Weather sends 48 hours.');
    expect(screen.queryByTestId('forecast-hours-capped')).toBeNull();
  });

  it('warns when the ask passes the hours the source sends, without the free-key note', () => {
    usePreviewWeatherStore.setState({ forecastDays: { weatherapi: 3 }, forecastHours: { weatherapi: 40 } });
    render({ provider: 'weatherapi', requested: 48, unit: 'hours' });

    const capped = screen.getByTestId('forecast-hours-capped');
    expect(capped.textContent).toContain('WeatherAPI.com only sends 40 hours, so the chart stops there.');
    expect(capped.textContent).not.toContain('free WeatherAPI key');
  });
});
