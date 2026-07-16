// @vitest-environment jsdom

/**
 * Tests for the demand-driven provider layer: one headless mount per plugin
 * exporting `stateProvider`, fed exactly the unprefixed keys this display's
 * conditions and Text tokens reference — with referentially stable props so
 * unrelated config churn never restarts a provider's fetch effects.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ComponentType } from 'react';
import type { Screen, ModuleInstance } from '@/types/config';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { LoadedPlugin, PluginManifest, StateProviderProps } from '@/types/plugins';
import { usePluginStore } from '@/stores/plugin-store';
import PluginServiceLayer from '../PluginServiceLayer';

let nextId = 0;
function makeModule(overrides: Partial<ModuleInstance>): ModuleInstance {
  return {
    id: `mod-${nextId++}`,
    type: 'icon' as ModuleInstance['type'],
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

function conditionedModule(sourceKey: string): ModuleInstance {
  return makeModule({
    visibility: { conditions: [{ kind: 'state', sourceKey, equals: 'on' }] },
  });
}

function makeManifest(id: string, withProvider: boolean): PluginManifest {
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
    exports: { component: 'default', ...(withProvider ? { stateProvider: 'StateProvider' } : {}) },
  };
}

/** Probe provider that records every render's props for identity assertions. */
function makeProbe(calls: StateProviderProps[]): ComponentType<StateProviderProps> {
  return function Probe(props: StateProviderProps) {
    calls.push(props);
    return <div data-testid={`provider-probe`} data-keys={props.demandedKeys.join(',')} />;
  };
}

const Noop = () => null;

function registerPlugin(
  id: string,
  opts: { provider?: ComponentType<StateProviderProps>; settings?: Record<string, unknown> } = {},
): void {
  const entry: LoadedPlugin = {
    component: Noop as ComponentType<Record<string, unknown>>,
    manifest: makeManifest(id, Boolean(opts.provider)),
    stateProvider: opts.provider,
  };
  usePluginStore.setState((state) => ({
    plugins: new Map(state.plugins).set(`plugin:${id}`, entry),
    pluginSettings: opts.settings
      ? new Map(state.pluginSettings).set(id.toLowerCase(), opts.settings)
      : state.pluginSettings,
  }));
}

beforeEach(() => {
  usePluginStore.setState({ plugins: new Map(), pluginSettings: new Map() });
});

afterEach(() => {
  cleanup();
});

describe('PluginServiceLayer', () => {
  it('renders nothing when no loaded plugin exports a stateProvider', () => {
    registerPlugin('ha');
    const { container } = render(
      <PluginServiceLayer screens={[makeScreen('a', [conditionedModule('plugin:ha:door')])]} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('mounts one provider per stateProvider plugin with its own unprefixed sorted keys', () => {
    const haCalls: StateProviderProps[] = [];
    const garminCalls: StateProviderProps[] = [];
    registerPlugin('ha', { provider: makeProbe(haCalls) });
    registerPlugin('garmin', { provider: makeProbe(garminCalls) });

    render(
      <PluginServiceLayer
        screens={[
          makeScreen('a', [
            conditionedModule('plugin:ha:sun.sun'),
            conditionedModule('plugin:ha:binary_sensor.door'),
            conditionedModule('plugin:garmin:steps'),
            conditionedModule('weather.condition'), // native — no plugin owns it
          ]),
        ]}
      />,
    );

    expect(haCalls.at(-1)?.demandedKeys).toEqual(['binary_sensor.door', 'sun.sun']);
    expect(garminCalls.at(-1)?.demandedKeys).toEqual(['steps']);
  });

  it('collects Text-module tokens into the demand set', () => {
    const calls: StateProviderProps[] = [];
    registerPlugin('ha', { provider: makeProbe(calls) });
    render(
      <PluginServiceLayer
        screens={[
          makeScreen('a', [
            makeModule({
              type: 'text' as ModuleInstance['type'],
              config: { content: 'Temp {plugin:ha:sensor.temp}' },
            }),
          ]),
        ]}
      />,
    );
    expect(calls.at(-1)?.demandedKeys).toEqual(['sensor.temp']);
  });

  it('mounts a provider with an empty demand set when nothing references its keys', () => {
    const calls: StateProviderProps[] = [];
    registerPlugin('ha', { provider: makeProbe(calls) });
    render(<PluginServiceLayer screens={[makeScreen('a', [])]} />);
    expect(calls.at(-1)?.demandedKeys).toEqual([]);
  });

  it('keeps demandedKeys referentially stable across an unrelated screens change', () => {
    const calls: StateProviderProps[] = [];
    registerPlugin('ha', { provider: makeProbe(calls) });

    const buildScreens = () => [makeScreen('a', [conditionedModule('plugin:ha:door')])];
    const { rerender } = render(<PluginServiceLayer screens={buildScreens()} />);
    const before = calls.at(-1)!.demandedKeys;

    // New array + module identities (what a config poll produces), same demand.
    rerender(<PluginServiceLayer screens={buildScreens()} />);
    const after = calls.at(-1)!.demandedKeys;

    expect(after).toBe(before);
  });

  it('shrinks demandedKeys when the last reference to a key is removed', () => {
    const calls: StateProviderProps[] = [];
    registerPlugin('ha', { provider: makeProbe(calls) });

    const { rerender } = render(
      <PluginServiceLayer
        screens={[
          makeScreen('a', [
            conditionedModule('plugin:ha:door'),
            conditionedModule('plugin:ha:window'),
          ]),
        ]}
      />,
    );
    expect(calls.at(-1)?.demandedKeys).toEqual(['door', 'window']);

    // New screens array that drops the only `plugin:ha:window` reference.
    rerender(
      <PluginServiceLayer
        screens={[makeScreen('a', [conditionedModule('plugin:ha:door')])]}
      />,
    );
    expect(calls.at(-1)?.demandedKeys).toEqual(['door']);
    expect(calls.at(-1)?.demandedKeys).not.toContain('window');
  });

  it('passes the plugin settings map entry through, defaulting to an empty object', () => {
    const haCalls: StateProviderProps[] = [];
    const garminCalls: StateProviderProps[] = [];
    registerPlugin('ha', { provider: makeProbe(haCalls), settings: { haUrl: 'http://ha.local' } });
    registerPlugin('garmin', { provider: makeProbe(garminCalls) });

    render(<PluginServiceLayer screens={[]} />);

    expect(haCalls.at(-1)?.settings).toEqual({ haUrl: 'http://ha.local' });
    expect(garminCalls.at(-1)?.settings).toEqual({});
  });

  it('hides the layer from assistive tech and layout', () => {
    registerPlugin('ha', { provider: makeProbe([]) });
    const { container } = render(<PluginServiceLayer screens={[]} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
    expect(wrapper.style.width).toBe('0px');
    expect(wrapper.style.height).toBe('0px');
  });
});
