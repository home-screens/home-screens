import { describe, expect, it } from 'vitest';
import type { GlobalSettings } from '@/types/config';
import enEditor from '@/translations/en-US/editor.json';
import deEditor from '@/translations/de-DE/editor.json';
import { formatOverrideComparison } from '../OverviewSubtab';

/** Dotted lookup with {token} fill, over one dictionary. */
function translator(dictionary: unknown) {
  return (key: string, vars?: Record<string, string | number>): string => {
    const value = key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], dictionary);
    const template = typeof value === 'string' ? value : key;
    return template.replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? `{${name}}`));
  };
}
const en = translator(enEditor);
const de = translator(deEditor);

const settings = { pauseEnabled: true, calendarWallEntry: false, rotationIntervalMs: 60_000, transitionDuration: 0.6 } as unknown as GlobalSettings;

describe('a display page chip for an overridden field', () => {
  it("names each switch's own default, not the wall's event adding", () => {
    // Pause is on by default here, while adding events on the wall is off.
    expect(formatOverrideComparison('pauseEnabled', { pauseEnabled: false }, settings, en, 'en-US')).toMatch(/: Off \(default: On\)$/);
    // Adding events keeps its own default.
    expect(formatOverrideComparison('calendarWallEntry', { calendarWallEntry: true }, settings, en, 'en-US')).toMatch(/: On \(default: Off\)$/);
  });

  it('writes seconds the way each language does', () => {
    const overrides = { rotationIntervalMs: 90_000, transitionDuration: 1.5 };
    expect(formatOverrideComparison('rotationIntervalMs', overrides, settings, de, 'de-DE')).toContain('90 s');
    expect(formatOverrideComparison('transitionDuration', overrides, settings, de, 'de-DE')).toContain('1,5 s');
    expect(formatOverrideComparison('transitionDuration', overrides, settings, de, 'de-DE')).toContain('0,6 s');
    expect(formatOverrideComparison('rotationIntervalMs', overrides, settings, en, 'en-US')).toContain('90s');
  });
});
