// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen as dom, cleanup, act } from '@testing-library/react';
import type { Screen, GlobalSettings, ModuleInstance } from '@/types/config';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import { sharedStateStore } from '@/lib/shared-state-store';
import ScreenRenderer from '../ScreenRenderer';
import type { SharedDisplayData } from '@/lib/module-props';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import enUSModules from '@/translations/en-US/modules.json';

/**
 * End-to-end check of the shared-state → visibility pipeline through the real
 * ScreenRenderer: a publish must flip the module filter without any clock
 * tick, and the state must survive a screen swap (the rotation-staleness
 * regression the shared-state design exists to prevent).
 *
 * The gated module uses an unloaded plugin type so the render path goes
 * through PluginPlaceholder instead of a dynamic module import.
 */

const GATED_TYPE = 'plugin:test-widget' as const;
const KEY = 'plugin:test-widget:door';

function makeModule(overrides: Partial<ModuleInstance> & { id: string }): ModuleInstance {
  return {
    type: GATED_TYPE,
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 0,
    config: {},
    style: { ...DEFAULT_MODULE_STYLE },
    ...overrides,
  };
}

function makeScreen(id: string, modules: ModuleInstance[]): Screen {
  return { id, name: id, backgroundImage: '', modules };
}

const settings = {
  timezone: 'UTC',
  latitude: 0,
  longitude: 0,
  weather: { provider: 'weatherapi', latitude: 0, longitude: 0, units: 'imperial' },
} as unknown as GlobalSettings;

const sharedData: SharedDisplayData = {
  owmData: null, wapiData: null, pirateData: null, noaaData: null,
  openMeteoData: null, yrData: null, smhiData: null, metofficeData: null,
  envcanadaData: null, calendarData: null,
};

function renderScreen(screen: Screen) {
  return (
    <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
      <ScreenRenderer
        screen={screen}
        settings={settings}
        sharedData={sharedData}
        displayW={1080}
        displayH={1920}
        scale={1}
      />
    </I18nProvider>
  );
}

describe('ScreenRenderer shared-state reactivity', () => {
  beforeEach(() => {
    sharedStateStore.__resetForTests();
  });

  afterEach(() => {
    cleanup();
    __resetLoaderForTests();
  });

  const gated = makeModule({
    id: 'gated-icon',
    visibility: { conditions: [{ kind: 'state', sourceKey: KEY, equals: 'alert' }] },
  });
  const screenA = makeScreen('screen-a', [gated]);
  const screenB = makeScreen('screen-b', []);

  it('shows and hides the module reactively as state is published', () => {
    render(renderScreen(screenA));

    // Key unpublished → whenUnknown default hides the module
    expect(dom.queryByText(/test-widget/)).toBeNull();

    // Publish the matching value — no clock tick, the store push re-renders
    act(() => sharedStateStore.publish(KEY, 'alert'));
    expect(dom.getByText(/test-widget/)).toBeTruthy();

    // Publish a non-matching value — module hides again
    act(() => sharedStateStore.publish(KEY, 'closed'));
    expect(dom.queryByText(/test-widget/)).toBeNull();
  });

  it('keeps condition state correct across screen rotation (last-value replay)', () => {
    const { rerender } = render(renderScreen(screenA));
    act(() => sharedStateStore.publish(KEY, 'alert'));
    expect(dom.getByText(/test-widget/)).toBeTruthy();

    // Rotate away — the gated module unmounts with its screen
    rerender(renderScreen(screenB));
    expect(dom.queryByText(/test-widget/)).toBeNull();

    // State can change while the module's screen is off-screen
    act(() => sharedStateStore.publish(KEY, 'closed'));

    // Rotate back — the filter must reflect the CURRENT value, not the one
    // from when the screen was last mounted
    rerender(renderScreen(screenA));
    expect(dom.queryByText(/test-widget/)).toBeNull();

    act(() => sharedStateStore.publish(KEY, 'alert'));
    expect(dom.getByText(/test-widget/)).toBeTruthy();
  });

  it('excludes a backgroundProvider instance from on-screen rendering even when conditions pass', () => {
    const provider = makeModule({ id: 'bg-provider', backgroundProvider: true });
    render(renderScreen(makeScreen('screen-c', [provider])));
    expect(dom.queryByText(/test-widget/)).toBeNull();
  });

  it('keeps a conditioned module mounted through the tombstone grace window after a producer teardown', () => {
    // Simulates a plugin reload/producer restart: clearKeysByPrefix used to
    // delete the key instantly, unmounting every conditioned module until
    // the reloaded producer's first publish (several seconds of blink).
    vi.useFakeTimers();
    try {
      render(renderScreen(screenA));
      act(() => sharedStateStore.publish(KEY, 'alert'));
      expect(dom.getByText(/test-widget/)).toBeTruthy();

      // Producer teardown — key is tombstoned, module must stay visible
      act(() => sharedStateStore.clearKeysByPrefix('plugin:test-widget:'));
      expect(dom.getByText(/test-widget/)).toBeTruthy();

      // Restarted producer republishes within the window — no blink, and
      // the key is live again afterwards
      act(() => sharedStateStore.publish(KEY, 'alert'));
      act(() => vi.advanceTimersByTime(60_000));
      expect(dom.getByText(/test-widget/)).toBeTruthy();

      // A teardown with NO republish deletes the key after the TTL and the
      // module finally hides (whenUnknown default)
      act(() => sharedStateStore.clearKeysByPrefix('plugin:test-widget:'));
      expect(dom.getByText(/test-widget/)).toBeTruthy();
      act(() => vi.advanceTimersByTime(15_000));
      expect(dom.queryByText(/test-widget/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
