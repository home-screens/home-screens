import { describe, it, expect } from 'vitest';
import { buildBootstrapMain, buildNewDisplay, withProfiles, withActiveProfile, getActiveFullscreenTheme, getPatchedDisplayDimensions } from '@/lib/editor-multi-display';
import { filterConfigForDisplay } from '@/lib/display-filter';
import { resolveHubPanel } from '@/lib/kiosk';
import type {
  GlobalSettings,
  Profile,
  Screen,
  ScreenConfiguration,
  DisplayNode,
} from '@/types/config';

function makeSettings(overrides: Partial<GlobalSettings> = {}): GlobalSettings {
  return {
    rotationIntervalMs: 30000,
    displayWidth: 1080,
    displayHeight: 1920,
    latitude: 0,
    longitude: 0,
    weather: { provider: 'weatherapi', units: 'imperial' },
    calendar: {
      googleCalendarIds: [],
      icalSources: [],
      daysAhead: 7,
    },
    ...overrides,
  };
}

function makeScreen(id: string): Screen {
  return { id, name: id, backgroundImage: '', modules: [] };
}

function makeProfile(id: string, screenIds: string[] = []): Profile {
  return { id, name: id, screenIds };
}

function makeConfig(overrides: Partial<ScreenConfiguration> = {}): ScreenConfiguration {
  return {
    version: 3,
    settings: makeSettings(),
    screens: [],
    ...overrides,
  };
}

/* ─── withProfiles ─────────────────────────────────── */

