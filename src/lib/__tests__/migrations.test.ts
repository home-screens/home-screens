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

  it('getLatestSchemaVersion returns 10', () => {
    expect(getLatestSchemaVersion()).toBe(10);
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
    expect(result.version).toBe(10);
    // v2 through v10 run (v1 is the starting point, not re-applied).
    expect(migrationsRun).toHaveLength(9);
    // Legacy single-display shape is preserved untouched: v2 leaves non-flag
    // modules alone, v3/v4/v5 are pure version bumps, v6 only touches
    // next-view countdowns (this fixture has no modules at all), v7 only
    // touches sleep blocks with a dim schedule (this fixture has none), and
    // v8 only touches calendar modules carrying the prerelease keys, and v9
    // only touches fullscreen-calendar modules carrying the retired default
    // accent, and v10 only touches news modules (this fixture has none). No
    // display registry is injected — single-display mode stays single-display.
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

    expect(result.version).toBe(10);
    // Only v4 through v10 remain to run from a v3 config.
    expect(migrationsRun).toHaveLength(7);
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

describe('migration v7: idle dimming becomes an explicit toggle', () => {
  const SLEEP_WITH_DIM_SCHEDULE = {
    enabled: true,
    dimAfterMinutes: 10,
    sleepAfterMinutes: 0,
    dimBrightness: 20,
    dimSchedule: { startTime: '23:00', endTime: '06:00' },
  };

  it('seeds idleDimEnabled: false where a dim schedule implied suppression', () => {
    const config = makeConfig(6);
    config.settings.sleep = { ...SLEEP_WITH_DIM_SCHEDULE };

    const { config: result } = migrateUp(config, 7);

    expect(result.version).toBe(7);
    expect(result.settings.sleep?.idleDimEnabled).toBe(false);
  });

  it('leaves the field absent when there is no dim schedule (absent means true)', () => {
    const config = makeConfig(6);
    config.settings.sleep = { enabled: true, dimAfterMinutes: 10, sleepAfterMinutes: 0, dimBrightness: 20 };

    const { config: result } = migrateUp(config, 7);

    expect(result.settings.sleep).not.toHaveProperty('idleDimEnabled');
  });

  it('preserves an explicit value of either polarity', () => {
    const config = makeConfig(6);
    config.settings.sleep = { ...SLEEP_WITH_DIM_SCHEDULE, idleDimEnabled: true };

    const { config: result } = migrateUp(config, 7);

    expect(result.settings.sleep?.idleDimEnabled).toBe(true);
  });

  it('seeds per-display sleep overrides too', () => {
    const config = makeConfig(6);
    config.displays = [
      {
        id: 'kitchen',
        name: 'Kitchen',
        screens: [],
        settings: { sleep: { ...SLEEP_WITH_DIM_SCHEDULE } },
      },
    ];

    const { config: result } = migrateUp(config, 7);

    expect(result.displays![0].settings?.sleep?.idleDimEnabled).toBe(false);
  });

  it('passes display nodes without settings or sleep through untouched', () => {
    const config = makeConfig(6);
    config.displays = [
      { id: 'main', name: 'Main', screens: [] },
      { id: 'hall', name: 'Hall', screens: [], settings: {} },
    ];
    const before = structuredClone(config.displays);

    const { config: result } = migrateUp(config, 7);

    expect(result.displays).toEqual(before);
  });
});

describe('migration v8: multi-week theme and cap become grid-wide keys', () => {
  const STYLE = { opacity: 1, borderRadius: 12, padding: 16, backgroundColor: '', textColor: '#fff', fontFamily: 'Inter', fontSize: 16, backdropBlur: 0, borderWidth: 0, borderColor: '', shadowSize: 0 };
  type Module = ScreenConfiguration['screens'][number]['modules'][number];

  function calendar(id: string, config: Record<string, unknown>): Module {
    return { id, type: 'calendar', position: { x: 0, y: 0 }, size: { w: 500, h: 500 }, zIndex: 1, config, style: STYLE } as Module;
  }
  const moduleConfig = (config: ScreenConfiguration) => config.screens[0].modules[0].config as Record<string, unknown>;

  it('renames multiWeekTheme and multiWeekMaxEventsPerCell in place', () => {
    const config = makeConfig(7);
    config.screens[0].modules = [calendar('cal', { viewMode: 'multi-week', multiWeekTheme: 'clean', multiWeekMaxEventsPerCell: 8 })];

    const { config: result } = migrateUp(config, 8);

    expect(result.version).toBe(8);
    expect(moduleConfig(result)).toEqual({ viewMode: 'multi-week', gridTheme: 'clean', gridMaxEventsPerCell: 8 });
  });

  it('keeps a new key that is already set and only drops the old one', () => {
    const config = makeConfig(7);
    config.screens[0].modules = [calendar('cal', { multiWeekTheme: 'banner', gridTheme: 'minimal' })];

    const { config: result } = migrateUp(config, 8);

    expect(moduleConfig(result)).toEqual({ gridTheme: 'minimal' });
  });

  it('leaves calendar modules without the old keys untouched', () => {
    const config = makeConfig(7);
    config.screens[0].modules = [calendar('cal', { viewMode: 'month', gridTheme: 'vivid' })];
    const before = structuredClone(config.screens[0].modules[0]);

    const { config: result } = migrateUp(config, 8);

    expect(result.screens[0].modules[0]).toEqual(before);
  });

  it('migrates screens owned by displays too', () => {
    const config = makeConfig(7);
    config.displays = [
      {
        id: 'kitchen',
        name: 'Kitchen',
        displayWidth: 1080,
        displayHeight: 1920,
        screens: [{ id: 's1', name: 'Screen 1', backgroundImage: '', modules: [calendar('cal', { multiWeekTheme: 'vivid' })] }],
      },
    ] as ScreenConfiguration['displays'];

    const { config: result } = migrateUp(config, 8);

    expect(result.displays![0].screens[0].modules[0].config).toEqual({ gridTheme: 'vivid' });
  });

  it('passes a screen with no modules array through instead of throwing', () => {
    const config = makeConfig(7);
    (config.screens[0] as unknown as { modules: undefined }).modules = undefined;

    expect(() => migrateUp(config, 8)).not.toThrow();
  });
});

describe('migration v9: the retired fullscreen-calendar accent is cleared', () => {
  type Module = ScreenConfiguration['screens'][number]['modules'][number];
  const STYLE = { opacity: 1, borderRadius: 12, padding: 16, backgroundColor: '', textColor: '#fff', fontFamily: 'Inter', fontSize: 16, backdropBlur: 0, borderWidth: 0, borderColor: '', shadowSize: 0 };
  function fsCalendar(id: string, config: Record<string, unknown>): Module {
    return { id, type: 'fullscreen-calendar', position: { x: 0, y: 0 }, size: { w: 1080, h: 1920 }, zIndex: 1, config, style: STYLE } as Module;
  }
  function smallCalendar(id: string, config: Record<string, unknown>): Module {
    return { id, type: 'calendar', position: { x: 0, y: 0 }, size: { w: 500, h: 500 }, zIndex: 1, config, style: STYLE } as Module;
  }
  const moduleConfig = (config: ScreenConfiguration) => config.screens[0].modules[0].config as Record<string, unknown>;

  it('clears the retired default so the theme accent applies', () => {
    const config = makeConfig(8);
    config.screens[0].modules = [fsCalendar('fsc', { view: 'schedule', theme: 'aurora', accentColor: '#EA580C' })];

    const { config: result } = migrateUp(config, 9);

    expect(result.version).toBe(9);
    expect(moduleConfig(result)).toEqual({ view: 'schedule', theme: 'aurora', accentColor: '' });
  });

  it('matches the retired default regardless of hex case', () => {
    const config = makeConfig(8);
    config.screens[0].modules = [fsCalendar('fsc', { accentColor: '#ea580c' })];

    const { config: result } = migrateUp(config, 9);

    expect(moduleConfig(result).accentColor).toBe('');
  });

  it('keeps a color the user actually picked', () => {
    const config = makeConfig(8);
    config.screens[0].modules = [fsCalendar('fsc', { accentColor: '#ff0000' })];

    const { config: result } = migrateUp(config, 9);

    expect(moduleConfig(result).accentColor).toBe('#ff0000');
  });

  it('leaves an already-empty accent alone', () => {
    const config = makeConfig(8);
    config.screens[0].modules = [fsCalendar('fsc', { accentColor: '' })];
    const before = structuredClone(config.screens[0].modules[0]);

    const { config: result } = migrateUp(config, 9);

    expect(result.screens[0].modules[0]).toEqual(before);
  });

  it('leaves the small calendar module untouched', () => {
    // Only the fullscreen module's registry default changed; the `calendar`
    // module still ships a real accent hex of its own.
    const config = makeConfig(8);
    config.screens[0].modules = [smallCalendar('cal', { accentColor: '#EA580C' })];

    const { config: result } = migrateUp(config, 9);

    expect(moduleConfig(result).accentColor).toBe('#EA580C');
  });

  it('clears the retired amber default of the chore chart and meal planner too', () => {
    const config = makeConfig(8);
    config.screens[0].modules = [
      { ...fsCalendar('chores', { accentColor: '#F59E0B' }), type: 'fullscreen-chore-chart' } as Module,
      { ...fsCalendar('meals', { accentColor: '#f59e0b' }), type: 'fullscreen-meal-planner' } as Module,
      // The small chore chart keeps its own real default.
      { ...fsCalendar('small', { accentColor: '#f59e0b' }), type: 'chore-chart' } as Module,
    ];

    const { config: result } = migrateUp(config, 9);

    const accents = result.screens[0].modules.map((m) => (m.config as Record<string, unknown>).accentColor);
    expect(accents).toEqual(['', '', '#f59e0b']);
  });

  it('does not clear the calendar orange from a module whose default was amber', () => {
    // Each module type only sheds its own retired default.
    const config = makeConfig(8);
    config.screens[0].modules = [{ ...fsCalendar('meals', { accentColor: '#EA580C' }), type: 'fullscreen-meal-planner' } as Module];

    const { config: result } = migrateUp(config, 9);

    expect(moduleConfig(result).accentColor).toBe('#EA580C');
  });

  it('migrates screens owned by displays too', () => {
    const config = makeConfig(8);
    config.displays = [
      {
        id: 'kitchen',
        name: 'Kitchen',
        displayWidth: 1080,
        displayHeight: 1920,
        screens: [{ id: 's1', name: 'Screen 1', backgroundImage: '', modules: [fsCalendar('fsc', { accentColor: '#EA580C' })] }],
      },
    ] as ScreenConfiguration['displays'];

    const { config: result } = migrateUp(config, 9);

    expect((result.displays![0].screens[0].modules[0].config as Record<string, unknown>).accentColor).toBe('');
  });

  it('passes a screen with no modules array through instead of throwing', () => {
    const config = makeConfig(8);
    (config.screens[0] as unknown as { modules: undefined }).modules = undefined;

    expect(() => migrateUp(config, 9)).not.toThrow();
  });
});


describe('migration v10: news modules follow a list of feeds', () => {
  type Module = ScreenConfiguration['screens'][number]['modules'][number];
  const STYLE = { opacity: 1, borderRadius: 12, padding: 16, backgroundColor: '', textColor: '#fff', fontFamily: 'Inter', fontSize: 16, backdropBlur: 0, borderWidth: 0, borderColor: '', shadowSize: 0 };
  const BBC = 'https://feeds.bbci.co.uk/news/rss.xml';
  function news(id: string, config: Record<string, unknown>): Module {
    return { id, type: 'news', position: { x: 0, y: 0 }, size: { w: 500, h: 300 }, zIndex: 1, config, style: STYLE } as Module;
  }
  const moduleConfig = (config: ScreenConfiguration, i = 0) => config.screens[0].modules[i].config as Record<string, unknown>;

  it('turns feedUrl into a one-entry feeds list keyed off the module id', () => {
    const config = makeConfig(9);
    config.screens[0].modules = [news('n1', { feedUrl: 'https://example.com/rss', view: 'list', maxItems: 5 })];

    const { config: result } = migrateUp(config, 10);

    expect(result.version).toBe(10);
    expect(moduleConfig(result)).toEqual({
      view: 'list',
      maxItems: 5,
      feeds: [{ id: 'n1-feed-1', url: 'https://example.com/rss' }],
    });
  });

  it('trims the feedUrl and does not label a non-BBC feed', () => {
    const config = makeConfig(9);
    config.screens[0].modules = [news('n1', { feedUrl: '  https://example.com/rss \n' })];

    const { config: result } = migrateUp(config, 10);

    expect(moduleConfig(result).feeds).toEqual([{ id: 'n1-feed-1', url: 'https://example.com/rss' }]);
  });

  it('writes an empty feedUrl out as the BBC preset it used to stand for', () => {
    const config = makeConfig(9);
    config.screens[0].modules = [news('n1', { feedUrl: '' }), news('n2', { feedUrl: '   ' }), news('n3', {})];

    const { config: result } = migrateUp(config, 10);

    for (const i of [0, 1, 2]) {
      const cfg = moduleConfig(result, i);
      expect(cfg.feeds, `module ${i}`).toEqual([{ id: `n${i + 1}-feed-1`, url: BBC, label: 'BBC News' }]);
      expect('feedUrl' in cfg, `module ${i}`).toBe(false);
    }
  });

  it('labels an explicit BBC feedUrl as BBC News too', () => {
    const config = makeConfig(9);
    config.screens[0].modules = [news('n1', { feedUrl: BBC })];

    const { config: result } = migrateUp(config, 10);

    expect(moduleConfig(result).feeds).toEqual([{ id: 'n1-feed-1', url: BBC, label: 'BBC News' }]);
  });

  it('keeps an existing feeds list and drops a stray feedUrl next to it', () => {
    const feeds = [{ id: 'a', url: 'https://a.example.com/rss', label: 'A' }, { id: 'b', url: 'topic:parks' }];
    const config = makeConfig(9);
    config.screens[0].modules = [news('n1', { feeds, feedUrl: 'https://stale.example.com/rss', view: 'cards' })];

    const { config: result } = migrateUp(config, 10);

    expect(moduleConfig(result)).toEqual({ feeds, view: 'cards' });
  });

  it('leaves a module that already has feeds and no feedUrl untouched (same reference)', () => {
    const config = makeConfig(9);
    config.screens[0].modules = [news('n1', { feeds: [{ id: 'a', url: 'https://a.example.com/rss' }] })];

    const { config: result } = migrateUp(config, 10);

    expect(result.screens[0].modules[0]).toEqual(config.screens[0].modules[0]);
  });

  it('leaves non-news modules alone even when they carry a feedUrl', () => {
    const config = makeConfig(9);
    const other = { id: 'x', type: 'text', position: { x: 0, y: 0 }, size: { w: 1, h: 1 }, zIndex: 1, config: { feedUrl: 'https://x', content: 'hi' }, style: STYLE } as Module;
    config.screens[0].modules = [other];

    const { config: result } = migrateUp(config, 10);

    expect(result.screens[0].modules[0]).toEqual(other);
  });

  it('walks every display\'s own screens as well as the legacy top-level screens', () => {
    const config: ScreenConfiguration = {
      ...makeConfig(9),
      displays: [
        {
          id: 'kitchen', name: 'Kitchen', displayWidth: 1080, displayHeight: 1920,
          screens: [{ id: 'k1', name: 'K', modules: [news('kn', { feedUrl: 'https://kitchen.example.com/rss' })] } as ScreenConfiguration['screens'][number]],
        },
        { id: 'empty', name: 'Empty', displayWidth: 1080, displayHeight: 1920, screens: [] },
      ],
    };
    config.screens[0].modules = [news('top', { feedUrl: '' })];

    const { config: result } = migrateUp(config, 10);

    expect(moduleConfig(result).feeds).toEqual([{ id: 'top-feed-1', url: BBC, label: 'BBC News' }]);
    expect(result.displays?.[0].screens[0].modules[0].config).toEqual({
      feeds: [{ id: 'kn-feed-1', url: 'https://kitchen.example.com/rss' }],
    });
    expect(result.displays?.[1]).toEqual(config.displays?.[1]);
  });

  it('tolerates a news module with no config object', () => {
    const config = makeConfig(9);
    config.screens[0].modules = [{ ...news('n1', {}), config: undefined } as unknown as Module];

    expect(() => migrateUp(config, 10)).not.toThrow();
  });

  it('is part of the full chain from v1', () => {
    const config = makeConfig(1);
    config.screens[0].modules = [news('n1', { feedUrl: 'https://example.com/rss' })];

    const { config: result, migrationsRun } = migrateUp(config);

    expect(result.version).toBe(10);
    expect(migrationsRun.at(-1)).toMatch(/^v10: /);
    expect(moduleConfig(result).feeds).toEqual([{ id: 'n1-feed-1', url: 'https://example.com/rss' }]);
  });
});
