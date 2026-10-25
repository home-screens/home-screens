import { describe, expect, it } from 'vitest';
import { describeConditions } from '@/lib/condition-summary';
import en from '@/translations/en-US/editor.json';
import type { VisibilityCondition } from '@/types/config';

function t(key: string, vars?: Record<string, string | number>): string {
  const value = key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en);
  const template = typeof value === 'string' ? value : key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? `{${name}}`));
}

const LABELS: Record<string, string> = {
  'weather.temperature': 'Temperature right now',
  'weather.precip_chance_today': 'Chance of rain today',
  'weather.alert_active': 'A weather warning is in force',
};
const ctx = { t, formattingLocale: 'en-US', timeFormat: '12h' as const, labelFor: (key: string) => LABELS[key] };
const one = (c: VisibilityCondition) => describeConditions([c], ctx);

describe('describeConditions', () => {
  it('names the key in a number summary, so two looks on different keys never read the same', () => {
    expect(one({ kind: 'numeric', sourceKey: 'weather.temperature', above: 50 })).toBe('Temperature right now above 50');
    expect(one({ kind: 'numeric', sourceKey: 'weather.precip_chance_today', above: 50 })).toBe('Chance of rain today above 50');
    expect(one({ kind: 'numeric', sourceKey: 'weather.temperature', below: 32 })).toBe('Temperature right now below 32');
    expect(one({ kind: 'numeric', sourceKey: 'weather.temperature', above: 20, below: 24 })).toBe('Temperature right now 20 to 24');
    expect(one({ kind: 'numeric', sourceKey: 'weather.temperature' })).toBe('Temperature right now is any number');
  });

  it('falls back to the key tail, or says no key is picked', () => {
    expect(one({ kind: 'numeric', sourceKey: 'plugin:ha:sensor.garage', above: 1 })).toBe('sensor.garage above 1');
    expect(one({ kind: 'numeric', sourceKey: '', above: 1 })).toBe('no key picked above 1');
  });

  it('reads a yes-or-no key as its own sentence, with a short no for false', () => {
    expect(one({ kind: 'state', sourceKey: 'weather.alert_active', equals: 'true' })).toBe('A weather warning is in force');
    expect(one({ kind: 'state', sourceKey: 'weather.alert_active', equals: 'false' })).toBe('A weather warning is in force: no');
    expect(one({ kind: 'state', sourceKey: 'weather.alert_active', notEquals: 'true' })).toBe('A weather warning is in force: no');
    expect(one({ kind: 'state', sourceKey: 'weather.alert_active', notEquals: 'false' })).toBe('A weather warning is in force');
  });

  it('keeps "is" for any other value', () => {
    expect(one({ kind: 'state', sourceKey: 'plugin:ha:front_door', equals: 'open' })).toBe('front_door is open');
    expect(one({ kind: 'state', sourceKey: 'plugin:ha:front_door', notEquals: 'open' })).toBe('front_door is not open');
  });
});
