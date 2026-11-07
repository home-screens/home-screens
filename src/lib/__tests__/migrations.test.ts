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
        units: 'imperial',
      },
      calendar: {
        googleCalendarIds: [],
        icalSources: [],
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

  it('getLatestSchemaVersion returns 19', () => {
    expect(getLatestSchemaVersion()).toBe(19);
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
    expect(result.version).toBe(19);
    // v2 through v18 run (v1 is the starting point, not re-applied).
    expect(migrationsRun).toHaveLength(18);
    // Legacy single-display shape is preserved untouched: v2 leaves non-flag
    // modules alone, v3/v4/v5 are pure version bumps, v6 only touches
    // next-view countdowns (this fixture has no modules at all), v7 only
    // touches sleep blocks with a dim schedule (this fixture has none), and
    // v8 only touches calendar modules carrying the prerelease keys, and v9
    // only touches fullscreen-calendar modules carrying the retired default
    // accent, v10 only touches news modules (this fixture has none), and v11
    // only touches screens on a `/backgrounds/themes/` wall (this one has
    // none), and v12 only rewrites a `dev` update channel (this one has none
    // set). v14 writes the 12-hour clock the household was already reading.
    // No display registry is injected: single-display mode stays single-display.
    expect(result.screens).toEqual(config.screens);
    expect(result.settings).toEqual({ ...config.settings, timeFormat: '12h' });
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

    expect(result.version).toBe(19);
    // Only v4 through v18 remain to run from a v3 config.
    expect(migrationsRun).toHaveLength(16);
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

    expect(result.version).toBe(getLatestSchemaVersion());
    expect(migrationsRun).toContainEqual(expect.stringMatching(/^v10: /));
    expect(moduleConfig(result).feeds).toEqual([{ id: 'n1-feed-1', url: 'https://example.com/rss' }]);
  });
});

describe('migration v11: starter backgrounds moved to /starter-backgrounds/', () => {
  it('repoints a screen on a shipped wall and leaves other backgrounds alone', () => {
    const config = makeConfig(10);
    config.screens = [
      { ...config.screens[0], id: 'a', backgroundImage: '/backgrounds/themes/dusk.svg' },
      { ...config.screens[0], id: 'b', backgroundImage: '/backgrounds/themes/theme-horizon.svg' },
      { ...config.screens[0], id: 'c', backgroundImage: '/api/backgrounds/serve?file=family.jpg' },
      { ...config.screens[0], id: 'd', backgroundImage: 'https://example.com/wall.jpg' },
      { ...config.screens[0], id: 'e', backgroundImage: '' },
    ];

    const { config: result } = migrateUp(config, 11);

    expect(result.version).toBe(11);
    expect(result.screens.map((s) => s.backgroundImage)).toEqual([
      '/starter-backgrounds/dusk.svg',
      '/starter-backgrounds/theme-horizon.svg',
      '/api/backgrounds/serve?file=family.jpg',
      'https://example.com/wall.jpg',
      '',
    ]);
  });

  it('leaves a user file under the old themes folder where it is', () => {
    // themes/ was a user folder too; only the shipped file names moved.
    const config = makeConfig(10);
    const own = { ...config.screens[0], id: 'own', backgroundImage: '/backgrounds/themes/family.jpg' };
    const nested = { ...config.screens[0], id: 'nested', backgroundImage: '/backgrounds/themes/christmas/clip.mp4' };
    const lookalike = { ...config.screens[0], id: 'look', backgroundImage: '/backgrounds/themes/dusk.svg.bak' };
    config.screens = [own, nested, lookalike];

    const { config: result } = migrateUp(config, 11);

    expect(result.screens).toEqual([own, nested, lookalike]);
  });

  it('walks every display\'s own screens as well as the legacy top-level screens', () => {
    const config: ScreenConfiguration = {
      ...makeConfig(10),
      displays: [
        {
          id: 'kitchen', name: 'Kitchen', displayWidth: 1080, displayHeight: 1920,
          screens: [{ ...makeConfig(10).screens[0], backgroundImage: '/backgrounds/themes/midnight.svg' }],
        },
      ],
    };

    const { config: result } = migrateUp(config, 11);

    expect(result.displays?.[0].screens[0].backgroundImage).toBe('/starter-backgrounds/midnight.svg');
  });

  it('keeps an untouched screen\'s identity and tolerates a missing backgroundImage', () => {
    const config = makeConfig(10);
    const untouched = { ...config.screens[0], id: 'x', backgroundImage: undefined as unknown as string };
    config.screens = [untouched];

    const { config: result } = migrateUp(config, 11);

    expect(result.screens[0]).toEqual(untouched);
  });

  it('is part of the full chain from v1', () => {
    const config = makeConfig(1);
    config.screens[0].backgroundImage = '/backgrounds/themes/plum.svg';

    const { config: result, migrationsRun } = migrateUp(config);

    expect(result.version).toBe(19);
    expect(migrationsRun).toContainEqual(expect.stringMatching(/^v11: /));
    expect(result.screens[0].backgroundImage).toBe('/starter-backgrounds/plum.svg');
  });
});

