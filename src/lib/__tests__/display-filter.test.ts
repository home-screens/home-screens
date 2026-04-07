import { describe, it, expect } from 'vitest';
import { filterConfigForDisplay, validateDisplays } from '@/lib/display-filter';
import type {
  GlobalSettings,
  Profile,
  Screen,
  ScreenConfiguration,
  DisplayNode,
  SleepSettings,
} from '@/types/config';

/** Minimal valid GlobalSettings — only the fields the filter touches. */
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

function makeScreen(id: string, name?: string): Screen {
  return { id, name: name ?? id, backgroundImage: '', modules: [] };
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

/* ─── filterConfigForDisplay ─────────────────────── */

describe('filterConfigForDisplay', () => {
  it('returns null for an unknown display ID', () => {
    const config = makeConfig({
      screens: [makeScreen('s1')],
      displays: [{ id: 'kitchen', name: 'Kitchen', screenIds: ['s1'] }],
    });
    expect(filterConfigForDisplay(config, 'bedroom')).toBeNull();
  });

  it('returns null when no displays array exists at all (legacy mode)', () => {
    const config = makeConfig({ screens: [makeScreen('s1')] });
    expect(filterConfigForDisplay(config, 'kitchen')).toBeNull();
  });

  it('filters screens to those listed in display.screenIds', () => {
    const config = makeConfig({
      screens: [makeScreen('s1'), makeScreen('s2'), makeScreen('s3')],
      displays: [{ id: 'kitchen', name: 'Kitchen', screenIds: ['s1', 's3'] }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.screens.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('preserves config.screens order, not display.screenIds order', () => {
    // Documents the actual behavior (Array.filter walks config.screens) so
    // a future refactor doesn't accidentally change ordering semantics.
    const config = makeConfig({
      screens: [makeScreen('s1'), makeScreen('s2'), makeScreen('s3')],
      displays: [{ id: 'kitchen', name: 'Kitchen', screenIds: ['s3', 's1'] }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.screens.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('returns all profiles when display.profileIds is undefined', () => {
    const config = makeConfig({
      screens: [makeScreen('s1')],
      profiles: [makeProfile('day'), makeProfile('night')],
      displays: [{ id: 'kitchen', name: 'Kitchen', screenIds: ['s1'] }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.profiles?.map((p) => p.id)).toEqual(['day', 'night']);
  });

  it('filters profiles when display.profileIds is set', () => {
    const config = makeConfig({
      screens: [makeScreen('s1')],
      profiles: [makeProfile('day'), makeProfile('night'), makeProfile('weekend')],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screenIds: ['s1'],
        profileIds: ['day', 'weekend'],
      }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.profiles?.map((p) => p.id)).toEqual(['day', 'weekend']);
  });

  it('shallow-merges per-display settings over global settings', () => {
    const config = makeConfig({
      settings: makeSettings({ rotationIntervalMs: 30_000, displayWidth: 1080 }),
      screens: [makeScreen('s1')],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screenIds: ['s1'],
        settings: { rotationIntervalMs: 60_000 },
      }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.settings.rotationIntervalMs).toBe(60_000);
    // Untouched fields fall through from the global object
    expect(filtered?.settings.displayWidth).toBe(1080);
  });

  it('replaces nested objects wholesale (no deep merge of sleep)', () => {
    // Documented design decision: sleep is full-replacement so the merge
    // logic stays predictable. A partial sleep override would silently
    // mix fields from two sources.
    const globalSleep: SleepSettings = {
      enabled: true,
      dimAfterMinutes: 10,
      sleepAfterMinutes: 30,
      dimBrightness: 20,
      schedule: { startTime: '23:00', endTime: '06:00' },
    };
    const overrideSleep: SleepSettings = {
      enabled: false,
      dimAfterMinutes: 0,
      sleepAfterMinutes: 0,
      dimBrightness: 0,
    };
    const config = makeConfig({
      settings: makeSettings({ sleep: globalSleep }),
      screens: [makeScreen('s1')],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screenIds: ['s1'],
        settings: { sleep: overrideSleep },
      }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    // The override blew away `schedule` — not preserved from global
    expect(filtered?.settings.sleep).toEqual(overrideSleep);
    expect(filtered?.settings.sleep?.schedule).toBeUndefined();
  });

  it('per-display activeProfile overrides settings.activeProfile', () => {
    const config = makeConfig({
      settings: makeSettings({ activeProfile: 'day' }),
      screens: [makeScreen('s1')],
      profiles: [makeProfile('day'), makeProfile('night')],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screenIds: ['s1'],
        activeProfile: 'night',
      }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.settings.activeProfile).toBe('night');
    expect(filtered?.activeProfile).toBe('night');
  });

  it('falls back to settings.activeProfile when display.activeProfile is undefined', () => {
    const config = makeConfig({
      settings: makeSettings({ activeProfile: 'day' }),
      screens: [makeScreen('s1')],
      profiles: [makeProfile('day')],
      displays: [{ id: 'kitchen', name: 'Kitchen', screenIds: ['s1'] }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.settings.activeProfile).toBe('day');
    expect(filtered?.activeProfile).toBeUndefined();
  });

  it('returns the empty screens list when display.screenIds is empty', () => {
    const config = makeConfig({
      screens: [makeScreen('s1'), makeScreen('s2')],
      displays: [{ id: 'kitchen', name: 'Kitchen', screenIds: [] }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.screens).toEqual([]);
  });
});

/* ─── validateDisplays ───────────────────────────── */

describe('validateDisplays', () => {
  it('returns null when displays is missing', () => {
    expect(validateDisplays(makeConfig())).toBeNull();
  });

  it('returns null when displays is empty', () => {
    expect(validateDisplays(makeConfig({ displays: [] }))).toBeNull();
  });

  it('accepts a fully valid registry', () => {
    const config = makeConfig({
      screens: [makeScreen('s1'), makeScreen('s2')],
      profiles: [makeProfile('day'), makeProfile('night')],
      displays: [
        {
          id: 'kitchen',
          name: 'Kitchen',
          screenIds: ['s1'],
          profileIds: ['day'],
          activeProfile: 'day',
        },
        { id: 'bedroom-tv', name: 'Bedroom TV', screenIds: ['s2'] },
      ],
    });
    expect(validateDisplays(config)).toBeNull();
  });

  describe('slug rules', () => {
    const cases: Array<[string, string]> = [
      ['Kitchen',   'uppercase letter'],
      ['kitchen!',  'punctuation'],
      ['my kitchen', 'space'],
      ['my_kitchen', 'underscore'],
      ['-kitchen',  'leading hyphen'],
      ['',          'empty string'],
    ];
    for (const [bad, why] of cases) {
      it(`rejects ${why}: "${bad}"`, () => {
        const config = makeConfig({
          screens: [],
          displays: [{ id: bad, name: 'X', screenIds: [] } as DisplayNode],
        });
        const err = validateDisplays(config);
        expect(err).toBeTruthy();
        expect(err).toMatch(/Invalid display id/);
      });
    }

    it('accepts a leading digit (current regex behavior)', () => {
      // Locks in the actual SLUG_RE behavior — `[a-z0-9][a-z0-9-]*` allows
      // a leading digit. Documenting it as a test so a future "no leading
      // digits" change would have to update this and force a code review.
      const config = makeConfig({
        screens: [],
        displays: [{ id: '1st-floor', name: 'First Floor', screenIds: [] }],
      });
      expect(validateDisplays(config)).toBeNull();
    });

    it('rejects an ID longer than the max length', () => {
      const longId = 'a'.repeat(65);
      const config = makeConfig({
        screens: [],
        displays: [{ id: longId, name: 'X', screenIds: [] }],
      });
      expect(validateDisplays(config)).toMatch(/Invalid display id/);
    });
  });

  it('rejects duplicate IDs', () => {
    const config = makeConfig({
      screens: [],
      displays: [
        { id: 'kitchen', name: 'A', screenIds: [] },
        { id: 'kitchen', name: 'B', screenIds: [] },
      ],
    });
    expect(validateDisplays(config)).toMatch(/Duplicate display id "kitchen"/);
  });

  it('rejects unknown screen reference', () => {
    const config = makeConfig({
      screens: [makeScreen('s1')],
      displays: [{ id: 'kitchen', name: 'K', screenIds: ['ghost'] }],
    });
    expect(validateDisplays(config)).toMatch(/unknown screen "ghost"/);
  });

  it('rejects unknown profile reference', () => {
    const config = makeConfig({
      screens: [makeScreen('s1')],
      profiles: [makeProfile('day')],
      displays: [{
        id: 'kitchen',
        name: 'K',
        screenIds: ['s1'],
        profileIds: ['phantom'],
      }],
    });
    expect(validateDisplays(config)).toMatch(/unknown profile "phantom"/);
  });

  it('rejects activeProfile not in global profiles', () => {
    const config = makeConfig({
      screens: [makeScreen('s1')],
      profiles: [makeProfile('day')],
      displays: [{
        id: 'kitchen',
        name: 'K',
        screenIds: ['s1'],
        activeProfile: 'night',
      }],
    });
    expect(validateDisplays(config)).toMatch(/unknown activeProfile "night"/);
  });

  it('rejects activeProfile that is global but not in display.profileIds', () => {
    const config = makeConfig({
      screens: [makeScreen('s1')],
      profiles: [makeProfile('day'), makeProfile('night')],
      displays: [{
        id: 'kitchen',
        name: 'K',
        screenIds: ['s1'],
        profileIds: ['day'],
        activeProfile: 'night',
      }],
    });
    expect(validateDisplays(config)).toMatch(/not in its profileIds list/);
  });

  it('rejects too many displays', () => {
    const displays = Array.from({ length: 65 }, (_, i) => ({
      id: `display-${i}`,
      name: `Display ${i}`,
      screenIds: [],
    }));
    const config = makeConfig({ screens: [], displays });
    expect(validateDisplays(config)).toMatch(/Too many displays/);
  });

  it('rejects too many screens per display', () => {
    const screens = Array.from({ length: 257 }, (_, i) => makeScreen(`s${i}`));
    const config = makeConfig({
      screens,
      displays: [{
        id: 'mega',
        name: 'Mega',
        screenIds: screens.map((s) => s.id),
      }],
    });
    expect(validateDisplays(config)).toMatch(/too many screens/);
  });
});
