// @vitest-environment jsdom

/**
 * Tests for the host-settings push installed by `<PluginGlobalsEditor>`:
 * the editor must push the same dimensions the display's ScreenRotator
 * pushes on the wall, so a plugin's size-tier logic can never disagree
 * between the editor preview and the wall. Parity is by construction —
 * the per-display path resolves settings through `filterConfigForDisplay`
 * (the same function useLiveConfig feeds ScreenRotator) and the legacy
 * path uses the raw globals, matching the legacy /display route.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import { sharedStateStore } from '@/lib/shared-state-store';
import PluginGlobals from '@/components/PluginGlobals';
import PluginGlobalsEditor from '@/components/PluginGlobalsEditor';
import { useEditorStore } from '@/stores/editor-store';
import { getHostSettings } from '@/lib/plugin-host-settings';
import type { ScreenConfiguration } from '@/types/config';

function makeConfig(overrides?: Partial<ScreenConfiguration>): ScreenConfiguration {
  return {
    version: 1,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      displayTransform: '90',
      latitude: 0,
      longitude: 0,
      weather: { provider: 'weatherapi', latitude: 0, longitude: 0, units: 'imperial' },
      calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], daysAhead: 7 },
    },
    screens: [{ id: 'screen-1', name: 'Screen 1', backgroundImage: '', modules: [] }],
    ...overrides,
  };
}

async function mountSdk(): Promise<void> {
  await act(async () => {
    render(
      <I18nProvider locale="en-US" blob={{}}>
        <PluginGlobals />
        <PluginGlobalsEditor />
      </I18nProvider>,
    );
  });
}

describe('PluginGlobalsEditor host settings dimensions', () => {
  beforeEach(() => {
    __resetLoaderForTests();
    sharedStateStore.__resetForTests();
    useEditorStore.setState({ config: null, selectedDisplayId: null });
  });

  afterEach(() => {
    cleanup();
    delete window.__HS_SDK__;
    useEditorStore.setState({ config: null, selectedDisplayId: null });
  });

  it('pushes the selected display dimensions, orientation-normalized, not the raw globals', async () => {
    // Landscape TV: transform "normal" sorts the long edge onto width, so
    // even the raw pair being typed portrait-first must come out 2560×1440.
    useEditorStore.setState({
      config: makeConfig({
        displays: [
          {
            id: 'living-room',
            name: 'Living Room',
            screens: [],
            displayWidth: 1440,
            displayHeight: 2560,
            displayTransform: 'normal',
          },
        ],
      }),
      selectedDisplayId: 'living-room',
    });
    await mountSdk();

    const host = getHostSettings();
    expect(host.displayWidth).toBe(2560);
    expect(host.displayHeight).toBe(1440);
  });

  it('re-pushes when the selected display changes', async () => {
    const config = makeConfig({
      displays: [
        {
          id: 'kitchen',
          name: 'Kitchen',
          screens: [],
          displayWidth: 800,
          displayHeight: 1280,
          displayTransform: '90',
        },
      ],
    });
    useEditorStore.setState({ config, selectedDisplayId: null });
    await mountSdk();

    // Global pool selected: falls back to global settings (portrait via '90').
    expect(getHostSettings().displayWidth).toBe(1080);
    expect(getHostSettings().displayHeight).toBe(1920);

    await act(async () => {
      useEditorStore.setState({ selectedDisplayId: 'kitchen' });
    });

    expect(getHostSettings().displayWidth).toBe(800);
    expect(getHostSettings().displayHeight).toBe(1280);
  });

  it('legacy mode pushes the raw global pair, exactly like the legacy wall path', async () => {
    // The legacy /display route hands ScreenRotator unfiltered
    // config.settings, so the wall pushes {1080,1920} here even though the
    // 'normal' transform label contradicts the portrait-ordered pair. The
    // editor must match the wall, not "correct" the orientation.
    const config = makeConfig();
    config.settings.displayTransform = 'normal';
    useEditorStore.setState({ config, selectedDisplayId: null });
    await mountSdk();

    expect(getHostSettings().displayWidth).toBe(1080);
    expect(getHostSettings().displayHeight).toBe(1920);
  });

  it('honors dimension overrides living in display.settings, like filterConfigForDisplay', async () => {
    // DisplayNodeSettings also carries displayWidth/Height/Transform; the
    // wall merges them via `...(display.settings ?? {})`. Only reachable by
    // hand-edited config today, but the wall honors it, so the editor must.
    useEditorStore.setState({
      config: makeConfig({
        displays: [
          {
            id: 'tv',
            name: 'TV',
            screens: [],
            settings: { displayWidth: 2560, displayHeight: 1440, displayTransform: 'normal' },
          },
        ],
      }),
      selectedDisplayId: 'tv',
    });
    await mountSdk();

    expect(getHostSettings().displayWidth).toBe(2560);
    expect(getHostSettings().displayHeight).toBe(1440);
  });

  it('coerces a falsy global dimension to the default, like the wall does', async () => {
    // ScreenRotator uses `settings.displayHeight || DEFAULT`, so a zero in a
    // hand-edited config becomes 1920 on the wall. `??` would leak the 0.
    const config = makeConfig({
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [], displayWidth: 800 }],
    });
    config.settings.displayHeight = 0;
    useEditorStore.setState({ config, selectedDisplayId: 'kitchen' });
    await mountSdk();

    expect(getHostSettings().displayWidth).toBe(800);
    expect(getHostSettings().displayHeight).toBe(1920);
  });
});
