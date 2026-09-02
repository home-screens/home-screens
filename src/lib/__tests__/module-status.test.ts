import { describe, it, expect } from 'vitest';
import { describeModuleStatus } from '@/lib/module-status';
import en from '@/translations/en-US/editor.json';
import type { ModuleInstance } from '@/types/config';
import type { SharedStateEntry } from '@/lib/shared-state-types';

function t(key: string, vars?: Record<string, string | number>): string {
  const value = key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en);
  const template = typeof value === 'string' ? value : key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? `{${name}}`));
}

function mod(overrides: Partial<ModuleInstance> = {}): ModuleInstance {
  return {
    id: 'm1',
    type: 'clock',
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    config: {},
    style: {} as ModuleInstance['style'],
    ...overrides,
  } as ModuleInstance;
}

const ctx = { t, now: new Date('2026-09-05T08:00:00'), formattingLocale: 'en-US', timeFormat: '12h' as const };

describe('describeModuleStatus', () => {
  it('says nothing about a plain, enabled module', () => {
    expect(describeModuleStatus(mod(), ctx)).toEqual([]);
  });

  it('reports a disabled module as hidden and stops there', () => {
    // A module that never renders has no useful schedule or condition state to
    // report — one reason, not three.
    const statuses = describeModuleStatus(
      mod({ enabled: false, schedule: { daysOfWeek: [1] }, visibility: { conditions: [{ kind: 'state', sourceKey: 'x', equals: 'on' }] } }),
      ctx,
    );
    expect(statuses.map((s) => s.key)).toEqual(['disabled']);
    expect(statuses[0].label).toBe('Hidden');
    expect(statuses[0].tone).toBe('off');
  });

  it('labels a schedule with the window itself, and tones it by whether it is on now', () => {
    // 2026-09-05 is a Saturday, so a Mon-Fri schedule is off right now.
    const [status] = describeModuleStatus(
      mod({ schedule: { daysOfWeek: [1, 2, 3, 4, 5], startTime: '07:00', endTime: '09:00' } }),
      ctx,
    );
    expect(status.label).toBe('Mon to Fri, 7:00 AM to 9:00 AM');
    expect(status.tone).toBe('waiting');
    expect(status.detail).toContain('off the wall right now');

    const [weekend] = describeModuleStatus(mod({ schedule: { daysOfWeek: [0, 6] } }), ctx);
    expect(weekend.tone).toBe('active');
  });

  it('names the state key a condition is waiting on', () => {
    const [status] = describeModuleStatus(
      mod({ visibility: { conditions: [{ kind: 'state', sourceKey: 'kitchen_motion', equals: 'on' }] } }),
      ctx,
    );
    expect(status.label).toBe('Waiting for kitchen_motion');
  });

  it('finds the key inside a nested condition tree', () => {
    const [status] = describeModuleStatus(
      mod({
        visibility: {
          conditions: [
            { kind: 'and', conditions: [{ kind: 'state', sourceKey: 'nested_key', equals: 'on' }] },
          ],
        },
      }),
      ctx,
    );
    expect(status.label).toBe('Waiting for nested_key');
  });

  it('stays neutral about a condition when no display has reported', () => {
    const [status] = describeModuleStatus(
      mod({ visibility: { conditions: [{ kind: 'state', sourceKey: 'k', equals: 'on' }] } }),
      ctx,
    );
    expect(status.tone).toBe('background');
  });

  it('turns a met condition active once live values arrive', () => {
    const states = new Map<string, SharedStateEntry>([
      ['k', { value: 'on', updatedAt: Date.now() } as SharedStateEntry],
    ]);
    const [status] = describeModuleStatus(
      mod({ visibility: { conditions: [{ kind: 'state', sourceKey: 'k', equals: 'on' }] } }),
      { ...ctx, verdictStates: states },
    );
    expect(status.tone).toBe('active');
  });

  it('reports a background provider alongside everything else', () => {
    const statuses = describeModuleStatus(mod({ backgroundProvider: true, schedule: { daysOfWeek: [0, 6] } }), ctx);
    expect(statuses.map((s) => s.key)).toEqual(['schedule', 'backgroundProvider']);
    expect(statuses[1].label).toBe('Runs in the background');
  });
});
