import { describe, it, expect } from 'vitest';
import { buildRows, producerLabel, referenceLabel } from '../SharedStateSection';
import type { StateKeyReference } from '@/lib/state-demand';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import type { TranslateFn } from '@/i18n';
import type { LoadedPlugin } from '@/types/plugins';

/**
 * The inspector's pure helpers: row cross-referencing/ordering and the
 * producer/consumer labels. The E2E spec covers the rendered page against a
 * live hub; these pin the branches it can't reach cheaply (ordering across
 * all three statuses, plugin-name resolution, plugin-module fallbacks).
 */

/** Echo translator: key plus interpolations, so assertions see both. */
const t: TranslateFn = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}(${Object.values(params).join(',')})` : key) as TranslateFn;

const entry = (value: string): SharedStateEntry => ({ value, updatedAt: 1 });

const moduleRef = (moduleType: string, screenName = 'Home'): StateKeyReference => ({
  kind: 'module',
  screenId: 's1',
  screenName,
  moduleId: 'mod-1',
  moduleType,
});

describe('buildRows', () => {
  it('unions published and referenced keys with the right status per row', () => {
    const rows = buildRows(
      { 'plugin:ha:door': entry('on'), 'plugin:ha:orphan': entry('42') },
      new Map([
        ['plugin:ha:door', [moduleRef('text')]],
        ['plugin:ha:never', [moduleRef('text')]],
      ]),
    );

    expect(rows.map((r) => [r.key, r.status])).toEqual([
      ['plugin:ha:never', 'missing'],
      ['plugin:ha:door', 'active'],
      ['plugin:ha:orphan', 'unreferenced'],
    ]);
  });

  it('sorts missing before active before unreferenced, then alphabetically', () => {
    const rows = buildRows(
      { b: entry('1'), a: entry('1'), d: entry('1'), c: entry('1') },
      new Map<string, StateKeyReference[]>([
        ['z', [moduleRef('text')]],
        ['y', [moduleRef('text')]],
        ['a', [moduleRef('text')]],
        ['b', [moduleRef('text')]],
      ]),
    );

    expect(rows.map((r) => r.key)).toEqual(['y', 'z', 'a', 'b', 'c', 'd']);
  });
});

describe('producerLabel', () => {
  const plugins = new Map<string, LoadedPlugin>([
    ['ha', { manifest: { id: 'HA', name: 'Home Assistant' } } as LoadedPlugin],
  ]);

  it('resolves a loaded plugin to its manifest name (id matched lowercased)', () => {
    expect(producerLabel('plugin:ha:door', plugins, t)).toBe('Home Assistant');
  });

  it('falls back to the raw plugin id when the plugin is not loaded', () => {
    expect(producerLabel('plugin:garmin:steps', plugins, t)).toBe('garmin');
  });

  it('labels non-plugin keys as built-in', () => {
    expect(producerLabel('house:mode', plugins, t)).toBe(
      'settings.sharedStatePage.builtInProducer',
    );
  });
});

describe('referenceLabel', () => {
  it('labels a rule reference by rule name', () => {
    const ref: StateKeyReference = { kind: 'rule', ruleId: 'r1', ruleName: 'Doorbell' };
    expect(referenceLabel(ref, t)).toBe('settings.sharedStatePage.ruleRefLabel(Doorbell)');
  });

  it('labels a built-in module by its registry translation key plus screen name', () => {
    expect(referenceLabel(moduleRef('text'), t)).toBe('registry.types.text · Home');
  });

  it('falls back to the raw type for an unregistered plugin module', () => {
    expect(referenceLabel(moduleRef('plugin:ha:card', 'Kitchen'), t)).toBe(
      'plugin:ha:card · Kitchen',
    );
  });
});
