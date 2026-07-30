import { describe, it, expect } from 'vitest';
import { resolveChoreModuleConfig } from '@/lib/chore-module-config';
import type { DisplayNode, ModuleInstance, Screen, ScreenConfiguration } from '@/types/config';

function makeModule(type: string, config: Record<string, unknown> = {}): ModuleInstance {
  return { id: `m-${type}`, type, x: 0, y: 0, w: 4, h: 4, config } as unknown as ModuleInstance;
}

function makeScreen(id: string, modules: ModuleInstance[]): Screen {
  return { id, name: id, backgroundImage: '', modules };
}

function makeConfig(overrides: Partial<ScreenConfiguration> = {}): ScreenConfiguration {
  return {
    version: 4,
    settings: {},
    screens: [],
    ...overrides,
  } as unknown as ScreenConfiguration;
}

describe('resolveChoreModuleConfig', () => {
  it('returns null when no chore module exists anywhere', () => {
    const config = makeConfig({ screens: [makeScreen('s1', [makeModule('clock')])] });
    expect(resolveChoreModuleConfig(config)).toBeNull();
  });

  it('finds a chore-chart in the legacy global pool', () => {
    const config = makeConfig({
      screens: [makeScreen('s1', [makeModule('chore-chart', { accentColor: '#123456' })])],
    });
    expect(resolveChoreModuleConfig(config)?.accentColor).toBe('#123456');
  });

  it('finds a fullscreen-chore-chart too', () => {
    const config = makeConfig({
      screens: [makeScreen('s1', [makeModule('fullscreen-chore-chart', { showPoints: false })])],
    });
    expect(resolveChoreModuleConfig(config)?.showPoints).toBe(false);
  });

  // The bug: /chores showed kids an empty state while a chore chart was live on
  // the wall, because both phone surfaces read the frozen legacy config.screens
  // pool instead of the screens the displays actually own.
  it('finds a chore module that exists only on a non-inherited display', () => {
    const config = makeConfig({
      screens: [],
      displays: [
        { id: 'main', name: 'Main', screens: [makeScreen('s1', [makeModule('clock')])] } as DisplayNode,
        {
          id: 'kitchen',
          name: 'Kitchen',
          screens: [makeScreen('s2', [makeModule('chore-chart', { accentColor: '#abcdef' })])],
        } as DisplayNode,
      ],
    });

    const resolved = resolveChoreModuleConfig(config);
    expect(resolved).not.toBeNull();
    expect(resolved?.accentColor).toBe('#abcdef');
  });

  it('does not fall back to a stale global pool once displays own the screens', () => {
    // The chore chart was removed from every real display but still lingers in
    // the frozen pool. Kids should see the empty state, not ghost config.
    const config = makeConfig({
      screens: [makeScreen('ghost', [makeModule('chore-chart', { accentColor: '#ff0000' })])],
      displays: [
        { id: 'main', name: 'Main', screens: [makeScreen('s1', [makeModule('clock')])] } as DisplayNode,
      ],
    });
    expect(resolveChoreModuleConfig(config)).toBeNull();
  });

  it('applies documented defaults for absent fields', () => {
    const config = makeConfig({
      screens: [makeScreen('s1', [makeModule('chore-chart')])],
    });
    expect(resolveChoreModuleConfig(config)).toEqual({
      weekStartDay: 'monday',
      showPoints: true,
      showStreaks: true,
      showTimeOfDay: true,
      allowDisplayComplete: true,
      accentColor: '#f59e0b',
      view: 'board',
    });
  });

  it('always allows completion from a phone regardless of the module toggle', () => {
    const config = makeConfig({
      screens: [makeScreen('s1', [makeModule('chore-chart', { allowDisplayComplete: false })])],
    });
    expect(resolveChoreModuleConfig(config)?.allowDisplayComplete).toBe(true);
  });

  it('uses the first chore module found when several exist', () => {
    const config = makeConfig({
      screens: [
        makeScreen('s1', [makeModule('chore-chart', { accentColor: '#111111' })]),
        makeScreen('s2', [makeModule('chore-chart', { accentColor: '#222222' })]),
      ],
    });
    expect(resolveChoreModuleConfig(config)?.accentColor).toBe('#111111');
  });
});
