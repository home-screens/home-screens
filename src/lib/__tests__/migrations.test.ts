import { describe, it, expect } from 'vitest';
import { migrateUp, migrateDown, getMigrations, getLatestSchemaVersion } from '../migrations';
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

  it('migrateDown with no needed migrations returns config unchanged', () => {
    const config = makeConfig(1);
    const { config: result, migrationsRun } = migrateDown(config, 1);
    expect(migrationsRun).toHaveLength(0);
    expect(result.version).toBe(1);
  });

  it('migrateUp does not mutate the original config', () => {
    const config = makeConfig(1);
    const original = JSON.stringify(config);
    migrateUp(config);
    expect(JSON.stringify(config)).toBe(original);
  });

  it('getLatestSchemaVersion returns 2', () => {
    expect(getLatestSchemaVersion()).toBe(2);
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
        style: { opacity: 1, borderRadius: 12, padding: 16, backgroundColor: '', textColor: '#fff', fontFamily: 'Inter', fontSize: 16, backdropBlur: 0 },
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
        style: { opacity: 1, borderRadius: 12, padding: 16, backgroundColor: '', textColor: '#fff', fontFamily: 'Inter', fontSize: 16, backdropBlur: 0 },
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
        style: { opacity: 1, borderRadius: 12, padding: 16, backgroundColor: '', textColor: '#fff', fontFamily: 'Inter', fontSize: 16, backdropBlur: 0 },
      },
    ];

    const { config: result } = migrateUp(config, 2);
    expect(result.screens[0].modules[0].type).toBe('clock');
  });

  it('round-trips: migrateDown restores original type and config key', () => {
    const config = makeConfig(1);
    config.screens[0].modules = [
      {
        id: 'flag3',
        type: 'flag-status' as ScreenConfiguration['screens'][number]['modules'][number]['type'],
        position: { x: 0, y: 0 },
        size: { w: 300, h: 400 },
        zIndex: 1,
        config: { showReason: true, refreshIntervalMs: 3_600_000 },
        style: { opacity: 1, borderRadius: 12, padding: 16, backgroundColor: '', textColor: '#fff', fontFamily: 'Inter', fontSize: 16, backdropBlur: 0 },
      },
    ];

    const { config: up } = migrateUp(config, 2);
    expect(up.screens[0].modules[0].type).toBe('plugin:flag-status');
    expect(up.screens[0].modules[0].config).toHaveProperty('refreshIntervalMin', 60);

    const { config: down } = migrateDown(up, 1);
    expect(down.version).toBe(1);
    expect(down.screens[0].modules[0].type).toBe('flag-status');
    expect(down.screens[0].modules[0].config).toHaveProperty('refreshIntervalMs', 3_600_000);
    expect(down.screens[0].modules[0].config).not.toHaveProperty('refreshIntervalMin');
  });
});