describe('migration v12: retired dev update channel renamed to rc', () => {
  it('rewrites a stored dev channel to rc', () => {
    const config = makeConfig(11);
    (config.settings as unknown as Record<string, unknown>).updateChannel = 'dev';

    const { config: result, migrationsRun } = migrateUp(config, 12);

    expect(result.version).toBe(12);
    expect(result.settings.updateChannel).toBe('rc');
    expect(migrationsRun).toEqual([expect.stringMatching(/^v12: /)]);
  });

  it('leaves every current channel value alone', () => {
    for (const channel of ['stable', 'rc', 'beta', 'nightly'] as const) {
      const config = makeConfig(11);
      config.settings.updateChannel = channel;
      const { config: result } = migrateUp(config, 12);
      expect(result.settings.updateChannel).toBe(channel);
    }
  });

  it('leaves a config with no channel set alone', () => {
    const config = makeConfig(11);
    const { config: result } = migrateUp(config, 12);
    expect(result.version).toBe(12);
    expect(result.settings).toEqual(config.settings);
    expect('updateChannel' in result.settings).toBe(false);
  });

  it('is part of the full chain from v1', () => {
    const config = makeConfig(1);
    (config.settings as unknown as Record<string, unknown>).updateChannel = 'dev';

    const { config: result, migrationsRun } = migrateUp(config);

    expect(result.version).toBe(19);
    expect(migrationsRun).toContainEqual(expect.stringMatching(/^v12: /));
    expect(migrationsRun.at(-1)).toMatch(/^v19: /);
    expect(result.settings.updateChannel).toBe('rc');
  });
});


describe('migration v13: preserve family inputs for the coordinated fold', () => {
  it('keeps legacy people and existing source mappings verbatim', () => {
    const config = makeConfig(12);
    const people = [{ id: 'calendar-alex', name: 'Alex', color: '#aabbcc', sourceIds: ['school'] }];
    const personSources = { 'family-alex': ['work'] };
    config.settings.calendar = { ...config.settings.calendar, people, personSources };
    const before = structuredClone(config);
    const { config: migrated } = migrateUp(config);
    expect(migrated.version).toBe(19);
    expect(migrated.settings.calendar.people).toEqual(people);
    expect(migrated.settings.calendar.personSources).toEqual(personSources);
    expect(config).toEqual(before);
  });
});

describe('migration v14: unset clock formats follow the language from here on', () => {
  function withClock(config: ScreenConfiguration, dateFormat: unknown): ScreenConfiguration {
    config.screens[0].modules = [{
      id: 'clock-1', type: 'clock', x: 0, y: 0, width: 400, height: 200,
      config: { view: 'classic', showDate: true, dateFormat }, style: {},
    } as unknown as ScreenConfiguration['screens'][number]['modules'][number]];
    return config;
  }

  it('writes 12h down for a household that never picked, so its clock does not change', () => {
    const { config: result, migrationsRun } = migrateUp(makeConfig(13), 14);
    expect(result.version).toBe(14);
    expect(result.settings.timeFormat).toBe('12h');
    expect(migrationsRun).toEqual([expect.stringMatching(/^v14: /)]);
  });

  it('keeps a choice the household made', () => {
    const config = makeConfig(13);
    config.settings.timeFormat = '24h';
    expect(migrateUp(config, 14).config.settings.timeFormat).toBe('24h');
  });

  it("clears a clock on the old English default date so it follows the language", () => {
    const { config: result } = migrateUp(withClock(makeConfig(13), 'EEEE, MMMM d'), 14);
    expect(result.screens[0].modules[0].config.dateFormat).toBe('');
  });

  it("keeps a clock's own pattern", () => {
    for (const pattern of ['d/M/yyyy', 'EEE, MMM d', '']) {
      const { config: result } = migrateUp(withClock(makeConfig(13), pattern), 14);
      expect(result.screens[0].modules[0].config.dateFormat).toBe(pattern);
    }
  });

  it("reaches clocks on a display's own screens", () => {
    const config = withClock(makeConfig(13), 'EEEE, MMMM d');
    config.displays = [{ id: 'main', name: 'Main', screens: structuredClone(config.screens) } as unknown as NonNullable<ScreenConfiguration['displays']>[number]];
    const { config: result } = migrateUp(config, 14);
    expect(result.displays?.[0].screens[0].modules[0].config.dateFormat).toBe('');
  });

  it('does not mutate its input', () => {
    const config = withClock(makeConfig(13), 'EEEE, MMMM d');
    const before = structuredClone(config);
    migrateUp(config, 14);
    expect(config).toEqual(before);
  });
});

