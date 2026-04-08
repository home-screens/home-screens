import { describe, it, expect } from 'vitest';
import type { DisplayNode, ScreenConfiguration } from '@/types/config';
import { findDisplaysOverridingFields } from '../display-defaults-backlinks';

/**
 * Pure-function unit tests for the bidirectional backlink helper that
 * powers the `Defaults → X` page banner ("Kitchen overrides 3 fields on
 * this page"). These tests deliberately avoid touching React or the
 * Zustand store: a backlink banner regression should be diagnosable from
 * these tests alone, without bringing the editor up.
 */

function makeConfig(overrides?: Partial<ScreenConfiguration>): ScreenConfiguration {
  return {
    version: 3,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      latitude: 0,
      longitude: 0,
      weather: { provider: 'weatherapi', latitude: 0, longitude: 0, units: 'imperial' },
      calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7 },
    },
    screens: [{ id: 'default', name: 'Default', backgroundImage: '', modules: [] }],
    ...overrides,
  };
}

function makeDisplay(id: string, settings?: DisplayNode['settings']): DisplayNode {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    screens: [],
    ...(settings ? { settings } : {}),
  };
}

describe('findDisplaysOverridingFields', () => {
  it('returns an empty array when the displays registry is undefined', () => {
    const config = makeConfig();
    expect(
      findDisplaysOverridingFields(config, ['rotationIntervalMs', 'transitionEffect']),
    ).toEqual([]);
  });

  it('returns an empty array when the displays registry is empty', () => {
    const config = makeConfig({ displays: [] });
    expect(findDisplaysOverridingFields(config, ['rotationIntervalMs'])).toEqual([]);
  });

  it('returns an empty array when no display has any of the requested overrides', () => {
    const config = makeConfig({
      displays: [
        makeDisplay('main'),
        makeDisplay('kitchen', { fullscreenTheme: 'charcoal' }),
      ],
    });
    // Asking only about rotation/transition — Kitchen overrides theme,
    // not those, so it should NOT show up.
    expect(
      findDisplaysOverridingFields(config, ['rotationIntervalMs', 'transitionEffect']),
    ).toEqual([]);
  });

  it('returns a single display when only one overrides a queried field', () => {
    const config = makeConfig({
      displays: [
        makeDisplay('main'),
        makeDisplay('kitchen', { rotationIntervalMs: 8000 }),
      ],
    });
    const result = findDisplaysOverridingFields(config, ['rotationIntervalMs']);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      displayId: 'kitchen',
      displayName: 'Kitchen',
      overriddenFields: ['rotationIntervalMs'],
    });
  });

  it('returns multiple displays each with their disjoint overridden fields', () => {
    const config = makeConfig({
      displays: [
        makeDisplay('main'),
        makeDisplay('kitchen', { rotationIntervalMs: 8000, fullscreenTheme: 'charcoal' }),
        makeDisplay('bedroom', { transitionEffect: 'slide-up' }),
        makeDisplay('studio', { cursorHideSeconds: 10 }),
      ],
    });
    const result = findDisplaysOverridingFields(config, [
      'rotationIntervalMs',
      'transitionEffect',
      'fullscreenTheme',
      'cursorHideSeconds',
    ]);
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.displayId).sort()).toEqual(['bedroom', 'kitchen', 'studio']);

    const kitchen = result.find((s) => s.displayId === 'kitchen')!;
    expect(kitchen.overriddenFields.sort()).toEqual(['fullscreenTheme', 'rotationIntervalMs']);

    const bedroom = result.find((s) => s.displayId === 'bedroom')!;
    expect(bedroom.overriddenFields).toEqual(['transitionEffect']);
  });

  it('only counts the fields the caller asked about (filters out unrelated overrides)', () => {
    const config = makeConfig({
      displays: [
        makeDisplay('kitchen', {
          rotationIntervalMs: 8000,
          transitionEffect: 'fade',
          fullscreenTheme: 'charcoal',
        }),
      ],
    });
    // Asking only about rotation — the result should NOT mention
    // transitionEffect or fullscreenTheme even though they're set.
    const result = findDisplaysOverridingFields(config, ['rotationIntervalMs']);
    expect(result).toHaveLength(1);
    expect(result[0].overriddenFields).toEqual(['rotationIntervalMs']);
  });

  it('detects nested-object overrides via top-level key presence (sleep)', () => {
    // Per the contract in display-filter.ts, nested-object overrides are
    // full-replacement units, so detection just looks at "is the `sleep`
    // key set on this display's settings?" — it never recurses into the
    // sleep object to ask about specific fields.
    const config = makeConfig({
      displays: [
        makeDisplay('kitchen', {
          sleep: {
            enabled: true,
            dimAfterMinutes: 5,
            sleepAfterMinutes: 30,
            dimBrightness: 20,
          },
        }),
      ],
    });
    const result = findDisplaysOverridingFields(config, ['sleep', 'screensaver']);
    expect(result).toHaveLength(1);
    expect(result[0].overriddenFields).toEqual(['sleep']);
  });

  it('returns an empty array when the field list itself is empty', () => {
    // No fields to query → there's nothing to count, so the helper should
    // short-circuit even on a config full of overrides. Prevents an
    // accidental "show all displays" backlink banner on a Defaults page
    // that has no overridable fields (Weather, Integrations, etc.).
    const config = makeConfig({
      displays: [makeDisplay('kitchen', { rotationIntervalMs: 8000 })],
    });
    expect(findDisplaysOverridingFields(config, [])).toEqual([]);
  });

  it('returns an empty array for legacy single-display configs even with the right query', () => {
    // Belt-and-braces: a config with no `displays` registry can never have
    // overrides regardless of what fields you ask about, so the banner
    // should be invisible on legacy installs.
    const config = makeConfig();
    expect(
      findDisplaysOverridingFields(config, ['rotationIntervalMs', 'fullscreenTheme', 'sleep']),
    ).toEqual([]);
  });
});
