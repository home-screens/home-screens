import { describe, it, expect } from 'vitest';
import { migrateUp, getMigrations, getLatestSchemaVersion } from '../migrations';
import type { ScreenConfiguration } from '@/types/config';

function makeConfig(version: number): ScreenConfiguration {
  return {
    version,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      latitude: 0,
      longitude: 0,
      weather: {
        provider: 'weatherapi',
        latitude: 0,
        longitude: 0,
        units: 'imperial',
      },
      calendar: {
        googleCalendarId: '',
        googleCalendarIds: [],
        icalSources: [],
        maxEvents: 10,
        daysAhead: 7,
      },
    },
    screens: [
      {
        id: 'default',
        name: 'Screen 1',
        backgroundImage: '',
        modules: [],
      },
    ],
  };
}

describe('migrations', () => {
  it('getMigrations returns sorted migrations', () => {
    const migrations = getMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    for (let i = 1; i < migrations.length; i++) {
      expect(migrations[i].version).toBeGreaterThan(migrations[i - 1].version);
    }
  });

  it('getLatestSchemaVersion returns at least 1', () => {
    expect(getLatestSchemaVersion()).toBeGreaterThanOrEqual(1);
  });

  it('migrateUp with no needed migrations returns config unchanged', () => {
    const config = makeConfig(1);
    const { config: result, migrationsRun } = migrateUp(config, 1);
    expect(migrationsRun).toHaveLength(0);
    expect(result.version).toBe(1);
  });

  it('migrateUp does not mutate the original config', () => {
    const config = makeConfig(1);
    const original = JSON.stringify(config);
    migrateUp(config);
    expect(JSON.stringify(config)).toBe(original);
  });

  it('getLatestSchemaVersion returns 5', () => {
    expect(getLatestSchemaVersion()).toBe(5);
  });
});

describe('migration v3: multi-display registry available', () => {
  it('is a no-op transform that bumps the version', () => {
    const config = makeConfig(2);
    const { config: result, migrationsRun } = migrateUp(config, 3);
    expect(migrationsRun).toHaveLength(1);
    expect(result.version).toBe(3);
    expect(result.screens).toEqual(config.screens);
    expect(result.settings).toEqual(config.settings);
    expect(result.displays).toBeUndefined();
  });
});

describe('migration v2: flag-status → plugin:flag-status', () => {
  it('remaps module type and converts refreshIntervalMs to refreshIntervalMin', () => {
    const config = makeConfig(1);
    config.screens[0].modules = [
      {
        id: 'flag1',
        type: 'flag-status' as ScreenConfiguration['screens'][number]['modules'][number]['type'],
        position: { x: 0, y: 0 },
        size: { w: 300, h: 400 },
        zIndex: 1,
        config: { showReason: true, refreshIntervalMs: 1_800_000 },
        style: { opacity: 1, borderRadius: 12, padding: 16, backgroundColor: '', textColor: '#fff', fontFamily: 'Inter', fontSize: 16, backdropBlur: 0, borderWidth: 0, borderColor: '', shadowSize: 0 },
      },
    ];

    const { config: result, migrationsRun } = migrateUp(config, 2);

    expect(migrationsRun).toHaveLength(1);
    expect(result.version).toBe(2);
    const mod = result.screens[0].modules[0];
    expect(mod.type).toBe('plugin:flag-status');
    expect(mod.config).toHaveProperty('refreshIntervalMin', 30);
    expect(mod.config).not.toHaveProperty('refreshIntervalMs');
    expect(mod.config).toHaveProperty('showReason', true);
  });

  it('handles missing refreshIntervalMs gracefully', () => {
    const config = makeConfig(1);
    config.screens[0].modules = [
      {
        id: 'flag2',
        type: 'flag-status' as ScreenConfiguration['screens'][number]['modules'][number]['type'],
        position: { x: 0, y: 0 },
        size: { w: 300, h: 400 },
        zIndex: 1,
        config: { showReason: false },
        style: { opacity: 1, borderRadius: 12, padding: 16, backgroundColor: '', textColor: '#fff', fontFamily: 'Inter', fontSize: 16, backdropBlur: 0, borderWidth: 0, borderColor: '', shadowSize: 0 },
      },
    ];

    const { config: result } = migrateUp(config, 2);
    const mod = result.screens[0].modules[0];
    expect(mod.type).toBe('plugin:flag-status');
    expect(mod.config).not.toHaveProperty('refreshIntervalMs');
    expect(mod.config).not.toHaveProperty('refreshIntervalMin');
    expect(mod.config).toHaveProperty('showReason', false);
  });

  it('leaves non-flag-status modules unchanged', () => {
    const config = makeConfig(1);
    config.screens[0].modules = [
      {
        id: 'clock1',
        type: 'clock',
        position: { x: 0, y: 0 },
        size: { w: 400, h: 200 },
        zIndex: 1,
        config: { view: 'digital' },
        style: { opacity: 1, borderRadius: 12, padding: 16, backgroundColor: '', textColor: '#fff', fontFamily: 'Inter', fontSize: 16, backdropBlur: 0, borderWidth: 0, borderColor: '', shadowSize: 0 },
      },
    ];

    const { config: result } = migrateUp(config, 2);
    expect(result.screens[0].modules[0].type).toBe('clock');
  });
});

