import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ComponentType } from 'react';
import type { PluginManifest } from '@/types/plugins';

/**
 * Tests for the `getModuleComponent` resolver, which routes both built-in
 * and plugin module types to their React components. The resolver is the
 * single point of indirection the display renderer uses, so a bug here
 * would paint a blank slot for the module (silent failure, hard to
 * diagnose on a kiosk).
 *
 * We dynamic-import the module under test so every suite gets a fresh
 * plugin-store (otherwise register calls from earlier tests would leak
 * into later ones).
 */

let getModuleComponent: typeof import('@/lib/module-components').getModuleComponent;
let usePluginStore: typeof import('@/stores/plugin-store').usePluginStore;

beforeEach(async () => {
  vi.resetModules();
  const mcMod = await import('@/lib/module-components');
  const psMod = await import('@/stores/plugin-store');
  getModuleComponent = mcMod.getModuleComponent;
  usePluginStore = psMod.usePluginStore;
});

function makeManifest(moduleType: string): PluginManifest {
  return {
    id: `test-${moduleType}`,
    name: `Test ${moduleType}`,
    version: '1.0.0',
    description: '',
    author: 'test',
    license: 'MIT',
    minAppVersion: '1.0.0',
    moduleType,
    category: 'Custom',
    icon: 'Star',
    defaultConfig: {},
    defaultSize: { w: 200, h: 200 },
    exports: { component: 'default' },
  };
}

describe('getModuleComponent', () => {
  it('returns a component for a built-in module type (clock)', () => {
    // We cannot assert on the exact component identity because Next.js
    // `dynamic(...)` wraps the real component in a LoadableComponent
    // proxy — what matters is that the resolver returns something for
    // every registered built-in (not undefined).
    expect(getModuleComponent('clock')).toBeTruthy();
  });

  it('returns a component for every built-in type in the registry (spot check)', () => {
    // A smattering spanning every category so a missing dynamic import in
    // the hardcoded map surfaces immediately.
    const samples = [
      'clock', 'calendar', 'weather', 'countdown', 'dad-joke',
      'text', 'image', 'stock-ticker', 'news',
      'fullscreen-calendar', 'fullscreen-chore-chart',
      'display-control',
    ] as const;
    for (const t of samples) {
      expect(getModuleComponent(t), `component missing for ${t}`).toBeTruthy();
    }
  });

  it('returns undefined for an unknown, non-plugin module type', () => {
    // Type-punning a bogus string past the ModuleType union so we exercise
    // the real fallthrough path the display renderer would hit if a
    // config referenced a deleted module.
    expect(getModuleComponent('no-such-module' as never)).toBeUndefined();
  });

  it('returns undefined for a plugin type that has not been registered', () => {
    // Even the correct namespace prefix should not conjure a component
    // out of thin air — the plugin must actually be loaded.
    expect(getModuleComponent('plugin:unknown' as never)).toBeUndefined();
  });

  it('resolves a plugin component once the plugin store has registered it', () => {
    const FakeComponent = (() => null) as unknown as ComponentType<Record<string, unknown>>;
    usePluginStore.getState().registerPlugin(
      'plugin:test-widget',
      FakeComponent,
      makeManifest('test-widget'),
    );
    expect(getModuleComponent('plugin:test-widget' as never)).toBe(FakeComponent);
  });

  it('stops resolving a plugin after it is unregistered', () => {
    const FakeComponent = (() => null) as unknown as ComponentType<Record<string, unknown>>;
    usePluginStore.getState().registerPlugin(
      'plugin:test-widget',
      FakeComponent,
      makeManifest('test-widget'),
    );
    expect(getModuleComponent('plugin:test-widget' as never)).toBe(FakeComponent);

    usePluginStore.getState().unregisterPlugin('plugin:test-widget');
    expect(getModuleComponent('plugin:test-widget' as never)).toBeUndefined();
  });

  it('never checks the plugin store for a type that does not start with "plugin:"', () => {
    // Guard rail: a plugin accidentally registered under a non-namespaced
    // key (e.g. "weather") must not be able to shadow the built-in
    // weather module. The resolver short-circuits on the built-in branch
    // for any non-"plugin:"-prefixed type.
    const FakeComponent = (() => null) as unknown as ComponentType<Record<string, unknown>>;
    usePluginStore.getState().registerPlugin(
      'weather',
      FakeComponent,
      makeManifest('weather'),
    );
    // Should still return the built-in dynamic component, NOT the fake.
    const resolved = getModuleComponent('weather');
    expect(resolved).not.toBe(FakeComponent);
    expect(resolved).toBeTruthy();
  });
});
