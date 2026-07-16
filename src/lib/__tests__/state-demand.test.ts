import { describe, it, expect } from 'vitest';
import type { ModuleInstance, Screen, VisibilityCondition } from '@/types/config';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import { collectDemandedKeys, demandByPlugin } from '../state-demand';

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

function stateCondition(sourceKey: string): VisibilityCondition {
  return { kind: 'state', sourceKey, equals: 'on' };
}

describe('collectDemandedKeys', () => {
  it('collects condition sourceKeys across all screens, including nested groups', () => {
    const screens = [
      makeScreen('a', [
        makeModule({ visibility: { conditions: [stateCondition('plugin:ha:door')] } }),
      ]),
      makeScreen('b', [
        makeModule({
          visibility: {
            conditions: [{
              kind: 'or',
              conditions: [
                stateCondition('plugin:ha:sun'),
                { kind: 'not', conditions: [{ kind: 'numeric', sourceKey: 'plugin:ha:temp', below: 20 }] },
              ],
            }],
          },
        }),
      ]),
    ];
    expect(collectDemandedKeys(screens)).toEqual(
      new Set(['plugin:ha:door', 'plugin:ha:sun', 'plugin:ha:temp']),
    );
  });

  it('collects Text-module tokens from config.content', () => {
    const screens = [
      makeScreen('a', [
        makeModule({
          type: 'text' as ModuleInstance['type'],
          config: { content: 'Kitchen {plugin:ha:sensor.kitchen} and {{time}} literal' },
        }),
      ]),
    ];
    expect(collectDemandedKeys(screens)).toEqual(new Set(['plugin:ha:sensor.kitchen']));
  });

  it('ignores non-text modules with token-shaped content and non-string content', () => {
    const screens = [
      makeScreen('a', [
        makeModule({ config: { content: '{plugin:ha:door}' } }), // type icon, not text
        makeModule({ type: 'text' as ModuleInstance['type'], config: { content: 42 } }),
      ]),
    ];
    expect(collectDemandedKeys(screens).size).toBe(0);
  });

  it('skips disabled modules — they never render, so their keys are not demand', () => {
    const screens = [
      makeScreen('a', [
        makeModule({
          enabled: false,
          visibility: { conditions: [stateCondition('plugin:ha:door')] },
        }),
        makeModule({
          enabled: false,
          type: 'text' as ModuleInstance['type'],
          config: { content: '{plugin:ha:temp}' },
        }),
      ]),
    ];
    expect(collectDemandedKeys(screens).size).toBe(0);
  });

  it('skips disabled screens — their conditions and text tokens are not demand', () => {
    const screen: Screen = {
      ...makeScreen('a', [
        makeModule({ visibility: { conditions: [stateCondition('plugin:ha:door')] } }),
        makeModule({
          type: 'text' as ModuleInstance['type'],
          config: { content: '{plugin:ha:temp}' },
        }),
      ]),
      enabled: false,
    };
    expect(collectDemandedKeys([screen]).size).toBe(0);
  });

  it('demands both keys when the same screen has enabled undefined', () => {
    const screen = makeScreen('a', [
      makeModule({ visibility: { conditions: [stateCondition('plugin:ha:door')] } }),
      makeModule({
        type: 'text' as ModuleInstance['type'],
        config: { content: '{plugin:ha:temp}' },
      }),
    ]);
    expect(collectDemandedKeys([screen])).toEqual(
      new Set(['plugin:ha:door', 'plugin:ha:temp']),
    );
  });

  it('demands both keys when the screen is explicitly enabled: true', () => {
    const screen: Screen = {
      ...makeScreen('a', [
        makeModule({ visibility: { conditions: [stateCondition('plugin:ha:door')] } }),
        makeModule({
          type: 'text' as ModuleInstance['type'],
          config: { content: '{plugin:ha:temp}' },
        }),
      ]),
      enabled: true,
    };
    expect(collectDemandedKeys([screen])).toEqual(
      new Set(['plugin:ha:door', 'plugin:ha:temp']),
    );
  });

  it('returns only the enabled screen keys when mixing enabled and disabled screens', () => {
    const enabledScreen = makeScreen('a', [
      makeModule({ visibility: { conditions: [stateCondition('plugin:ha:door')] } }),
    ]);
    const disabledScreen: Screen = {
      ...makeScreen('b', [
        makeModule({
          type: 'text' as ModuleInstance['type'],
          config: { content: '{plugin:ha:temp}' },
        }),
      ]),
      enabled: false,
    };
    expect(collectDemandedKeys([enabledScreen, disabledScreen])).toEqual(
      new Set(['plugin:ha:door']),
    );
  });

  it('drops the empty sourceKey a just-added condition legally holds', () => {
    const screens = [
      makeScreen('a', [
        makeModule({ visibility: { conditions: [stateCondition('')] } }),
      ]),
    ];
    expect(collectDemandedKeys(screens).size).toBe(0);
  });

  it('includes keys referenced by rule condition trees', () => {
    const rules = [
      { when: [stateCondition('plugin:ha:doorbell')] },
      { when: [{ kind: 'and' as const, conditions: [stateCondition('plugin:ha:motion')] }] },
    ];
    expect(collectDemandedKeys([], rules)).toEqual(
      new Set(['plugin:ha:doorbell', 'plugin:ha:motion']),
    );
  });
});

describe('demandByPlugin', () => {
  it('groups by plugin id and strips the plugin:<id>: prefix', () => {
    const demanded = new Set([
      'plugin:home-assistant:binary_sensor.back_door',
      'plugin:home-assistant:sun.sun',
      'plugin:garmin:steps',
    ]);
    const grouped = demandByPlugin(demanded, ['home-assistant', 'garmin']);
    expect(grouped.get('home-assistant')).toEqual(['binary_sensor.back_door', 'sun.sun']);
    expect(grouped.get('garmin')).toEqual(['steps']);
  });

  it('ignores native keys and keys of plugins that are not loaded', () => {
    const demanded = new Set([
      'weather.condition',
      'plugin:not-installed:foo',
      'plugin:ha:door',
    ]);
    const grouped = demandByPlugin(demanded, ['ha']);
    expect([...grouped.keys()]).toEqual(['ha']);
    expect(grouped.get('ha')).toEqual(['door']);
  });

  it('matches loaded plugin ids case-insensitively (canonical lowercase namespace)', () => {
    const grouped = demandByPlugin(new Set(['plugin:home-assistant:door']), ['Home-Assistant']);
    expect(grouped.get('home-assistant')).toEqual(['door']);
  });

  it('sorts each plugin group for stable memoization output', () => {
    const grouped = demandByPlugin(
      new Set(['plugin:ha:z', 'plugin:ha:a', 'plugin:ha:m']),
      ['ha'],
    );
    expect(grouped.get('ha')).toEqual(['a', 'm', 'z']);
  });

  it('keeps attribute-style keys (extra colons) intact after the prefix', () => {
    const grouped = demandByPlugin(
      new Set(['plugin:ha:sensor.phone:battery_level']),
      ['ha'],
    );
    expect(grouped.get('ha')).toEqual(['sensor.phone:battery_level']);
  });
});