describe('withProfiles', () => {
  it('mutates the global pool in legacy single-display mode', () => {
    const config = makeConfig({ profiles: [makeProfile('p1')] });
    const next = withProfiles(config, null, (profiles) => [...profiles, makeProfile('p2')]);
    expect(next.profiles!.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('treats an unset global pool as empty', () => {
    const config = makeConfig();
    const next = withProfiles(config, null, (profiles) => [...profiles, makeProfile('p1')]);
    expect(next.profiles!.map((p) => p.id)).toEqual(['p1']);
  });

  it('mutates the owning display list, leaving the global pool untouched', () => {
    const config = makeConfig({
      profiles: [makeProfile('pool')],
      displays: [
        {
          id: 'kitchen',
          name: 'Kitchen',
          screens: [makeScreen('k1')],
          profiles: [makeProfile('owned')],
        },
      ],
    });
    const next = withProfiles(config, 'kitchen', (profiles) =>
      profiles.filter((p) => p.id !== 'owned'),
    );
    expect(next.displays![0].profiles).toEqual([]);
    expect(next.profiles!.map((p) => p.id)).toEqual(['pool']);
  });

  it('falls back to the global pool when the selected display does not own profiles', () => {
    const display: DisplayNode = {
      id: 'kitchen',
      name: 'Kitchen',
      screens: [makeScreen('k1')],
      // no `profiles` field -> shared-pool display, targets the global pool
    };
    const config = makeConfig({ profiles: [makeProfile('pool')], displays: [display] });
    const next = withProfiles(config, 'kitchen', (profiles) => [...profiles, makeProfile('added')]);
    expect(next.profiles!.map((p) => p.id)).toEqual(['pool', 'added']);
    expect(next.displays![0]).toBe(display); // display node untouched
  });

  it('clearActiveProfile drops a matching activeProfile on the owning display', () => {
    const config = makeConfig({
      displays: [
        {
          id: 'kitchen',
          name: 'Kitchen',
          screens: [makeScreen('k1')],
          profiles: [makeProfile('day'), makeProfile('night')],
          activeProfile: 'day',
        },
      ],
    });
    const next = withProfiles(
      config,
      'kitchen',
      (profiles) => profiles.filter((p) => p.id !== 'day'),
      { clearActiveProfile: 'day' },
    );
    expect(next.displays![0].profiles!.map((p) => p.id)).toEqual(['night']);
    expect(next.displays![0].activeProfile).toBeUndefined();
  });

  it('clearActiveProfile preserves a non-matching activeProfile on the owning display', () => {
    const config = makeConfig({
      displays: [
        {
          id: 'kitchen',
          name: 'Kitchen',
          screens: [makeScreen('k1')],
          profiles: [makeProfile('day'), makeProfile('night')],
          activeProfile: 'night',
        },
      ],
    });
    const next = withProfiles(
      config,
      'kitchen',
      (profiles) => profiles.filter((p) => p.id !== 'day'),
      { clearActiveProfile: 'day' },
    );
    expect(next.displays![0].activeProfile).toBe('night');
  });

  it('clearActiveProfile in global mode clears settings and every sibling display', () => {
    const config = makeConfig({
      profiles: [makeProfile('shared'), makeProfile('other')],
      settings: makeSettings({ activeProfile: 'shared' }),
      displays: [
        // Shared-pool displays (no owned `profiles`) can reference the pool id.
        { id: 'a', name: 'A', screens: [makeScreen('a1')], activeProfile: 'shared' },
        { id: 'b', name: 'B', screens: [makeScreen('b1')], activeProfile: 'other' },
      ],
    });
    const next = withProfiles(
      config,
      null,
      (profiles) => profiles.filter((p) => p.id !== 'shared'),
      { clearActiveProfile: 'shared' },
    );
    expect(next.profiles!.map((p) => p.id)).toEqual(['other']);
    expect(next.settings.activeProfile).toBeUndefined();
    expect(next.displays![0].activeProfile).toBeUndefined();
    expect(next.displays![1].activeProfile).toBe('other');
  });
});

/* ─── withActiveProfile ────────────────────────────── */

describe('withActiveProfile', () => {
  it('writes to settings.activeProfile in legacy mode', () => {
    const config = makeConfig({ profiles: [makeProfile('p1')] });
    const next = withActiveProfile(config, null, 'p1');
    expect(next.settings.activeProfile).toBe('p1');
  });

  it('writes to the owning display in multi-display mode', () => {
    const config = makeConfig({
      displays: [
        {
          id: 'kitchen',
          name: 'Kitchen',
          screens: [makeScreen('k1')],
          profiles: [makeProfile('owned')],
        },
      ],
    });
    const next = withActiveProfile(config, 'kitchen', 'owned');
    expect(next.displays![0].activeProfile).toBe('owned');
    expect(next.settings.activeProfile).toBeUndefined();
  });

  it('clears with undefined', () => {
    const config = makeConfig({ settings: makeSettings({ activeProfile: 'p1' }) });
    const next = withActiveProfile(config, null, undefined);
    expect(next.settings.activeProfile).toBeUndefined();
  });
});

// Once a displays list exists the hub's touch matrix is read from its display
// and nowhere else, so both ways of creating that display must carry the
// single-display value across. Otherwise a calibrated touchscreen goes wrong
// the moment a second display is added.
describe('touch matrix when the displays list is created', () => {
  const matrix = [-1, 0, 1, 0, 1, 0];
  const config: ScreenConfiguration = { version: 1, settings: makeSettings({ touchMatrix: matrix }), screens: [makeScreen('s1')] } as ScreenConfiguration;

  it('moves onto a bootstrapped main', () => {
    expect(buildBootstrapMain(config).touchMatrix).toEqual(matrix);
  });

  it('moves onto main when main is the first display added, and not onto any other', () => {
    expect(buildNewDisplay({ id: 'main', name: 'Main' }, config, true).touchMatrix).toEqual(matrix);
    expect(buildNewDisplay({ id: 'kitchen', name: 'Kitchen' }, config, false)).not.toHaveProperty('touchMatrix');
  });

  it('is absent when nothing was set', () => {
    const plain = { ...config, settings: makeSettings() };
    expect(buildBootstrapMain(plain)).not.toHaveProperty('touchMatrix');
    expect(buildNewDisplay({ id: 'main', name: 'Main' }, plain, true)).not.toHaveProperty('touchMatrix');
  });

  it('Follow on the hub display is the answer, whatever the globals still hold', () => {
    const main = buildBootstrapMain(config);
    const followed = { ...config, displays: [{ ...main, touchMatrix: undefined }] };
    expect(resolveHubPanel(followed).touchMatrix).toBeNull();
    expect(resolveHubPanel({ ...config, displays: [main] }).touchMatrix).toEqual(matrix);
    expect(resolveHubPanel(config).touchMatrix).toEqual(matrix);
  });
});

/* ─── getActiveFullscreenTheme ─────────────────────── */

// The editor canvas previews a display's full-screen modules in this theme,
// so it has to be the one that display's wall paints with.
describe('getActiveFullscreenTheme', () => {
  const kitchen: DisplayNode = { id: 'kitchen', name: 'Kitchen', screens: [], settings: { fullscreenTheme: 'aurora' } };
  const hall: DisplayNode = { id: 'hall', name: 'Hall', screens: [] };
  const config = makeConfig({ settings: makeSettings({ fullscreenTheme: 'linen' }), displays: [kitchen, hall] });

  it('takes the selected display\'s own override', () => {
    expect(getActiveFullscreenTheme(config, 'kitchen')).toBe('aurora');
  });

  it('falls back to the shared default for a display without one, an unknown display, and single-display mode', () => {
    expect(getActiveFullscreenTheme(config, 'hall')).toBe('linen');
    expect(getActiveFullscreenTheme(config, 'gone')).toBe('linen');
    expect(getActiveFullscreenTheme(makeConfig({ settings: makeSettings({ fullscreenTheme: 'paper' }) }), null)).toBe('paper');
  });

  it('is undefined when neither is set, so each module keeps its own last resort', () => {
    expect(getActiveFullscreenTheme(makeConfig({ displays: [hall] }), 'hall')).toBeUndefined();
  });

  it('agrees with the settings every display\'s wall is given', () => {
    for (const display of config.displays!) {
      expect(getActiveFullscreenTheme(config, display.id)).toBe(filterConfigForDisplay(config, display.id)!.settings.fullscreenTheme);
    }
  });
});

/* ─── getPatchedDisplayDimensions ─────────────────────────────────── */

describe('getPatchedDisplayDimensions', () => {
  const porch: DisplayNode = {
    id: 'porch',
    name: 'Porch',
    screens: [],
    displayWidth: 1920,
    displayHeight: 1080,
    displayTransform: 'normal',
  };

  it('stands the canvas on its side for a rotation to portrait', () => {
    const config = makeConfig({ displays: [porch] });
    expect(getPatchedDisplayDimensions(config, 'porch', {
      displayTransform: '90', displayWidth: 1080, displayHeight: 1920,
    })).toEqual({ width: 1080, height: 1920 });
  });

  it('keeps a typed size in the rotation the display already declares', () => {
    const config = makeConfig({ displays: [{ ...porch, displayTransform: '90', displayWidth: 1080, displayHeight: 1920 }] });
    expect(getPatchedDisplayDimensions(config, 'porch', { displayWidth: 2160 }))
      .toEqual({ width: 1920, height: 2160 });
  });

  it('leaves the other displays alone', () => {
    const main: DisplayNode = { id: 'main', name: 'Main', screens: [], displayWidth: 1080, displayHeight: 1920 };
    const config = makeConfig({ displays: [main, porch] });
    getPatchedDisplayDimensions(config, 'porch', { displayTransform: '90' });
    expect(config.displays![1].displayTransform).toBe('normal');
  });
});
