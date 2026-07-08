import { describe, it, expect } from 'vitest';
import { withProfiles, withActiveProfile } from '@/lib/editor-multi-display';
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
    weather: { provider: 'weatherapi', latitude: 0, longitude: 0, units: 'imperial' },
    calendar: {
      googleCalendarId: '',
      googleCalendarIds: [],
      icalSources: [],
      maxEvents: 10,
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
