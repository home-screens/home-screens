import { describe, it, expect } from 'vitest';
import type { ModuleInstance } from '@/types/config';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import { isModuleRenderable } from '../ScreenRenderer';

function makeModule(overrides: Partial<ModuleInstance> & { id: string }): ModuleInstance {
  return {
    type: 'clock',
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 0,
    config: {},
    style: { ...DEFAULT_MODULE_STYLE },
    ...overrides,
  };
}

describe('isModuleRenderable', () => {
  it('excludes disabled modules even when schedule would be visible', () => {
    expect(isModuleRenderable(makeModule({ id: 'off', enabled: false }), new Date(), new Map())).toBe(false);
  });

  it('includes modules with enabled omitted (defaults to enabled)', () => {
    expect(isModuleRenderable(makeModule({ id: 'default' }), new Date(), new Map())).toBe(true);
  });

  it('includes modules with enabled: true explicitly', () => {
    expect(isModuleRenderable(makeModule({ id: 'explicit', enabled: true }), new Date(), new Map())).toBe(true);
  });

  it('excludes disabled modules even when they have no schedule', () => {
    expect(isModuleRenderable(makeModule({ id: 'off', enabled: false }), new Date(), new Map())).toBe(false);
  });

  it('excludes modules whose schedule window is out, even when enabled', () => {
    const noon = new Date('2026-05-31T12:00:00Z');
    const scheduledOut = makeModule({
      id: 'scheduled-out',
      schedule: { daysOfWeek: [0], startTime: '03:00', endTime: '03:01' },
    });
    expect(isModuleRenderable(scheduledOut, noon, new Map())).toBe(false);
    expect(isModuleRenderable(makeModule({ id: 'always' }), noon, new Map())).toBe(true);
  });

  it('excludes backgroundProvider instances unconditionally', () => {
    expect(
      isModuleRenderable(makeModule({ id: 'bg', backgroundProvider: true }), new Date(), new Map()),
    ).toBe(false);
  });

  it('gates on shared-state visibility conditions', () => {
    const gated = makeModule({
      id: 'gated',
      visibility: { conditions: [{ kind: 'state', sourceKey: 'plugin:ha:door', equals: 'alert' }] },
    });
    const alerting = new Map([['plugin:ha:door', { value: 'alert', updatedAt: 0 }]]);
    const calm = new Map([['plugin:ha:door', { value: 'closed', updatedAt: 0 }]]);
    expect(isModuleRenderable(gated, new Date(), alerting)).toBe(true);
    expect(isModuleRenderable(gated, new Date(), calm)).toBe(false);
    // Unpublished key defaults to hidden
    expect(isModuleRenderable(gated, new Date(), new Map())).toBe(false);
  });
});