describe('migration v15: the full-screen weather sky absorbs the falling rain and snow toggle', () => {
  function withWeather(config: ScreenConfiguration, cfg: Record<string, unknown>): ScreenConfiguration {
    config.screens[0].modules = [{
      id: 'fsw-1', type: 'fullscreen-weather', x: 0, y: 0, width: 1080, height: 1920,
      config: { view: 'panorama', ...cfg }, style: {},
    } as unknown as ScreenConfiguration['screens'][number]['modules'][number]];
    return config;
  }
  const migrated = (cfg: Record<string, unknown>) =>
    migrateUp(withWeather(makeConfig(14), cfg), 15).config.screens[0].modules[0].config as Record<string, unknown>;

  it('keeps motion for a module that had it: auto becomes living', () => {
    const result = migrated({ skyLayer: 'auto', animateConditions: true });
    expect(result.skyLayer).toBe('living');
    expect('animateConditions' in result).toBe(false);
  });

  it('keeps a module still whose household turned motion off', () => {
    expect(migrated({ skyLayer: 'auto', animateConditions: false }).skyLayer).toBe('still');
  });

  it('treats an unset toggle as motion on, the old default', () => {
    expect(migrated({ skyLayer: 'auto' }).skyLayer).toBe('living');
    expect(migrated({ animateConditions: true }).skyLayer).toBe('living');
  });

  it('leaves off alone and drops the toggle', () => {
    const result = migrated({ skyLayer: 'off', animateConditions: false });
    expect(result.skyLayer).toBe('off');
    expect('animateConditions' in result).toBe(false);
  });

  it('does not touch a module already on the new shape', () => {
    expect(migrated({ skyLayer: 'still' })).toEqual({ view: 'panorama', skyLayer: 'still' });
  });

  it("reaches modules on a display's own screens", () => {
    const config = withWeather(makeConfig(14), { skyLayer: 'auto', animateConditions: false });
    config.displays = [{ id: 'main', name: 'Main', screens: structuredClone(config.screens) } as unknown as NonNullable<ScreenConfiguration['displays']>[number]];
    const { config: result } = migrateUp(config, 15);
    expect(result.displays?.[0].screens[0].modules[0].config.skyLayer).toBe('still');
  });
});

describe('migration v16: the full-screen weather card toggles become one ordered list', () => {
  function withWeather(config: ScreenConfiguration, cfg: Record<string, unknown>): ScreenConfiguration {
    config.screens[0].modules = [{
      id: 'fsw-1', type: 'fullscreen-weather', x: 0, y: 0, width: 1080, height: 1920,
      config: cfg, style: {},
    } as unknown as ScreenConfiguration['screens'][number]['modules'][number]];
    return config;
  }
  const migrated = (cfg: Record<string, unknown>) =>
    migrateUp(withWeather(makeConfig(15), cfg), 16).config.screens[0].modules[0].config as Record<string, unknown>;

  it('keeps a Conditions page in its old order: air quality on top, wind and sunrise last', () => {
    expect(migrated({ view: 'conditions' }).cards).toEqual([
      'airQuality', 'moon', 'uv', 'feelsLike', 'precipitation', 'visibility', 'humidity', 'pressure', 'nowcast', 'wind', 'sun',
    ]);
  });

  it('keeps a Forecast page showing wind and sunrise under its map', () => {
    expect((migrated({ view: 'forecast' }).cards as string[]).slice(0, 2)).toEqual(['wind', 'sun']);
  });

  it('leaves a card off that was switched off, and drops the toggles', () => {
    const result = migrated({ view: 'conditions', showMoon: false, showWind: false, showAirQuality: true });
    expect(result.cards).not.toContain('moon');
    expect(result.cards).not.toContain('wind');
    expect(result.cards).toContain('airQuality');
    expect('showMoon' in result).toBe(false);
    expect('showWind' in result).toBe(false);
    expect('showAirQuality' in result).toBe(false);
  });

  it('reads the nowcast strip toggle for the nowcast card and keeps the toggle for Panorama', () => {
    const result = migrated({ view: 'conditions', showNowcast: false });
    expect(result.cards).not.toContain('nowcast');
    expect(result.showNowcast).toBe(false);
  });

  it('gives every other view the default list, every card on', () => {
    expect(migrated({ view: 'panorama' }).cards).toEqual([
      'wind', 'sun', 'airQuality', 'moon', 'uv', 'feelsLike', 'precipitation', 'visibility', 'humidity', 'pressure', 'nowcast',
    ]);
  });

  it('does not touch a module already on the new shape', () => {
    expect(migrated({ view: 'conditions', cards: ['moon'], showMoon: false })).toEqual({ view: 'conditions', cards: ['moon'], showMoon: false });
  });

  it("reaches modules on a display's own screens", () => {
    const config = withWeather(makeConfig(15), { view: 'forecast', showSun: false });
    config.displays = [{ id: 'main', name: 'Main', screens: structuredClone(config.screens) } as unknown as NonNullable<ScreenConfiguration['displays']>[number]];
    const { config: result } = migrateUp(config, 16);
    expect(result.displays?.[0].screens[0].modules[0].config.cards).not.toContain('sun');
  });
});

