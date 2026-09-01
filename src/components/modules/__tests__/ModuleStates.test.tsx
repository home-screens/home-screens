// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import { ModuleLoadingState, moduleGate } from '../ModuleStates';
import { ModuleSurfaceProvider } from '../module-surface';
import type { FetchError } from '@/lib/fetch-error';

const style = { ...DEFAULT_MODULE_STYLE };
const wrap = (node: React.ReactNode, surface: 'display' | 'editor' = 'display') => (
  <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
    <ModuleSurfaceProvider value={surface}>{node}</ModuleSurfaceProvider>
  </I18nProvider>
);

const KEY_MISSING: FetchError = {
  kind: 'setup',
  message: 'No OpenWeatherMap API key configured. Add it in Settings > Integrations.',
  setup: { needs: 'key', service: 'OpenWeatherMap' },
};

afterEach(cleanup);

describe('ModuleLoadingState failure copy', () => {
  it('renders the setup card for a setup error and never the route message', () => {
    render(wrap(<ModuleLoadingState style={style} message="Loading…" error={KEY_MISSING} />));
    expect(screen.getByTestId('module-setup-state')).toBeTruthy();
    expect(screen.getByText('No OpenWeatherMap key yet')).toBeTruthy();
    expect(screen.getByText('Finish setup in the editor')).toBeTruthy();
    expect(screen.queryByText(/Settings > Integrations/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/API key/);
  });

  it('links to the API keys page in the editor instead of the wall footer', () => {
    render(wrap(<ModuleLoadingState style={style} message="Loading…" error={KEY_MISSING} />, 'editor'));
    const link = screen.getByRole('link', { name: 'Open API keys' });
    expect(link.getAttribute('href')).toContain('integrations');
    expect(screen.queryByText('Finish setup in the editor')).toBeNull();
  });

  it('sends a weather provider key to the Weather page, not API keys', () => {
    render(wrap(<ModuleLoadingState style={style} message="" error={{ ...KEY_MISSING, setup: { needs: 'key', service: 'Pirate Weather', page: 'weather' } }} />, 'editor'));
    const link = screen.getByRole('link', { name: 'Open weather settings' });
    expect(link.getAttribute('href')).toContain('page=weather');
    expect(link.getAttribute('href')).not.toContain('integrations');
  });

  it('shows the developer detail under "not updating" only in the editor', () => {
    const err = { kind: 'transient' as const, message: 'API error 502: upstream down' };
    const { unmount } = render(wrap(<ModuleLoadingState style={style} message="" error={err} />, 'editor'));
    expect(screen.getByTestId('module-error-detail').textContent).toBe('API error 502: upstream down');
    unmount();
    render(wrap(<ModuleLoadingState style={style} message="" error={err} />));
    expect(screen.queryByTestId('module-error-detail')).toBeNull();
  });

  it('words a rejected key and an unconnected service differently', () => {
    const { unmount } = render(wrap(<ModuleLoadingState style={style} message="" error={{ ...KEY_MISSING, setup: { needs: 'invalidKey', service: 'WeatherAPI' } }} />));
    expect(screen.getByText("The WeatherAPI key isn't working")).toBeTruthy();
    unmount();
    render(wrap(<ModuleLoadingState style={style} message="" error={{ ...KEY_MISSING, setup: { needs: 'connection', service: 'Immich' } }} />));
    expect(screen.getByText("Immich isn't connected yet")).toBeTruthy();
  });

  it('renders a quiet not-updating line for a transient error, without the message', () => {
    render(wrap(<ModuleLoadingState style={style} message="Loading…" error={{ kind: 'transient', message: 'API error 500: upstream 502' }} />));
    expect(screen.getByTestId('module-not-updating').textContent).toBe('Not updating right now');
    expect(document.body.textContent).not.toMatch(/50[02]/);
  });

  it('still shows a plain string error (plugin contract) but not in red', () => {
    render(wrap(<ModuleLoadingState style={style} message="Loading…" error="Connect your Strava account in the editor" />));
    const p = screen.getByText('Connect your Strava account in the editor');
    expect(p.className).not.toMatch(/red/);
  });

  it('shows the loading skeleton with no error', () => {
    render(wrap(<ModuleLoadingState style={style} message="Loading traffic…" />));
    expect(screen.getByText('Loading traffic…')).toBeTruthy();
  });
});

describe('moduleGate', () => {
  it('routes a setup error through the loading state while data is null', () => {
    render(wrap(moduleGate({ style, data: null, error: KEY_MISSING, loadingMessage: 'Loading…' })));
    expect(screen.getByTestId('module-setup-state')).toBeTruthy();
  });

  it('keeps last-good data over a later transient error', () => {
    expect(moduleGate({ style, data: { ok: 1 }, error: { kind: 'transient', message: 'x' }, loadingMessage: 'Loading…' })).toBeNull();
  });
});
