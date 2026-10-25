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

  describe('a Text module with looks', () => {
    const looks = [
      { id: 'hot', name: 'Too warm', when: [{ kind: 'numeric' as const, sourceKey: 'plugin:ha:temp', above: 24 }], textColor: '#f00' },
      { id: 'ok', when: [{ kind: 'numeric' as const, sourceKey: 'plugin:ha:temp', below: 22 }], textColor: '#0f0' },
    ];
    const text = mod({ type: 'text', config: { content: 'x', looks } });
    const at = (value: string) => new Map<string, SharedStateEntry>([
      ['plugin:ha:temp', { value, updatedAt: Date.now() } as SharedStateEntry],
    ]);

    it('waits, naming the key, while no display has reported', () => {
      const [status] = describeModuleStatus(text, ctx);
      expect(status.key).toBe('looks');
      expect(status.tone).toBe('background');
      expect(status.label).toBe('Looks waiting for plugin:ha:temp');
    });

    it('names an unconditional top look before any display has reported, and only that one', () => {
      const base = { id: 'base', name: 'Base', when: [], textColor: '#fff' };
      const below = { id: 'below', name: 'Below', when: [], borderColor: '#fff' };
      const [status] = describeModuleStatus(mod({ type: 'text', config: { content: 'x', looks: [base, ...looks, below] } }), ctx);
      expect(status.tone).toBe('active');
      expect(status.label).toBe('Look: Base');
    });

    it('names the look in effect, falling back to its number', () => {
      const [hot] = describeModuleStatus(text, { ...ctx, verdictStates: at('25') });
      expect(hot.tone).toBe('active');
      expect(hot.label).toBe('Look: Too warm');
      const [ok] = describeModuleStatus(text, { ...ctx, verdictStates: at('20') });
      expect(ok.label).toBe('Look: Look 2');
    });

    it('lists two looks in effect as two names, not one look called both', () => {
      // Two matching looks that set different things both apply; the chip
      // and its title say so in the plural.
      const both = mod({ type: 'text', config: { content: 'x', looks: [looks[0], { id: 'warm', name: 'Warm', when: [{ kind: 'numeric' as const, sourceKey: 'plugin:ha:temp', above: 20 }], borderColor: '#ff0' }] } });
      const [status] = describeModuleStatus(both, { ...ctx, verdictStates: at('25') });
      expect(status.label).toBe('Looks: Too warm, Warm');
      expect(status.detail).toBe('The looks Too warm and Warm are changing this module right now.');
      const [single] = describeModuleStatus(both, { ...ctx, verdictStates: at('21') });
      expect(single.label).toBe('Look: Warm');
      expect(single.detail).toBe('The look "Warm" is changing this module right now.');
    });

    it('says when no look matches', () => {
      const [none] = describeModuleStatus(text, { ...ctx, verdictStates: at('23') });
      expect(none.tone).toBe('waiting');
      expect(none.label).toBe('No look matches');
    });

    it('says nothing for a disabled module or an empty list', () => {
      expect(describeModuleStatus(mod({ type: 'text', config: { looks: [] } }), ctx)).toEqual([]);
      expect(describeModuleStatus({ ...text, enabled: false }, ctx).map((s) => s.key)).toEqual(['disabled']);
    });
  });

  describe('a condition that only reads the clock', () => {
    // ctx.now is 08:00.
    const morning = mod({ visibility: { conditions: [{ kind: 'time', startTime: '07:00', endTime: '09:00' }] } });
    const evening = mod({ visibility: { conditions: [{ kind: 'time', startTime: '18:00', endTime: '22:00' }] } });

    it('is judged on the household clock with no display reporting', () => {
      const [shown] = describeModuleStatus(morning, ctx);
      expect(shown.tone).toBe('active');
      expect(shown.label).toBe('Showing at this time');
      expect(shown.detail).toBe(en.draggableModule.conditionMetTitleEditor);
      const [hidden] = describeModuleStatus(evening, ctx);
      expect(hidden.tone).toBe('waiting');
      expect(hidden.label).toBe('Hidden at this time');
    });

    it('never says it is waiting for a live value, even with a display reporting', () => {
      const [status] = describeModuleStatus(morning, { ...ctx, verdictStates: new Map(), source: 'display' });
      expect(status.label).toBe('Showing at this time');
      expect(status.detail).toBe(en.draggableModule.conditionMetTitle);
    });

    it('leaves a tree that also reads a key waiting for a display', () => {
      const [status] = describeModuleStatus(
        mod({ visibility: { conditions: [{ kind: 'time', startTime: '07:00', endTime: '09:00' }, { kind: 'state', sourceKey: 'k', equals: 'on' }] } }),
        ctx,
      );
      expect(status.tone).toBe('background');
      expect(status.label).toBe('Waiting for k');
    });
  });

  it('reports a background provider alongside everything else', () => {
    const statuses = describeModuleStatus(mod({ backgroundProvider: true, schedule: { daysOfWeek: [0, 6] } }), ctx);
    expect(statuses.map((s) => s.key)).toEqual(['schedule', 'backgroundProvider']);
    expect(statuses[1].label).toBe('Runs in the background');
  });
});

describe('a condition chip once the display has reported', () => {
  const gated = mod({ visibility: { conditions: [{ kind: 'state', sourceKey: 'weather.condition', equals: 'rain' }] } });
  const reported = (value: string) => new Map<string, SharedStateEntry>([['weather.condition', { value, updatedAt: 0 }]]);

  it('says showing or hidden rather than waiting for the key', () => {
    // Three testers read "Waiting for weather.precip_chance_today" as "nothing
    // has arrived" while the panel beside it said the value and the verdict.
    const [met] = describeModuleStatus(gated, { ...ctx, verdictStates: reported('rain'), source: 'display' });
    expect(met.label).toBe('Showing now');
    expect(met.tone).toBe('active');
    const [unmet] = describeModuleStatus(gated, { ...ctx, verdictStates: reported('clear'), source: 'display' });
    expect(unmet.label).toBe('Hidden now');
    expect(unmet.tone).toBe('waiting');
  });

  it('names the key the way the picker does while it is still waiting', () => {
    const keyLabel = (key: string) => (key === 'weather.condition' ? 'Weather right now' : undefined);
    const [status] = describeModuleStatus(gated, { ...ctx, keyLabel });
    expect(status.label).toBe('Waiting for Weather right now');
    const [raw] = describeModuleStatus(
      mod({ visibility: { conditions: [{ kind: 'state', sourceKey: 'garage.door', equals: 'open' }] } }),
      { ...ctx, keyLabel },
    );
    expect(raw.label).toBe('Waiting for garage.door');
  });
});