describe('migration v17: the superseded fields are retired', () => {
  type AnyModule = ScreenConfiguration['screens'][number]['modules'][number];
  type AnySettings = Record<string, unknown>;
  function legacy(settings: AnySettings = {}, modules: Array<{ type: string; config: Record<string, unknown>; style?: Record<string, unknown> }> = []): ScreenConfiguration {
    const config = makeConfig(16);
    config.settings = { ...config.settings, ...settings } as unknown as ScreenConfiguration['settings'];
    config.screens[0].modules = modules.map((m, i) => ({
      id: `m-${i}`, type: m.type, x: 0, y: 0, width: 400, height: 200, config: m.config, style: m.style ?? {},
    })) as unknown as AnyModule[];
    return config;
  }
  const settingsOf = (config: ScreenConfiguration) => migrateUp(config, 17).config.settings as unknown as AnySettings;
  const moduleOf = (config: ScreenConfiguration, i = 0) => migrateUp(config, 17).config.screens[0].modules[i];

  it('copies the weather location up only where the household pair is absent, and removes the copy', () => {
    const copied = settingsOf(legacy({ latitude: undefined, longitude: undefined, weather: { provider: 'open-meteo', latitude: 44.7, longitude: -93.4, units: 'imperial' } }));
    expect(copied.latitude).toBe(44.7);
    expect(copied.longitude).toBe(-93.4);
    expect(copied.weather).toEqual({ provider: 'open-meteo', units: 'imperial' });

    const kept = settingsOf(legacy({ latitude: 0, longitude: 0, weather: { provider: 'open-meteo', latitude: 44.7, longitude: -93.4, units: 'imperial' } }));
    expect(kept.latitude).toBe(0);
    expect(kept.weather).toEqual({ provider: 'open-meteo', units: 'imperial' });
  });

  it('lists the single Google calendar where the list is empty, and removes the field', () => {
    const listed = settingsOf(legacy({ calendar: { googleCalendarId: 'old@example.com', googleCalendarIds: [], icalSources: [], daysAhead: 7 } }));
    expect(listed.calendar).toEqual({ googleCalendarIds: ['old@example.com'], icalSources: [], daysAhead: 7 });

    const kept = settingsOf(legacy({ calendar: { googleCalendarId: 'old@example.com', googleCalendarIds: ['a'], icalSources: [], daysAhead: 7 } }));
    expect((kept.calendar as AnySettings).googleCalendarIds).toEqual(['a']);
    expect('googleCalendarId' in (kept.calendar as AnySettings)).toBe(false);
  });

  it('pins a clock without hourFormat to what its toggle showed, and drops the toggle everywhere', () => {
    const config = legacy({}, [
      { type: 'clock', config: { view: 'classic', format24h: true } },
      { type: 'clock', config: { view: 'classic', format24h: false } },
      { type: 'clock', config: { view: 'classic', format24h: true, hourFormat: 'inherit' } },
    ]);
    expect(moduleOf(config, 0).config).toEqual({ view: 'classic', hourFormat: '24h' });
    expect(moduleOf(config, 1).config).toEqual({ view: 'classic', hourFormat: '12h' });
    expect(moduleOf(config, 2).config).toEqual({ view: 'classic', hourFormat: 'inherit' });
  });

  it('writes the weather placement a calendar read from showWeather, and drops the toggle', () => {
    const config = legacy({}, [
      { type: 'fullscreen-calendar', config: { view: 'schedule', showWeather: false } },
      { type: 'fullscreen-calendar', config: { view: 'schedule', showWeather: true } },
      { type: 'fullscreen-calendar', config: { view: 'schedule', showWeather: false, weatherPlacement: 'days' } },
    ]);
    expect(moduleOf(config, 0).config).toEqual({ view: 'schedule', weatherPlacement: 'off' });
    expect(moduleOf(config, 1).config).toEqual({ view: 'schedule', weatherPlacement: 'header' });
    expect(moduleOf(config, 2).config).toEqual({ view: 'schedule', weatherPlacement: 'days' });
  });

  it('writes a theme only where darkMode picked the other palette and nothing else was deciding', () => {
    const config = legacy({}, [
      { type: 'fullscreen-chore-chart', config: { view: 'chores', darkMode: true } },
      { type: 'fullscreen-chore-chart', config: { view: 'chores', darkMode: false } },
      { type: 'fullscreen-calendar', config: { view: 'schedule', darkMode: false } },
      { type: 'fullscreen-calendar', config: { view: 'schedule', darkMode: true } },
      { type: 'fullscreen-calendar', config: { view: 'schedule', darkMode: true, theme: 'mist' } },
      { type: 'fullscreen-chore-chart', config: { view: 'chores' } },
    ]);
    expect(moduleOf(config, 0).config).toEqual({ view: 'chores' });
    expect(moduleOf(config, 1).config).toEqual({ view: 'chores', theme: 'linen' });
    expect(moduleOf(config, 2).config).toEqual({ view: 'schedule' });
    expect(moduleOf(config, 3).config).toEqual({ view: 'schedule', theme: 'charcoal' });
    expect(moduleOf(config, 4).config).toEqual({ view: 'schedule', theme: 'mist' });
    expect(moduleOf(config, 5).config).toEqual({ view: 'chores' });
  });

  it('leaves a module that inherits a display theme inheriting it', () => {
    const shared = legacy({ fullscreenTheme: 'slate' }, [{ type: 'fullscreen-chore-chart', config: { view: 'chores', darkMode: false } }]);
    expect(moduleOf(shared).config).toEqual({ view: 'chores' });

    const perDisplay = legacy({}, [{ type: 'fullscreen-chore-chart', config: { view: 'chores', darkMode: false } }]);
    perDisplay.displays = [
      { id: 'main', name: 'Main', settings: { fullscreenTheme: 'slate' }, screens: structuredClone(perDisplay.screens) },
      { id: 'kitchen', name: 'Kitchen', screens: structuredClone(perDisplay.screens) },
    ] as unknown as NonNullable<ScreenConfiguration['displays']>;
    const { config: result } = migrateUp(perDisplay, 17);
    expect(result.displays?.[0].screens[0].modules[0].config).toEqual({ view: 'chores' });
    expect(result.displays?.[1].screens[0].modules[0].config).toEqual({ view: 'chores', theme: 'linen' });
  });

  it('rewrites the raw font stacks older pickers stored to registry ids, and keeps any other stack', () => {
    const config = legacy({}, [
      { type: 'clock', config: { view: 'classic', hourFormat: 'inherit' }, style: { fontFamily: 'monospace' } },
      { type: 'text', config: { text: 'hi', fontFamily: 'Inter, system-ui, sans-serif' }, style: { fontFamily: 'Georgia, serif' } },
      { type: 'text', config: { text: 'hi', fontFamily: 'Comic Sans MS, cursive' }, style: { fontFamily: 'playfair' } },
    ]);
    expect(moduleOf(config, 0).style.fontFamily).toBe('mono');
    expect(moduleOf(config, 1).style.fontFamily).toBe('georgia');
    expect(moduleOf(config, 1).config.fontFamily).toBe('inter');
    expect(moduleOf(config, 2).config.fontFamily).toBe('Comic Sans MS, cursive');
    expect(moduleOf(config, 2).style.fontFamily).toBe('playfair');
  });

  it('is a structural no-op for a config already on the new shape', () => {
    const config = legacy({}, [{ type: 'clock', config: { view: 'classic', hourFormat: 'inherit' }, style: { fontFamily: 'inter' } }]);
    const { config: result } = migrateUp(config, 17);
    expect(result.screens[0].modules[0]).toBe(result.screens[0].modules[0]);
    expect(result.screens[0].modules[0].config).toEqual({ view: 'classic', hourFormat: 'inherit' });
    expect(result.settings).toEqual(config.settings);
  });

  it('does not mutate its input', () => {
    const config = legacy({ calendar: { googleCalendarId: 'x', googleCalendarIds: [], icalSources: [], daysAhead: 7 } }, [{ type: 'clock', config: { view: 'classic', format24h: true } }]);
    const before = structuredClone(config);
    migrateUp(config, 17);
    expect(config).toEqual(before);
  });
});