describe('migration edge cases: legacy + multi-display registry', () => {
  it('migrates a v1 legacy single-display config through the full chain to latest', () => {
    const config = makeConfig(1);
    const { config: result, migrationsRun } = migrateUp(config);

    expect(result.version).toBe(getLatestSchemaVersion());
    expect(result.version).toBe(5);
    // v2, v3, v4, v5 run (v1 is the starting point, not re-applied).
    expect(migrationsRun).toHaveLength(4);
    // Legacy single-display shape is preserved untouched: v2 leaves non-flag
    // modules alone and v3/v4/v5 are pure version bumps. No display registry
    // is injected — single-display mode stays single-display.
    expect(result.screens).toEqual(config.screens);
    expect(result.settings).toEqual(config.settings);
    expect(result.displays).toBeUndefined();
  });

  it('carries a displays registry with no `main` node through untouched (migrations never seed main)', () => {
    const config: ScreenConfiguration = {
      ...makeConfig(3),
      displays: [
        { id: 'kitchen', name: 'Kitchen', screens: [], displayWidth: 1080, displayHeight: 1920 },
        { id: 'living-room', name: 'Living Room', screens: [], displayWidth: 1920, displayHeight: 1080 },
      ],
    };

    const { config: result, migrationsRun } = migrateUp(config);

    expect(result.version).toBe(5);
    // Only v4 and v5 remain to run from a v3 config.
    expect(migrationsRun).toHaveLength(2);
    // The registry is passed through verbatim. Seeding a sibling `main` is the
    // editor store's addDisplay job (see stores/__tests__/editor-store.test.ts),
    // never a migration's — so a registry without `main` must stay that way.
    expect(result.displays).toEqual(config.displays);
    expect(result.displays?.some((d) => d.id === 'main')).toBe(false);
  });

  it('re-migrating an already-current config is a no-op (idempotent)', () => {
    const config = makeConfig(getLatestSchemaVersion());
    const before = structuredClone(config);

    const { config: result, migrationsRun } = migrateUp(config);

    expect(migrationsRun).toHaveLength(0);
    expect(result.version).toBe(getLatestSchemaVersion());
    expect(result).toEqual(before);
  });

  it('re-migrating an already-current config that owns a displays registry is a no-op', () => {
    const config: ScreenConfiguration = {
      ...makeConfig(getLatestSchemaVersion()),
      displays: [
        { id: 'main', name: 'Main', screens: [], displayWidth: 1080, displayHeight: 1920 },
        { id: 'kitchen', name: 'Kitchen', screens: [], displayWidth: 1080, displayHeight: 1920 },
      ],
    };
    const before = structuredClone(config);

    const { config: result, migrationsRun } = migrateUp(config);

    expect(migrationsRun).toHaveLength(0);
    expect(result).toEqual(before);
    expect(result.displays).toEqual(before.displays);
  });
});
