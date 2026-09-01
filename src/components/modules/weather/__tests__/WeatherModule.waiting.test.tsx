// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE, type WeatherConfig } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import WeatherModule from '../WeatherModule';
import type { FetchError } from '@/lib/fetch-error';

// jsdom has no ResizeObserver; the font-fit hook only needs it to exist.
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

const config = { view: 'hourly' } as WeatherConfig;
const ui = (props: Record<string, unknown>) => (
  <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
    <WeatherModule config={config} style={{ ...DEFAULT_MODULE_STYLE }} latitude={44.7} longitude={-93.4} {...props} />
  </I18nProvider>
);

const KEY_MISSING: FetchError = { kind: 'setup', message: 'x', setup: { needs: 'key', service: 'Pirate Weather' } };

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('WeatherModule before the first payload', () => {
  it('says it is getting the forecast, not "No weather data"', () => {
    render(ui({}));
    expect(screen.getByText('Getting the forecast…')).toBeTruthy();
    expect(screen.queryByText('No weather data')).toBeNull();
  });

  it('renders the setup card for a missing provider key', () => {
    render(ui({ weatherError: KEY_MISSING }));
    expect(screen.getByTestId('module-setup-state')).toBeTruthy();
    expect(screen.getByText('No Pirate Weather key yet')).toBeTruthy();
  });

  it('admits the weather is not updating on a transient failure', () => {
    render(ui({ weatherError: { kind: 'transient', message: 'API error 502' } }));
    expect(screen.getByText('Weather is not updating')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/502/);
  });

  it('stops promising after 20 seconds with no payload and no error', () => {
    vi.useFakeTimers();
    render(ui({}));
    expect(screen.getByText('Getting the forecast…')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(screen.getByText('Weather is not updating')).toBeTruthy();
  });

  it('still shows the genuine empty state once a provider answers with nothing', () => {
    render(ui({ hourly: [], forecast: [] }));
    expect(screen.getByText('No weather data')).toBeTruthy();
  });
});