describe('migration v18: photo modules and background rotation name their sources with PhotoSource', () => {
  type Module = ScreenConfiguration['screens'][number]['modules'][number];
  function withModule(config: ScreenConfiguration, type: string, cfg: unknown): ScreenConfiguration {
    config.screens[0].modules = [{
      id: 'photo-1', type, x: 0, y: 0, width: 1080, height: 1920, config: cfg, style: {},
    } as unknown as Module];
    return config;
  }
  const migratedModule = (cfg: Record<string, unknown>, type = 'photo-slideshow') =>
    migrateUp(withModule(makeConfig(17), type, cfg), 18).config.screens[0].modules[0].config as Record<string, unknown>;
  const migratedRotation = (rotation: unknown) => {
    const config = makeConfig(17);
    (config.screens[0] as unknown as Record<string, unknown>).backgroundRotation = rotation;
    return migrateUp(config, 18).config.screens[0].backgroundRotation as unknown as Record<string, unknown>;
  };
  const OLD_FIELDS = [
    'source', 'directory', 'immichAlbumId', 'immichPersonId', 'immichFavoritesOnly', 'immichCount',
    'icloudAlbumUrl', 'onedriveFolderId', 'onedriveFolderName', 'onedriveCount',
  ];
  const serve = (file: string) => `/api/backgrounds/serve?file=${encodeURIComponent(file)}`;

  describe.each(['photo-slideshow', 'fullscreen-photo'])('%s', (type) => {
    it('reads a missing or local source as its library folder', () => {
      expect(migratedModule({ directory: 'trips', intervalMs: 5000 }, type))
        .toEqual({ photoSource: { kind: 'library', folder: 'trips' }, intervalMs: 5000 });
      expect(migratedModule({ source: 'local', directory: 'trips' }, type).photoSource).toEqual({ kind: 'library', folder: 'trips' });
      expect(migratedModule({ source: 'local' }, type).photoSource).toEqual({ kind: 'library', folder: '' });
    });

    it('plays the library folder for an unknown source, as the module did', () => {
      expect(migratedModule({ source: 'dropbox', directory: 'x' }, type).photoSource).toEqual({ kind: 'library', folder: 'x' });
    });

    it('drops the slashes the library never accepted around a folder', () => {
      expect(migratedModule({ directory: '/photos/' }, type).photoSource).toEqual({ kind: 'library', folder: 'photos' });
    });

    it('moves the Immich filters into lists and the count, leaving out the ones not set', () => {
      expect(migratedModule({
        source: 'immich', directory: 'ignored', immichAlbumId: 'abc', immichPersonId: 'def', immichFavoritesOnly: true, immichCount: 120,
      }, type)).toEqual({ photoSource: { kind: 'immich', albumIds: ['abc'], personIds: ['def'], favoritesOnly: true }, count: 120 });
      expect(migratedModule({ source: 'immich', immichFavoritesOnly: false }, type)).toEqual({ photoSource: { kind: 'immich' } });
    });

    it('moves the iCloud link', () => {
      expect(migratedModule({ source: 'icloud', icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#B0aG' }, type))
        .toEqual({ photoSource: { kind: 'icloud', albumUrl: 'https://www.icloud.com/sharedalbum/#B0aG' } });
      expect(migratedModule({ source: 'icloud' }, type).photoSource).toEqual({ kind: 'icloud', albumUrl: '' });
    });

    it('moves the OneDrive folder, its name and its count', () => {
      expect(migratedModule({ source: 'onedrive', onedriveFolderId: 'ABC!12', onedriveFolderName: 'Family', onedriveCount: 80 }, type))
        .toEqual({ photoSource: { kind: 'onedrive', folderId: 'ABC!12', folderName: 'Family' }, count: 80 });
    });

    it('keeps only the count of the source in use', () => {
      expect(migratedModule({ source: 'local', immichCount: 120, onedriveCount: 80 }, type)).toEqual({ photoSource: { kind: 'library', folder: '' } });
    });

    it('removes every old field and keeps the rest of the config', () => {
      const result = migratedModule({
        source: 'onedrive', directory: 'a', immichAlbumId: 'abc', immichPersonId: 'def', immichFavoritesOnly: true, immichCount: 1,
        icloudAlbumUrl: 'x', onedriveFolderId: 'F!1', onedriveFolderName: 'n', onedriveCount: 2, mediaTypes: 'both', objectFit: 'contain',
      }, type);
      for (const field of OLD_FIELDS) expect(field in result).toBe(false);
      expect(result.mediaTypes).toBe('both');
      expect(result.objectFit).toBe('contain');
    });

    it('does not touch a module already on the new shape', () => {
      const cfg = { photoSource: { kind: 'nasa' }, directory: 'left-alone' };
      expect(migratedModule(cfg, type)).toEqual(cfg);
    });

    it('turns a photoSource written with a single Immich album or person into lists', () => {
      expect(migratedModule({ photoSource: { kind: 'immich', albumId: 'abc', personId: 'def', favoritesOnly: true }, count: 10 }, type))
        .toEqual({ photoSource: { kind: 'immich', albumIds: ['abc'], personIds: ['def'], favoritesOnly: true }, count: 10 });
      const listed = { photoSource: { kind: 'immich', albumIds: ['abc'] } };
      expect(migratedModule(listed, type)).toEqual(listed);
    });
  });

  it("keeps Full-screen Photo's single picture", () => {
    expect(migratedModule({ directory: 'trips', file: serve('trips/a.jpg') }, 'fullscreen-photo'))
      .toEqual({ photoSource: { kind: 'library', folder: 'trips' }, file: serve('trips/a.jpg') });
  });

  it('leaves other module types and malformed configs alone', () => {
    expect(migratedModule({ directory: 'x', source: 'immich' }, 'iframe')).toEqual({ directory: 'x', source: 'immich' });
    const config = withModule(makeConfig(17), 'photo-slideshow', 'not an object');
    expect(migrateUp(config, 18).config.screens[0].modules[0].config).toBe('not an object');
  });

  describe('background rotation with one source id', () => {
    it('reads a missing source as an Unsplash search, keeping its words, and a switched-off one as no sources', () => {
      expect(migratedRotation({ enabled: true, query: 'mountains', intervalMinutes: 30 }))
        .toEqual({ intervalMinutes: 30, sources: [{ kind: 'unsplash', query: 'mountains' }] });
      expect(migratedRotation({ enabled: false, source: 'unsplash', query: 'x', intervalMinutes: 60 }))
        .toEqual({ intervalMinutes: 60, sources: [] });
    });

    it('turns NASA APOD into the nasa source and drops its unused words', () => {
      expect(migratedRotation({ enabled: true, source: 'nasa-apod', query: '', intervalMinutes: 240 }))
        .toEqual({ intervalMinutes: 240, sources: [{ kind: 'nasa' }] });
    });

    it('moves the Immich filters into lists', () => {
      expect(migratedRotation({
        enabled: true, source: 'immich', query: '', intervalMinutes: 60, immichAlbumId: 'abc', immichPersonId: 'def', immichFavoritesOnly: true,
      })).toEqual({ intervalMinutes: 60, sources: [{ kind: 'immich', albumIds: ['abc'], personIds: ['def'], favoritesOnly: true }] });
    });

    it('moves the iCloud link', () => {
      expect(migratedRotation({ enabled: true, source: 'icloud', query: '', intervalMinutes: 60, icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#B0' }))
        .toEqual({ intervalMinutes: 60, sources: [{ kind: 'icloud', albumUrl: 'https://www.icloud.com/sharedalbum/#B0' }] });
    });

    it('falls back to an hourly interval when the saved one is not a number', () => {
      expect(migratedRotation({ enabled: true, source: 'nasa-apod', query: '' }).intervalMinutes).toBe(60);
    });
  });

  describe('background rotation with a list of source ids', () => {
    const flat = {
      enabled: true, intervalMinutes: 45, query: 'forest',
      unsplashMode: 'collections', unsplashCollections: ['abc123', '', '  '],
      unsplashImages: [serve('rotation-unsplash-pick-ph0t0.jpg')],
      immichAlbumIds: ['al-1', 'al-2'], immichPersonIds: ['pe-1'], immichPersonIdsExclude: ['pe-9'], immichFavoritesOnly: true,
      immichMode: 'pick', immichImages: [serve('rotation-immich-pick-as-1.webp'), serve('rotation-immich-pick-as-2.jpg')],
      icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#B0',
      localMode: 'images', localImages: [serve('walls/a.jpg'), serve('b.png')], localFolder: '/walls/',
      starterBackgroundIds: { color: ['ocean', 'not-a-wall'], pattern: [] },
    };

    it('writes one entry per ticked source, from the flat fields, in the ticked order', () => {
      expect(migratedRotation({ ...flat, sources: ['unsplash', 'nasa-apod', 'immich', 'icloud', 'local', 'color', 'pattern'] })).toEqual({
        intervalMinutes: 45,
        sources: [
          { kind: 'unsplash', query: 'forest', collections: ['abc123'], photoIds: ['ph0t0'] },
          { kind: 'nasa' },
          { kind: 'immich', albumIds: ['al-1', 'al-2'], personIds: ['pe-1'], excludePersonIds: ['pe-9'], favoritesOnly: true, assetIds: ['as-1', 'as-2'] },
          { kind: 'icloud', albumUrl: 'https://www.icloud.com/sharedalbum/#B0' },
          { kind: 'library', folder: '', pictures: ['walls/a.jpg', 'b.png'] },
          { kind: 'wall', group: 'color', ids: ['ocean'] },
          // A ticked group with nothing picked meant the whole group.
          { kind: 'wall', group: 'pattern', ids: ['pattern-dots', 'pattern-grid', 'pattern-diagonal', 'pattern-paper'] },
        ],
      });
    });

    it('keeps the Immich filters and the library folder when their picture modes are off, and drops collections in words mode', () => {
      const result = migratedRotation({
        ...flat, sources: ['unsplash', 'immich', 'local'], unsplashMode: 'query', immichMode: 'filters', localMode: 'folder',
      });
      expect(result.sources).toEqual([
        { kind: 'unsplash', query: 'forest', photoIds: ['ph0t0'] },
        { kind: 'immich', albumIds: ['al-1', 'al-2'], personIds: ['pe-1'], excludePersonIds: ['pe-9'], favoritesOnly: true },
        { kind: 'library', folder: 'walls' },
      ]);
    });

    it('reads a singular Immich album or person and a missing wall list', () => {
      expect(migratedRotation({ enabled: true, sources: ['immich', 'color'], intervalMinutes: 60, immichAlbumId: 'one', immichPersonId: 'two' }).sources)
        .toEqual([
          { kind: 'immich', albumIds: ['one'], personIds: ['two'] },
          { kind: 'wall', group: 'color', ids: ['midnight', 'dusk', 'forest', 'deep-blue', 'charcoal', 'sunrise', 'plum', 'aurora', 'ocean', 'ember', 'ink', 'moss', 'copper', 'lavender', 'cloud', 'sand', 'sage', 'blush'] },
        ]);
    });

    it('drops the retired theme id and anything unknown', () => {
      expect(migratedRotation({ enabled: true, sources: ['theme', 'dropbox', 'nasa-apod'], query: '', intervalMinutes: 60 }).sources)
        .toEqual([{ kind: 'nasa' }]);
    });

    it('rotates Unsplash for an "on" rotation whose list is empty or all retired, as the hub did', () => {
      expect(migratedRotation({ enabled: true, sources: [], query: 'lakes', intervalMinutes: 60 }).sources)
        .toEqual([{ kind: 'unsplash', query: 'lakes' }]);
      expect(migratedRotation({ enabled: true, sources: ['theme'], query: 'lakes', intervalMinutes: 60 }).sources)
        .toEqual([{ kind: 'unsplash', query: 'lakes' }]);
    });

    it('empties a switched-off list, and a list with nothing ticked and no "on" flag', () => {
      expect(migratedRotation({ enabled: false, sources: ['unsplash', 'color'], query: 'x', intervalMinutes: 60 }).sources).toEqual([]);
      expect(migratedRotation({ sources: [], query: 'x', intervalMinutes: 60 }).sources).toEqual([]);
    });
  });

  describe('background rotation with one photoSource', () => {
    it('wraps the source in a one-entry list, with Immich singulars as lists', () => {
      expect(migratedRotation({ enabled: true, intervalMinutes: 60, photoSource: { kind: 'immich', albumId: 'abc' } }))
        .toEqual({ intervalMinutes: 60, sources: [{ kind: 'immich', albumIds: ['abc'] }] });
    });

    it('empties the list for a switched-off rotation', () => {
      expect(migratedRotation({ enabled: false, intervalMinutes: 60, photoSource: { kind: 'nasa' } }))
        .toEqual({ intervalMinutes: 60, sources: [] });
    });

    it('prefers the photoSource over an empty list of ids beside it', () => {
      expect(migratedRotation({ enabled: true, sources: [], intervalMinutes: 60, photoSource: { kind: 'unsplash', query: 'nature landscape' } }))
        .toEqual({ intervalMinutes: 60, sources: [{ kind: 'unsplash', query: 'nature landscape' }] });
    });
  });

  describe('the household rotations', () => {
    it('A7: on, nothing ticked, an Unsplash photoSource', () => {
      expect(migratedRotation({ enabled: true, sources: [], intervalMinutes: 60, photoSource: { kind: 'unsplash', query: 'nature landscape' } }))
        .toEqual({ intervalMinutes: 60, sources: [{ kind: 'unsplash', query: 'nature landscape' }] });
      expect(migratedRotation({ enabled: true, intervalMinutes: 60, sources: [], photoSource: { kind: 'unsplash', query: 'nature landscape' } }))
        .toEqual({ intervalMinutes: 60, sources: [{ kind: 'unsplash', query: 'nature landscape' }] });
    });

    it('Scratch: three ids ticked beside a photoSource, with an empty collection id', () => {
      // The bare Unsplash tick takes the words of the photoSource beside it.
      expect(migratedRotation({
        sources: ['unsplash', 'nasa-apod', 'local'], intervalMinutes: 60, unsplashMode: 'query', unsplashCollections: [''],
        photoSource: { kind: 'unsplash', query: 'nature landscape' },
      })).toEqual({
        intervalMinutes: 60,
        sources: [{ kind: 'unsplash', query: 'nature landscape' }, { kind: 'nasa' }, { kind: 'library', folder: '' }],
      });
    });
  });

  it('does not touch a rotation already on the list shape, or one that is not an object', () => {
    const current = { intervalMinutes: 60, sources: [{ kind: 'library', folder: 'walls' }, { kind: 'wall', group: 'color', ids: ['ocean'] }] };
    expect(migratedRotation(current)).toEqual(current);
    expect(migratedRotation('broken')).toBe('broken');
  });

  it('changes nothing on a second run', () => {
    const config = withModule(makeConfig(17), 'photo-slideshow', { source: 'immich', immichAlbumId: 'abc', immichCount: 20 });
    (config.screens[0] as unknown as Record<string, unknown>).backgroundRotation = {
      enabled: true, sources: ['unsplash', 'color'], query: 'x', intervalMinutes: 60, starterBackgroundIds: { color: ['ocean'] },
    };
    const once = migrateUp(config, 18).config;
    const twice = migrateUp({ ...structuredClone(once), version: 17 }, 18).config;
    expect(twice).toEqual(once);
  });

  it('leaves a screen with no rotation as it was', () => {
    const config = makeConfig(17);
    const { config: result } = migrateUp(config, 18);
    expect(result.screens).toEqual(config.screens);
  });

  it("reaches modules and rotations on a display's own screens, and passes a display without screens", () => {
    const config = withModule(makeConfig(17), 'photo-slideshow', { source: 'immich', immichAlbumId: 'abc' });
    (config.screens[0] as unknown as Record<string, unknown>).backgroundRotation = { enabled: true, source: 'nasa-apod', query: '', intervalMinutes: 60 };
    config.displays = [
      { id: 'main', name: 'Main', screens: structuredClone(config.screens) },
      { id: 'odd', name: 'Odd' },
    ] as unknown as NonNullable<ScreenConfiguration['displays']>;
    const { config: result } = migrateUp(config, 18);
    const shown = result.displays![0].screens[0];
    expect(shown.modules[0].config).toEqual({ photoSource: { kind: 'immich', albumIds: ['abc'] } });
    expect(shown.backgroundRotation).toEqual({ intervalMinutes: 60, sources: [{ kind: 'nasa' }] });
    expect(result.displays![1]).toEqual({ id: 'odd', name: 'Odd' });
    // The frozen top-level copy follows too.
    expect(result.screens[0].modules[0].config).toEqual({ photoSource: { kind: 'immich', albumIds: ['abc'] } });
  });

  it('does not mutate its input', () => {
    const config = withModule(makeConfig(17), 'photo-slideshow', { source: 'immich', immichAlbumId: 'abc' });
    (config.screens[0] as unknown as Record<string, unknown>).backgroundRotation = { enabled: true, sources: ['color'], query: '', intervalMinutes: 60 };
    const before = structuredClone(config);
    migrateUp(config, 18);
    expect(config).toEqual(before);
  });

  it('is part of the full chain from v1', () => {
    const config = withModule(makeConfig(1), 'photo-slideshow', { source: 'local', directory: 'trips' });
    const { config: result, migrationsRun } = migrateUp(config);
    expect(migrationsRun.at(-1)).toMatch(/^v19: /);
    expect(result.screens[0].modules[0].config).toEqual({ photoSource: { kind: 'library', folder: 'trips' } });
  });
});

describe('migration v19: open buttons and screens that show only when opened', () => {
  function withModule(config: ScreenConfiguration, type: string, cfg: unknown): ScreenConfiguration {
    config.screens[0].modules = [{
      id: 'meals-1', type, position: { x: 0, y: 0 }, size: { w: 500, h: 400 }, zIndex: 1, config: cfg, style: {},
    } as unknown as ScreenConfiguration['screens'][number]['modules'][number]];
    return config;
  }

  it('bumps the version and changes nothing else', () => {
    const config = withModule(makeConfig(18), 'meal-planner', { view: 'week' });
    const before = structuredClone(config);
    const { config: result, migrationsRun } = migrateUp(config, 19);
    expect(migrationsRun).toEqual(['v19: Open buttons on modules; screens that show only when opened']);
    expect(result).toEqual({ ...before, version: 19 });
    expect(config).toEqual(before);
  });

  it('keeps a v19 config with the new fields verbatim', () => {
    const config = withModule(makeConfig(19), 'meal-planner', { view: 'week' });
    config.screens[0].modules[0].openButtonScreen = 'recipes';
    config.screens.push({ id: 'recipes', name: 'Recipe Book', backgroundImage: '', modules: [], rotation: 'opened', goBackAfterMs: 60_000 });
    const before = structuredClone(config);
    expect(migrateUp(config).config).toEqual(before);
  });
});
