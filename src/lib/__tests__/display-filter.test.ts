import { describe, it, expect } from 'vitest';
import { filterConfigForDisplay, validateDisplays, findScreenById } from '@/lib/display-filter';
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
      // Include a portrait transform so the 1080×1920 dims survive the
      // orientation-normalization layer without being flipped.
      settings: makeSettings({
        rotationIntervalMs: 30_000,
        displayWidth: 1080,
        displayHeight: 1920,
        displayTransform: '90',
      }),
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
    expect(filtered?.settings.displayHeight).toBe(1920);
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

  it('rejects too many owned screens per display', () => {
    const displayScreens = Array.from({ length: 257 }, (_, i) => makeScreen(`ds${i}`));
    const config = makeConfig({
      screens: [],
      displays: [{
        id: 'mega',
        name: 'Mega',
        screens: displayScreens,
      }],
    });
    expect(validateDisplays(config)).toMatch(/too many screens/);
  });

  describe('per-display dimensions', () => {
    it('accepts positive integer dimensions', () => {
      const config = makeConfig({
        screens: [],
        displays: [{
          id: 'kitchen',
          name: 'K',
          screens: [],
          displayWidth: 1080,
          displayHeight: 1920,
        }],
      });
      expect(validateDisplays(config)).toBeNull();
    });

    it('rejects non-integer width', () => {
      const config = makeConfig({
        screens: [],
        displays: [{
          id: 'kitchen',
          name: 'K',
          screens: [],
          displayWidth: 1080.5,
        }],
      });
      expect(validateDisplays(config)).toMatch(/displayWidth must be a positive integer/);
    });

    it('rejects zero or negative height', () => {
      const config = makeConfig({
        screens: [],
        displays: [{
          id: 'kitchen',
          name: 'K',
          screens: [],
          displayHeight: 0,
        }],
      });
      expect(validateDisplays(config)).toMatch(/displayHeight must be a positive integer/);
    });

    it('rejects unreasonably large width', () => {
      const config = makeConfig({
        screens: [],
        displays: [{
          id: 'kitchen',
          name: 'K',
          screens: [],
          displayWidth: 999999,
        }],
      });
      expect(validateDisplays(config)).toMatch(/displayWidth/);
    });
  });

  it('owned screens bypass the screenIds cross-reference check', () => {
    // A display that owns its own screens never touches config.screens —
    // the owned screens are self-contained, so validateDisplays does not
    // reject them for missing global references.
    const config = makeConfig({
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('owned-1'), makeScreen('owned-2')],
      }],
    });
    expect(validateDisplays(config)).toBeNull();
  });
});

/* ─── filterConfigForDisplay with owned screens ─── */

