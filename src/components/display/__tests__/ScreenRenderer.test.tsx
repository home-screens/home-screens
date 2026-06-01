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
    expect(isModuleRenderable(makeModule({ id: 'off', enabled: false }), new Date())).toBe(false);
  });

  it('includes modules with enabled omitted (defaults to enabled)', () => {
    expect(isModuleRenderable(makeModule({ id: 'default' }), new Date())).toBe(true);
  });

  it('includes modules with enabled: true explicitly', () => {
    expect(isModuleRenderable(makeModule({ id: 'explicit', enabled: true }), new Date())).toBe(true);
  });

  it('excludes disabled modules even when they have no schedule', () => {
    expect(isModuleRenderable(makeModule({ id: 'off', enabled: false }), new Date())).toBe(false);
  });

  it('excludes modules whose schedule window is out, even when enabled', () => {
    const noon = new Date('2026-05-31T12:00:00Z');
    const scheduledOut = makeModule({
      id: 'scheduled-out',
      schedule: { daysOfWeek: [0], startTime: '03:00', endTime: '03:01' },
    });
    expect(isModuleRenderable(scheduledOut, noon)).toBe(false);
    expect(isModuleRenderable(makeModule({ id: 'always' }), noon)).toBe(true);
  });
});
