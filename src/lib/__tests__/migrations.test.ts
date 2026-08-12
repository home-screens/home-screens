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

  it('getLatestSchemaVersion returns 6', () => {
    expect(getLatestSchemaVersion()).toBe(6);
  });
});

describe('migration v6: countdown scale becomes view-independent', () => {
  const STYLE = { opacity: 1, borderRadius: 12, padding: 16, backgroundColor: '', textColor: '#fff', fontFamily: 'Inter', fontSize: 16, backdropBlur: 0, borderWidth: 0, borderColor: '', shadowSize: 0 };

  function countdown(id: string, config: Record<string, unknown>): ScreenConfiguration['screens'][number]['modules'][number] {
    return {
      id,
      type: 'countdown',
      position: { x: 0, y: 0 },
      size: { w: 500, h: 500 },
      zIndex: 1,
      config,
      style: STYLE,
    } as ScreenConfiguration['screens'][number]['modules'][number];
  }

  function scaleOf(config: ScreenConfiguration, screenIndex = 0, moduleIndex = 0): unknown {
    return (config.screens[screenIndex].modules[moduleIndex].config as Record<string, unknown>).scale;
  }

  it('multiplies a next-view countdown scale by 1.3', () => {
    const config = makeConfig(5);
    config.screens[0].modules = [countdown('cd1', { events: [], showPastEvents: false, scale: 3.4, view: 'next' })];

    const { config: result, migrationsRun } = migrateUp(config, 6);

    expect(migrationsRun).toHaveLength(1);
    expect(result.version).toBe(6);
    expect(scaleOf(result)).toBe(4.4); // 3.4 * 1.3 = 4.42, rounded onto the 0.1 slider step
  });

  it('leaves all-view countdowns alone', () => {
    const config = makeConfig(5);
    config.screens[0].modules = [countdown('cd1', { events: [], showPastEvents: false, scale: 4, view: 'all' })];

    const { config: result } = migrateUp(config, 6);

    expect(scaleOf(result)).toBe(4);
  });

  it('leaves a countdown with no explicit view alone (renders as all)', () => {
    const config = makeConfig(5);
    config.screens[0].modules = [countdown('cd1', { events: [], showPastEvents: false, scale: 2 })];

    const { config: result } = migrateUp(config, 6);

    expect(scaleOf(result)).toBe(2);
  });

  it('treats a missing scale as the render-time default of 1', () => {
    const config = makeConfig(5);
    config.screens[0].modules = [countdown('cd1', { events: [], showPastEvents: false, view: 'next' })];

    const { config: result } = migrateUp(config, 6);

    expect(scaleOf(result)).toBe(1.3);
  });

  it('migrates screens owned by displays, not just the top-level array', () => {
    const config = makeConfig(5);
    config.screens[0].modules = [countdown('cd-global', { events: [], showPastEvents: false, scale: 1, view: 'next' })];
    config.displays = [
      {
        id: 'main',
        name: 'Main',
        displayWidth: 1080,
        displayHeight: 1920,
        screens: [
          { id: 's1', name: 'Screen 1', backgroundImage: '', modules: [countdown('cd-main', { events: [], showPastEvents: false, scale: 2, view: 'next' })] },
        ],
      },
    ] as ScreenConfiguration['displays'];

    const { config: result } = migrateUp(config, 6);

    expect(scaleOf(result)).toBe(1.3);
    const perDisplay = result.displays![0].screens[0].modules[0].config as Record<string, unknown>;
    expect(perDisplay.scale).toBe(2.6);
  });

  it('leaves non-countdown modules untouched', () => {
    const config = makeConfig(5);
    config.screens[0].modules = [
      { ...countdown('clock1', { view: 'digital', scale: 2 }), type: 'clock' } as ScreenConfiguration['screens'][number]['modules'][number],
    ];

    const { config: result } = migrateUp(config, 6);

    expect(scaleOf(result)).toBe(2);
  });

  it('passes a display node with no screens array through instead of throwing', () => {
    // A v3-era registry used `screenIds` and had no `screens`; v4 was a pure
    // version bump and never converted it. updateConfigAtomic does not catch
    // migration throws, so a hard failure here would 500 every write path.
    const config = makeConfig(5);
    config.displays = [{ id: 'kitchen', name: 'Kitchen', screenIds: ['s1'] }] as unknown as ScreenConfiguration['displays'];

    const { config: result } = migrateUp(config, 6);

    expect(result.version).toBe(6);
    expect(result.displays![0]).toEqual({ id: 'kitchen', name: 'Kitchen', screenIds: ['s1'] });
  });

  it('passes a screen with no modules array through instead of throwing', () => {
    const config = makeConfig(5);
    config.screens = [{ id: 's1', name: 'Screen 1', backgroundImage: '' }] as unknown as ScreenConfiguration['screens'];

    const { config: result } = migrateUp(config, 6);

    expect(result.version).toBe(6);
    expect(result.screens[0]).toEqual({ id: 's1', name: 'Screen 1', backgroundImage: '' });
  });

  it('preserves the rendered Next-view layout, not just the flip digits', () => {
    // scale feeds four expressions, so migrating the stored value inflates all
    // of them. CountdownNextView's coefficients are rebased by 1/1.3 to
    // compensate; this asserts the arithmetic those two changes must satisfy.
    const before = 3;
    const { config: result } = (() => {
      const config = makeConfig(5);
      config.screens[0].modules = [countdown('cd1', { events: [], showPastEvents: false, scale: before, view: 'next' })];
      return migrateUp(config, 6);
    })();
    const after = scaleOf(result) as number;

    const drift = (post: number, pre: number) => Math.abs(post - pre) / pre;

    // Flip digits: was 28 * scale * 1.3, now 28 * scale.
    expect(drift(28 * after, 28 * before * 1.3)).toBeLessThan(0.02);
    // Heading: was 18 * scale, now 14 * scale (14 * 1.3 = 18.2).
    expect(drift(14 * after, 18 * before)).toBeLessThan(0.02);
    // Heading-to-timer gap: was 0.6 * scale em, now 0.46 * scale em.
    expect(drift(0.46 * after, 0.6 * before)).toBeLessThan(0.02);
  });

  it('never produces a scale above the config section slider max of 5.2', () => {
    const config = makeConfig(5);
    // 4 was the old slider max, so it is the largest value this migration can see.
    config.screens[0].modules = [countdown('cd1', { events: [], showPastEvents: false, scale: 4, view: 'next' })];

    const { config: result } = migrateUp(config, 6);

    expect(scaleOf(result)).toBe(5.2);
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
    expect(result.version).toBe(6);
    // v2, v3, v4, v5, v6 run (v1 is the starting point, not re-applied).
    expect(migrationsRun).toHaveLength(5);
    // Legacy single-display shape is preserved untouched: v2 leaves non-flag
    // modules alone, v3/v4/v5 are pure version bumps, and v6 only touches
    // next-view countdowns (this fixture has no modules at all). No display
    // registry is injected — single-display mode stays single-display.
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

    expect(result.version).toBe(6);
    // Only v4, v5 and v6 remain to run from a v3 config.
    expect(migrationsRun).toHaveLength(3);
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
