// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ScreenConfiguration, ModuleInstance } from '@/types/config';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { LoadedPlugin, PluginManifest } from '@/types/plugins';
import { I18nProvider } from '@/i18n/provider';
import { useEditorStore } from '@/stores/editor-store';
import { usePluginStore } from '@/stores/plugin-store';
import { registerPluginModule, unregisterModule } from '@/lib/module-registry';
import enUSEditor from '@/translations/en-US/editor.json';
import PropertyPanel from '../PropertyPanel';

const OBSOLETE_HINT = enUSEditor.propertyPanel.visibility.backgroundProviderObsoleteHint;

// The plugin module's raw type (namespaced to `plugin:bgtest` in the app).
const MODULE_TYPE = 'bgtest';
const NAMESPACED_TYPE = `plugin:${MODULE_TYPE}`;
const MODULE_ID = 'mod-bg-1';

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
      {children}
    </I18nProvider>
  );
}

/**
 * A manifest for the plugin module. `withStateProvider` toggles the
 * `exports.stateProvider` export (the flag PropertyPanel reads via
 * `loadedPlugin.manifest.exports?.stateProvider`). `providesState` makes the
 * registered module a state-producer type so `isStateProducerType` is true —
 * required for scenario (c) where there is no stateProvider export.
 */
function makeManifest(withStateProvider: boolean): PluginManifest {
  return {
    id: 'bgtest',
    name: 'BG Test',
    version: '1.0.0',
    description: '',
    author: 't',
    license: 'MIT',
    minAppVersion: '1.0.0',
    moduleType: MODULE_TYPE,
    category: 'Personal',
    icon: 'Star',
    defaultConfig: {},
    defaultSize: { w: 100, h: 100 },
    providesState: [{ key: 'door', label: 'Door' }],
    exports: {
      component: 'default',
      ...(withStateProvider ? { stateProvider: 'StateProvider' } : {}),
    },
  };
}

function seedStores(manifest: PluginManifest, moduleOverrides: Partial<ModuleInstance>): void {
  // Register the module in the registry so getModuleDefinition /
  // isStateProducerType resolve for the namespaced type. providesState in the
  // manifest gives it a non-empty producer key set.
  registerPluginModule(manifest);

  const entry: LoadedPlugin = {
    component: (() => null) as LoadedPlugin['component'],
    manifest,
  };
  usePluginStore.setState({ plugins: new Map([[NAMESPACED_TYPE, entry]]), pluginSettings: new Map() });

  const moduleInstance: ModuleInstance = {
    id: MODULE_ID,
    type: NAMESPACED_TYPE as ModuleInstance['type'],
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 0,
    config: {},
    style: { ...DEFAULT_MODULE_STYLE },
    ...moduleOverrides,
  };

  const config = {
    version: 1,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      latitude: 0,
      longitude: 0,
      weather: { provider: 'weatherapi', latitude: 0, longitude: 0, units: 'imperial' },
      calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7 },
    },
    screens: [{ id: 'screen-1', name: 'Screen 1', backgroundImage: '', modules: [moduleInstance] }],
  } as unknown as ScreenConfiguration;

  // Legacy single-display mode: selectedDisplayId null -> config.screens is the source.
  useEditorStore.setState({
    config,
    selectedDisplayId: null,
    selectedScreenId: 'screen-1',
    selectedModuleId: MODULE_ID,
  });
}

function toggleId() {
  return `#module-bg-provider-toggle-${MODULE_ID}`;
}

/** The bg-provider toggle lives inside the collapsed "Visibility" accordion; expand it. */
function openVisibility(container: HTMLElement): void {
  const header = within(container).getByText(enUSEditor.propertyPanel.sections.visibility);
  fireEvent.click(header);
}

beforeEach(() => {
  usePluginStore.setState({ plugins: new Map(), pluginSettings: new Map() });
});

afterEach(() => {
  cleanup();
  unregisterModule(NAMESPACED_TYPE as ModuleInstance['type']);
  usePluginStore.setState({ plugins: new Map(), pluginSettings: new Map() });
  useEditorStore.setState({ config: null, selectedDisplayId: null, selectedScreenId: null, selectedModuleId: null });
});

describe('PropertyPanel background-provider toggle', () => {
  it('(a) hides the toggle for a stateProvider plugin whose instance is not flagged', () => {
    seedStores(makeManifest(true), {}); // backgroundProvider unset
    const { container } = render(<PropertyPanel />, { wrapper: Wrapper });
    openVisibility(container);

    // The enabled toggle proves the Visibility section actually mounted —
    // only the bg-provider toggle is hidden by the stateProvider guard.
    expect(container.querySelector(`#module-enabled-toggle-${MODULE_ID}`)).not.toBeNull();
    expect(container.querySelector(toggleId())).toBeNull();
    expect(container.textContent).not.toContain(OBSOLETE_HINT);
  });

  it('(b) shows the toggle and the obsolete hint for a flagged stateProvider plugin instance', () => {
    seedStores(makeManifest(true), { backgroundProvider: true });
    const { container } = render(<PropertyPanel />, { wrapper: Wrapper });
    openVisibility(container);

    expect(container.querySelector(toggleId())).not.toBeNull();
    expect((container.querySelector(toggleId()) as HTMLInputElement).checked).toBe(true);
    expect(container.textContent).toContain(OBSOLETE_HINT);
  });

  it('(c) shows the toggle without the obsolete hint for a producer plugin lacking a stateProvider export', () => {
    seedStores(makeManifest(false), {}); // no stateProvider export; providesState makes it a producer type
    const { container } = render(<PropertyPanel />, { wrapper: Wrapper });
    openVisibility(container);

    expect(container.querySelector(toggleId())).not.toBeNull();
    expect(container.textContent).not.toContain(OBSOLETE_HINT);
  });
});
