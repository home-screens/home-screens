// @vitest-environment jsdom

/**
 * Tests for the editor-mounted provider layer: providers run against the
 * DRAFT config in the editor store (demand exists before save), follow the
 * selected display, and render nothing until the config loads.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { ComponentType } from 'react';
import type { ModuleInstance, Screen, ScreenConfiguration } from '@/types/config';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { LoadedPlugin, PluginManifest, StateProviderProps } from '@/types/plugins';
import { usePluginStore } from '@/stores/plugin-store';
import { useEditorStore } from '@/stores/editor-store';
import EditorStateProviderLayer from '../EditorStateProviderLayer';

let nextId = 0;
function conditionedModule(sourceKey: string): ModuleInstance {
  return {
    id: `mod-${nextId++}`,
    type: 'icon' as ModuleInstance['type'],
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 0,
    config: {},
    style: { ...DEFAULT_MODULE_STYLE },
    visibility: { conditions: [{ kind: 'state', sourceKey, equals: 'on' }] },
  };
}

function makeScreen(id: string, modules: ModuleInstance[]): Screen {
  return { id, name: id, backgroundImage: '', modules };
}

function makeConfig(overrides: Partial<ScreenConfiguration>): ScreenConfiguration {
  return { screens: [], ...overrides } as ScreenConfiguration;
}

function makeManifest(id: string): PluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: '',
    author: 't',
    license: 'MIT',
    minAppVersion: '1.0.0',
    moduleType: id,
    category: 'Personal',
    icon: 'Star',
    defaultConfig: {},
    defaultSize: { w: 100, h: 100 },
    exports: { component: 'default', stateProvider: 'StateProvider' },
  };
}

const Noop = () => null;

function registerProviderPlugin(id: string): StateProviderProps[] {
  const calls: StateProviderProps[] = [];
  function Probe(props: StateProviderProps) {
    calls.push(props);
    return null;
  }
  const entry: LoadedPlugin = {
    component: Noop as ComponentType<Record<string, unknown>>,
    manifest: makeManifest(id),
    stateProvider: Probe,
  };
  usePluginStore.setState((state) => ({
    plugins: new Map(state.plugins).set(`plugin:${id}`, entry),
  }));
  return calls;
}

beforeEach(() => {
  usePluginStore.setState({ plugins: new Map(), pluginSettings: new Map() });
});

afterEach(() => {
  cleanup();
  usePluginStore.setState({ plugins: new Map(), pluginSettings: new Map() });
  useEditorStore.setState({ config: null, selectedDisplayId: null });
});

describe('EditorStateProviderLayer', () => {
  it('renders nothing before the config loads', () => {
    const calls = registerProviderPlugin('ha');
    useEditorStore.setState({ config: null, selectedDisplayId: null });
    const { container } = render(<EditorStateProviderLayer />);
    expect(container.innerHTML).toBe('');
    expect(calls).toHaveLength(0);
  });

  it('feeds providers the demand from the draft config (legacy single-display mode)', () => {
    const calls = registerProviderPlugin('ha');
    useEditorStore.setState({
      config: makeConfig({
        screens: [makeScreen('s1', [conditionedModule('plugin:ha:light.tv')])],
      }),
      selectedDisplayId: null,
    });
    render(<EditorStateProviderLayer />);
    expect(calls.at(-1)?.demandedKeys).toEqual(['light.tv']);
  });

  it("scopes demand to the selected display's screens and rules", () => {
    const calls = registerProviderPlugin('ha');
    useEditorStore.setState({
      config: makeConfig({
        screens: [makeScreen('global', [conditionedModule('plugin:ha:global.key')])],
        displays: [
          {
            id: 'kitchen',
            name: 'Kitchen',
            screens: [makeScreen('k1', [conditionedModule('plugin:ha:light.kitchen')])],
            rules: [
              {
                id: 'r1',
                name: 'wake on door',
                when: [{ kind: 'state', sourceKey: 'plugin:ha:door.front', equals: 'on' }],
                action: { kind: 'wake' },
              },
            ],
          },
        ],
      } as Partial<ScreenConfiguration>),
      selectedDisplayId: 'kitchen',
    });
    render(<EditorStateProviderLayer />);
    // Selected display's module + rule keys, not the global pool's.
    expect(calls.at(-1)?.demandedKeys).toEqual(['door.front', 'light.kitchen']);
  });

  it('re-demands when a condition is edited in the store (pre-save)', () => {
    const calls = registerProviderPlugin('ha');
    useEditorStore.setState({
      config: makeConfig({
        screens: [makeScreen('s1', [conditionedModule('plugin:ha:light.tv')])],
      }),
      selectedDisplayId: null,
    });
    render(<EditorStateProviderLayer />);
    expect(calls.at(-1)?.demandedKeys).toEqual(['light.tv']);

    act(() => {
      useEditorStore.setState({
        config: makeConfig({
          screens: [makeScreen('s1', [conditionedModule('plugin:ha:sensor.temp')])],
        }),
      });
    });
    expect(calls.at(-1)?.demandedKeys).toEqual(['sensor.temp']);
  });
});