describe('filterConfigForDisplay — owned screens', () => {
  it('returns display.screens when set, ignoring the global pool', () => {
    const config = makeConfig({
      // Global pool has different screens — these should NOT be returned
      screens: [makeScreen('pool-1'), makeScreen('pool-2')],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('owned-a'), makeScreen('owned-b')],
      }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.screens.map((s) => s.id)).toEqual(['owned-a', 'owned-b']);
  });

  it('prefers owned screens over legacy screenIds when both are set', () => {
    const config = makeConfig({
      screens: [makeScreen('pool-1')],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        // Legacy field left in — owned screens should win
        screenIds: ['pool-1'],
        screens: [makeScreen('owned-x')],
      }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.screens.map((s) => s.id)).toEqual(['owned-x']);
  });

  it('merges per-display displayWidth/Height/Transform into settings', () => {
    const config = makeConfig({
      settings: makeSettings({
        displayWidth: 1920,
        displayHeight: 1080,
        displayTransform: 'normal',
      }),
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [],
        displayWidth: 1080,
        displayHeight: 1920,
        displayTransform: '90',
      }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.settings.displayWidth).toBe(1080);
    expect(filtered?.settings.displayHeight).toBe(1920);
    expect(filtered?.settings.displayTransform).toBe('90');
  });

  it('keeps global dimensions when the display has none set', () => {
    const config = makeConfig({
      settings: makeSettings({ displayWidth: 1920, displayHeight: 1080 }),
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [],
      }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.settings.displayWidth).toBe(1920);
    expect(filtered?.settings.displayHeight).toBe(1080);
  });

  describe('rotation is authoritative for canvas orientation', () => {
    it('flips landscape-shaped dimensions into portrait when rotation is 90°', () => {
      // The user typed the "long" side as width (landscape-shape) but then
      // chose 90° rotation. The canvas must end up portrait, matching the
      // rotation rather than the typed order.
      const config = makeConfig({
        screens: [],
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screens: [],
          displayWidth: 2560,
          displayHeight: 1440,
          displayTransform: '90',
        }],
      });
      const filtered = filterConfigForDisplay(config, 'kitchen');
      expect(filtered?.settings.displayWidth).toBe(1440);
      expect(filtered?.settings.displayHeight).toBe(2560);
    });

    it('flips portrait-shaped dimensions into landscape when rotation is normal', () => {
      // Symmetric: user typed portrait shape but picked landscape rotation.
      // This was the screenshot the user hit — 1440×2560 + Normal (landscape)
      // rendered as a portrait canvas. The fix makes rotation win.
      const config = makeConfig({
        screens: [],
        displays: [{
          id: 'main',
          name: 'Main',
          screens: [],
          displayWidth: 1440,
          displayHeight: 2560,
          displayTransform: 'normal',
        }],
      });
      const filtered = filterConfigForDisplay(config, 'main');
      expect(filtered?.settings.displayWidth).toBe(2560);
      expect(filtered?.settings.displayHeight).toBe(1440);
    });

    it('treats undefined transform as landscape', () => {
      const config = makeConfig({
        screens: [],
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screens: [],
          displayWidth: 1440,
          displayHeight: 2560,
        }],
      });
      const filtered = filterConfigForDisplay(config, 'kitchen');
      expect(filtered?.settings.displayWidth).toBe(2560);
      expect(filtered?.settings.displayHeight).toBe(1440);
    });

    it('treats 180° the same as normal (still landscape)', () => {
      const config = makeConfig({
        screens: [],
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screens: [],
          displayWidth: 1440,
          displayHeight: 2560,
          displayTransform: '180',
        }],
      });
      const filtered = filterConfigForDisplay(config, 'kitchen');
      expect(filtered?.settings.displayWidth).toBe(2560);
      expect(filtered?.settings.displayHeight).toBe(1440);
    });

    it('treats 270° the same as 90° (still portrait)', () => {
      const config = makeConfig({
        screens: [],
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screens: [],
          displayWidth: 2560,
          displayHeight: 1440,
          displayTransform: '270',
        }],
      });
      const filtered = filterConfigForDisplay(config, 'kitchen');
      expect(filtered?.settings.displayWidth).toBe(1440);
      expect(filtered?.settings.displayHeight).toBe(2560);
    });
  });
});

/* ─── findScreenById ───────────────────────────── */

describe('findScreenById', () => {
  it('finds a screen in the legacy global pool', () => {
    const config = makeConfig({
      screens: [makeScreen('s1'), makeScreen('s2')],
    });
    expect(findScreenById(config, 's2')?.id).toBe('s2');
  });

  it('finds a screen owned by a display', () => {
    const config = makeConfig({
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('owned-a'), makeScreen('owned-b')],
      }],
    });
    expect(findScreenById(config, 'owned-b')?.id).toBe('owned-b');
  });

  it('returns null when the screen is nowhere', () => {
    const config = makeConfig({
      screens: [makeScreen('s1')],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('owned-a')],
      }],
    });
    expect(findScreenById(config, 'missing')).toBeNull();
  });

  it('prefers display-owned screens over the global pool when the same id appears in both', () => {
    // Unlikely but possible during migration. Owned screens win because
    // they're the newer, authoritative shape.
    const pooled = { ...makeScreen('shared'), name: 'Pooled Version' };
    const owned = { ...makeScreen('shared'), name: 'Owned Version' };
    const config = makeConfig({
      screens: [pooled],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [owned],
      }],
    });
    expect(findScreenById(config, 'shared')?.name).toBe('Owned Version');
  });

  it('searches across multiple displays in order', () => {
    const config = makeConfig({
      screens: [],
      displays: [
        {
          id: 'kitchen',
          name: 'Kitchen',
          screens: [makeScreen('kitchen-s1')],
        },
        {
          id: 'bedroom',
          name: 'Bedroom',
          screens: [makeScreen('bedroom-s1')],
        },
      ],
    });
    expect(findScreenById(config, 'kitchen-s1')?.id).toBe('kitchen-s1');
    expect(findScreenById(config, 'bedroom-s1')?.id).toBe('bedroom-s1');
  });

  it('returns null when displays exist but the screen is not in any of them', () => {
    const config = makeConfig({
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('other')],
      }],
    });
    expect(findScreenById(config, 'missing')).toBeNull();
  });
});
