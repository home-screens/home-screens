import { describe, it, expect } from 'vitest';
import {
  filterConfigForDisplay,
  validateDisplays,
  validateAllSchedules,
  validateModuleSchedule,
  validateModuleVisibility,
  MAX_CONDITION_DEPTH,
  findScreenById,
  getDisplayScreens,
  getDisplayProfiles,
  findMainDisplay,
  isMainDisplay,
  pruneDanglingScreenRefs,
  MAIN_DISPLAY_ID,
} from '@/lib/display-filter';
import type {
  AlertSettings,
  GlobalSettings,
  ModuleInstance,
  Profile,
  Screen,
  ScreenConfiguration,
  DisplayNode,
  SleepSettings,
  VisibilityCondition,
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
      screens: [],
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [makeScreen('s1')] }],
    });
    expect(filterConfigForDisplay(config, 'bedroom')).toBeNull();
  });

  it('returns null when no displays array exists at all (legacy mode)', () => {
    const config = makeConfig({ screens: [makeScreen('s1')] });
    expect(filterConfigForDisplay(config, 'kitchen')).toBeNull();
  });

  it('returns owned screens unchanged', () => {
    const config = makeConfig({
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('s1'), makeScreen('s3')],
      }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.screens.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('returns the shared pool of profiles when display.profiles is undefined', () => {
    const config = makeConfig({
      screens: [],
      profiles: [makeProfile('day'), makeProfile('night')],
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [makeScreen('s1')] }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.profiles?.map((p) => p.id)).toEqual(['day', 'night']);
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
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('s1')],
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
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('s1')],
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
      screens: [],
      profiles: [makeProfile('day'), makeProfile('night')],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('s1')],
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
      screens: [],
      profiles: [makeProfile('day')],
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [makeScreen('s1')] }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.settings.activeProfile).toBe('day');
    expect(filtered?.activeProfile).toBeUndefined();
  });

  it('returns an empty screens list when the display owns no screens', () => {
    const config = makeConfig({
      screens: [],
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [] }],
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
      screens: [],
      profiles: [makeProfile('day'), makeProfile('night')],
      displays: [
        {
          id: 'kitchen',
          name: 'Kitchen',
          screens: [makeScreen('s1')],
          activeProfile: 'day',
        },
        { id: 'bedroom-tv', name: 'Bedroom TV', screens: [makeScreen('s2')] },
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
          displays: [{ id: bad, name: 'X', screens: [] } as DisplayNode],
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
        displays: [{ id: '1st-floor', name: 'First Floor', screens: [] }],
      });
      expect(validateDisplays(config)).toBeNull();
    });

    it('rejects an ID longer than the max length', () => {
      const longId = 'a'.repeat(65);
      const config = makeConfig({
        screens: [],
        displays: [{ id: longId, name: 'X', screens: [] }],
      });
      expect(validateDisplays(config)).toMatch(/Invalid display id/);
    });
  });

  it('rejects duplicate IDs', () => {
    const config = makeConfig({
      screens: [],
      displays: [
        { id: 'kitchen', name: 'A', screens: [] },
        { id: 'kitchen', name: 'B', screens: [] },
      ],
    });
    expect(validateDisplays(config)).toMatch(/Duplicate display id "kitchen"/);
  });

  it('rejects activeProfile not in global profiles', () => {
    const config = makeConfig({
      screens: [],
      profiles: [makeProfile('day')],
      displays: [{
        id: 'kitchen',
        name: 'K',
        screens: [makeScreen('s1')],
        activeProfile: 'night',
      }],
    });
    expect(validateDisplays(config)).toMatch(/unknown activeProfile "night"/);
  });

  it('rejects too many displays', () => {
    const displays: DisplayNode[] = Array.from({ length: 65 }, (_, i) => ({
      id: `display-${i}`,
      name: `Display ${i}`,
      screens: [],
    }));
    const config = makeConfig({ screens: [], displays });
    expect(validateDisplays(config)).toMatch(/Too many displays/);
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

/* ─── Per-display settings overrides ─── */

describe('filterConfigForDisplay — per-display overrides', () => {
  it('fullscreenTheme override beats the global value', () => {
    const config = makeConfig({
      settings: makeSettings({ fullscreenTheme: 'linen' }),
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [],
        settings: { fullscreenTheme: 'charcoal' },
      }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.settings.fullscreenTheme).toBe('charcoal');
  });

  it('cursorHideSeconds override beats the global value', () => {
    const config = makeConfig({
      settings: makeSettings({ cursorHideSeconds: 3 }),
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [],
        settings: { cursorHideSeconds: 10 },
      }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.settings.cursorHideSeconds).toBe(10);
  });

  it('pauseEnabled / pauseTimeoutSeconds overrides beat globals', () => {
    const config = makeConfig({
      settings: makeSettings({ pauseEnabled: true, pauseTimeoutSeconds: 300 }),
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [],
        settings: { pauseEnabled: false, pauseTimeoutSeconds: 0 },
      }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.settings.pauseEnabled).toBe(false);
    expect(filtered?.settings.pauseTimeoutSeconds).toBe(0);
  });

  it('screensaver override is full-replacement (nested object)', () => {
    // ScreensaverSettings currently has only `mode`, so this test looks
    // like a plain "override wins" — but screensaver is the third nested
    // object users can fork, alongside sleep + alerts, and the shallow-
    // merge contract applies to it too. This test locks in the
    // full-replacement semantics so a future schema addition (e.g.
    // `screensaver.timeoutSeconds`) cannot silently acquire deep-merge
    // behavior that would inherit half the object from the global.
    const config = makeConfig({
      settings: makeSettings({ screensaver: { mode: 'clock' } }),
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [],
        settings: { screensaver: { mode: 'blank' } },
      }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.settings.screensaver).toEqual({ mode: 'blank' });
  });

  it('alerts override is full-replacement (nested object)', () => {
    const globalAlerts: AlertSettings = {
      enabled: true,
      position: 'top',
      maxVisible: 3,
      defaultDuration: 0,
      scale: 1,
    };
    const displayAlerts: AlertSettings = {
      enabled: false,
      position: 'bottom',
      maxVisible: 1,
      defaultDuration: 10_000,
    };
    const config = makeConfig({
      settings: makeSettings({ alerts: globalAlerts }),
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [],
        settings: { alerts: displayAlerts },
      }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    // Full-replacement: scale was present on global but not on the override,
    // so the merged alerts has no scale (not the global's `1`).
    expect(filtered?.settings.alerts).toEqual(displayAlerts);
    expect(filtered?.settings.alerts?.scale).toBeUndefined();
  });

});

/* ─── getDisplayProfiles ───────────────────────── */

describe('getDisplayProfiles', () => {
  it('returns owned profiles when display.profiles is set', () => {
    const owned = [makeProfile('display-day'), makeProfile('display-night')];
    const display: DisplayNode = {
      id: 'kitchen',
      name: 'Kitchen',
      screens: [],
      profiles: owned,
    };
    // Pool should be ignored entirely when owned profiles are present.
    const result = getDisplayProfiles(display, [makeProfile('pool-day')]);
    expect(result.map((p) => p.id)).toEqual(['display-day', 'display-night']);
  });

  it('returns the full pool when nothing is owned', () => {
    const pool = [makeProfile('day'), makeProfile('night')];
    const display: DisplayNode = { id: 'kitchen', name: 'Kitchen', screens: [] };
    expect(getDisplayProfiles(display, pool)).toBe(pool);
  });

  it('returns an empty array when pool is undefined and nothing is owned', () => {
    const display: DisplayNode = { id: 'kitchen', name: 'Kitchen', screens: [] };
    expect(getDisplayProfiles(display, undefined)).toEqual([]);
  });
});

describe('filterConfigForDisplay — owned profiles', () => {
  it('returns owned profiles and ignores the global pool', () => {
    const config = makeConfig({
      profiles: [makeProfile('pool-day'), makeProfile('pool-night')],
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('k-s1')],
        profiles: [makeProfile('owned-day', ['k-s1'])],
      }],
    });
    const filtered = filterConfigForDisplay(config, 'kitchen');
    expect(filtered?.profiles?.map((p) => p.id)).toEqual(['owned-day']);
  });
});

describe('validateDisplays — owned profiles', () => {
  it('accepts a valid owned-profiles display', () => {
    const config = makeConfig({
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('k-s1'), makeScreen('k-s2')],
        profiles: [
          makeProfile('day', ['k-s1']),
          makeProfile('night', ['k-s2']),
        ],
        activeProfile: 'day',
      }],
    });
    expect(validateDisplays(config)).toBeNull();
  });

  it('rejects an owned profile whose screenIds reference a global-pool screen', () => {
    const config = makeConfig({
      // Global pool has a screen the owned profile tries to reference —
      // owned profiles are self-contained and must not reach out.
      screens: [makeScreen('pool-s1')],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('k-s1')],
        profiles: [makeProfile('day', ['pool-s1'])],
      }],
    });
    expect(validateDisplays(config)).toMatch(/profile "day" references unknown screen "pool-s1"/);
  });

  it('rejects duplicate owned-profile ids within a single display', () => {
    const config = makeConfig({
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('k-s1')],
        profiles: [
          makeProfile('day', ['k-s1']),
          makeProfile('day', ['k-s1']),
        ],
      }],
    });
    expect(validateDisplays(config)).toMatch(/duplicate profile id "day"/);
  });

  it('rejects activeProfile that does not exist in the owned list', () => {
    const config = makeConfig({
      // Global pool also has "night" to prove owned-profile displays ignore it.
      profiles: [makeProfile('night')],
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('k-s1')],
        profiles: [makeProfile('day', ['k-s1'])],
        activeProfile: 'night',
      }],
    });
    expect(validateDisplays(config)).toMatch(/unknown activeProfile "night"/);
  });
});

/* ─── findMainDisplay / isMainDisplay ────────────── */

describe('findMainDisplay', () => {
  it('returns undefined when displays is undefined', () => {
    expect(findMainDisplay(undefined)).toBeUndefined();
  });

  it('returns undefined when displays is empty', () => {
    expect(findMainDisplay([])).toBeUndefined();
  });

  it('returns the canonical "main" display when present', () => {
    // The legacy /display redirect depends on this precedence — main wins
    // even when other displays come first in the array.
    const displays: DisplayNode[] = [
      { id: 'kitchen', name: 'Kitchen', screens: [] },
      { id: MAIN_DISPLAY_ID, name: 'Main', screens: [] },
      { id: 'bedroom', name: 'Bedroom', screens: [] },
    ];
    expect(findMainDisplay(displays)?.id).toBe(MAIN_DISPLAY_ID);
  });

  it('falls back to the first display when no canonical main is present', () => {
    const displays: DisplayNode[] = [
      { id: 'kitchen', name: 'Kitchen', screens: [] },
      { id: 'bedroom', name: 'Bedroom', screens: [] },
    ];
    expect(findMainDisplay(displays)?.id).toBe('kitchen');
  });
});

describe('isMainDisplay', () => {
  it('matches the canonical id', () => {
    expect(isMainDisplay(MAIN_DISPLAY_ID)).toBe(true);
  });

  it('rejects other ids', () => {
    expect(isMainDisplay('kitchen')).toBe(false);
    expect(isMainDisplay('Main')).toBe(false); // case-sensitive
  });

  it('handles undefined and null safely', () => {
    expect(isMainDisplay(undefined)).toBe(false);
    expect(isMainDisplay(null)).toBe(false);
  });
});

/* ─── pruneDanglingScreenRefs ─────────────────────── */

describe('pruneDanglingScreenRefs', () => {
  it('returns a new config object without mutating input', () => {
    const config = makeConfig({
      profiles: [makeProfile('day', ['s1', 's2'])],
    });
    const beforeProfileIds = config.profiles![0].screenIds.slice();
    const result = pruneDanglingScreenRefs(config, 's1', null);
    expect(result).not.toBe(config);
    // Input untouched.
    expect(config.profiles![0].screenIds).toEqual(beforeProfileIds);
    // Output pruned.
    expect(result.profiles![0].screenIds).toEqual(['s2']);
  });

  it('is a no-op (returns shallow-equal config) when nothing references the deleted id', () => {
    const config = makeConfig({
      profiles: [makeProfile('day', ['other'])],
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [makeScreen('other')] }],
    });
    const result = pruneDanglingScreenRefs(config, 'never-existed', null);
    // Pruner unconditionally maps profiles/displays so the result is a new
    // object reference, but its inner contents must equal the input.
    expect(result.profiles).toEqual(config.profiles);
    expect(result.displays).toEqual(config.displays);
  });

  it('prunes from global profile pool regardless of selectedDisplayId', () => {
    const config = makeConfig({
      profiles: [
        makeProfile('day', ['s1', 's2', 's3']),
        makeProfile('night', ['s2', 's4']),
      ],
    });
    const result = pruneDanglingScreenRefs(config, 's2', null);
    expect(result.profiles![0].screenIds).toEqual(['s1', 's3']);
    expect(result.profiles![1].screenIds).toEqual(['s4']);
  });

  it('prunes only the selected display\'s owned profiles in multi-display mode', () => {
    const config = makeConfig({
      displays: [
        {
          id: 'kitchen',
          name: 'Kitchen',
          screens: [makeScreen('k-s1')],
          profiles: [makeProfile('day', ['k-s1', 'k-s2'])],
        },
        {
          id: 'bedroom',
          name: 'Bedroom',
          screens: [makeScreen('b-s1')],
          profiles: [makeProfile('night', ['k-s2', 'b-s1'])],
        },
      ],
    });
    // Only kitchen's profiles should be touched, even though bedroom's
    // profile also references 'k-s2' (it shouldn't, but the pruner is
    // scoped to the selected display so cross-display contamination is
    // surfaced by `validateDisplays` instead of silently swept up).
    const result = pruneDanglingScreenRefs(config, 'k-s2', 'kitchen');
    expect(result.displays![0].profiles![0].screenIds).toEqual(['k-s1']);
    expect(result.displays![1].profiles![0].screenIds).toEqual(['k-s2', 'b-s1']);
  });

  it('leaves displays alone when selectedDisplayId targets a non-existent display', () => {
    const config = makeConfig({
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('k-s1')],
        profiles: [makeProfile('day', ['k-s1'])],
      }],
    });
    const result = pruneDanglingScreenRefs(config, 'k-s1', 'nonexistent');
    expect(result.displays![0].profiles![0].screenIds).toEqual(['k-s1']);
  });
});

/* ─── getDisplayScreens ──────────────────────────── */

describe('getDisplayScreens', () => {
  it('returns the display\'s owned screens array', () => {
    const owned = [makeScreen('o1'), makeScreen('o2')];
    const display: DisplayNode = { id: 'kitchen', name: 'Kitchen', screens: owned };
    expect(getDisplayScreens(display)).toBe(owned);
  });

  it('returns empty owned screens array as-is', () => {
    const display: DisplayNode = { id: 'kitchen', name: 'Kitchen', screens: [] };
    expect(getDisplayScreens(display)).toEqual([]);
  });
});

/* ─── findScreenById ─────────────────────────────── */

describe('findScreenById', () => {
  it('finds a screen in the global pool (no displays)', () => {
    const config = makeConfig({ screens: [makeScreen('s1', 'Main Screen')] });
    const result = findScreenById(config, 's1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('s1');
    expect(result!.name).toBe('Main Screen');
  });

  it('returns null when screen does not exist anywhere', () => {
    const config = makeConfig({ screens: [makeScreen('s1')] });
    expect(findScreenById(config, 'nonexistent')).toBeNull();
  });

  it('finds a screen in display-owned screens', () => {
    const config = makeConfig({
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('k-s1', 'Kitchen Screen')],
      }],
    });
    const result = findScreenById(config, 'k-s1');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Kitchen Screen');
  });

  it('owned screens take precedence over global pool (same ID)', () => {
    const config = makeConfig({
      screens: [makeScreen('s1', 'Global Version')],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('s1', 'Owned Version')],
      }],
    });
    const result = findScreenById(config, 's1');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Owned Version');
  });

  it('searches across multiple displays', () => {
    const config = makeConfig({
      screens: [],
      displays: [
        { id: 'kitchen', name: 'Kitchen', screens: [makeScreen('k-s1')] },
        { id: 'bedroom', name: 'Bedroom', screens: [makeScreen('b-s1')] },
      ],
    });
    expect(findScreenById(config, 'k-s1')).not.toBeNull();
    expect(findScreenById(config, 'b-s1')).not.toBeNull();
  });

  it('returns null when all displays have owned screens but none match', () => {
    const config = makeConfig({
      screens: [],
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('k-s1')],
      }],
    });
    expect(findScreenById(config, 'nonexistent')).toBeNull();
  });
});

/* ─── validateModuleSchedule ─────────────────────── */

describe('validateModuleSchedule', () => {
  it('returns null for an undefined schedule (always-visible default)', () => {
    expect(validateModuleSchedule(undefined, 'screen X')).toBeNull();
  });

  it('returns null for a fully valid schedule', () => {
    expect(
      validateModuleSchedule(
        { daysOfWeek: [1, 2, 3, 4, 5], startTime: '06:00', endTime: '09:00', invert: false },
        'screen X',
      ),
    ).toBeNull();
  });

  it('rejects daysOfWeek with out-of-range values', () => {
    expect(validateModuleSchedule({ daysOfWeek: [7] }, 'screen X')).toMatch(/daysOfWeek/);
    expect(validateModuleSchedule({ daysOfWeek: [-1] }, 'screen X')).toMatch(/daysOfWeek/);
  });

  it('rejects daysOfWeek with non-integer values', () => {
    expect(validateModuleSchedule({ daysOfWeek: [1.5] }, 'screen X')).toMatch(/daysOfWeek/);
  });

  it('rejects malformed time strings', () => {
    expect(validateModuleSchedule({ startTime: '6:00' }, 'screen X')).toMatch(/startTime/);
    expect(validateModuleSchedule({ endTime: '25:00' }, 'screen X')).toMatch(/endTime/);
    expect(validateModuleSchedule({ startTime: '12:60' }, 'screen X')).toMatch(/startTime/);
  });

  it('includes the context label in the error message', () => {
    const err = validateModuleSchedule({ daysOfWeek: [9] }, 'display "kitchen" screen "k-s1"');
    expect(err).toContain('display "kitchen" screen "k-s1"');
  });
});

/* ─── validateAllSchedules ───────────────────────── */

describe('validateAllSchedules', () => {
  it('returns null for a config with no schedules anywhere', () => {
    const config = makeConfig({ screens: [makeScreen('s1')] });
    expect(validateAllSchedules(config)).toBeNull();
  });

  it('catches a malformed schedule on a legacy global screen', () => {
    const screen = makeScreen('s1');
    screen.schedule = { daysOfWeek: [9] };
    const config = makeConfig({ screens: [screen] });
    expect(validateAllSchedules(config)).toMatch(/screen "s1"/);
  });

  it('catches a malformed schedule on a display-owned screen', () => {
    const screen = makeScreen('k-s1');
    screen.schedule = { startTime: 'noon' };
    const config = makeConfig({
      screens: [],
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [screen] }],
    });
    expect(validateAllSchedules(config)).toMatch(/display "kitchen".*screen "k-s1"/);
  });

  it('catches a malformed schedule on a module nested inside a screen', () => {
    const screen = makeScreen('s1');
    screen.modules = [{
      id: 'mod1',
      type: 'clock',
      position: { x: 0, y: 0 },
      size: { w: 1, h: 1 },
      zIndex: 0,
      config: {},
      style: {
        opacity: 1, borderRadius: 0, padding: 0, backgroundColor: '',
        textColor: '', fontFamily: '', fontSize: 12, backdropBlur: 0,
        borderWidth: 0, borderColor: '', shadowSize: 0,
      },
      schedule: { endTime: '99:00' },
    }];
    const config = makeConfig({ screens: [screen] });
    expect(validateAllSchedules(config)).toMatch(/screen "s1" module "mod1"/);
  });

  it('returns the first error and stops walking', () => {
    // Two bad schedules in different displays. Result should reference the
    // first one encountered (kitchen) deterministically.
    const s1 = makeScreen('k-s1');
    s1.schedule = { daysOfWeek: [9] };
    const s2 = makeScreen('b-s1');
    s2.schedule = { startTime: 'bad' };
    const config = makeConfig({
      screens: [],
      displays: [
        { id: 'kitchen', name: 'Kitchen', screens: [s1] },
        { id: 'bedroom', name: 'Bedroom', screens: [s2] },
      ],
    });
    const err = validateAllSchedules(config);
    expect(err).toMatch(/kitchen/);
    expect(err).not.toMatch(/bedroom/);
  });
});

/* ─── validateModuleVisibility ───────────────────── */

describe('validateModuleVisibility', () => {
  const CTX = 'screen "s1" module "m1"';

  function makeVisModule(visibility: unknown) {
    return {
      id: 'm1',
      type: 'icon',
      position: { x: 0, y: 0 },
      size: { w: 1, h: 1 },
      zIndex: 0,
      config: {},
      style: {
        opacity: 1, borderRadius: 0, padding: 0, backgroundColor: '',
        textColor: '', fontFamily: '', fontSize: 12, backdropBlur: 0,
        borderWidth: 0, borderColor: '', shadowSize: 0,
      },
      visibility,
    } as ModuleInstance;
  }

  it('accepts undefined and a well-formed condition tree', () => {
    expect(validateModuleVisibility(undefined, CTX)).toBeNull();
    expect(validateModuleVisibility({
      conditions: [
        { kind: 'state', sourceKey: 'plugin:ha:door', equals: ['open', 'alert'] },
        {
          kind: 'or',
          conditions: [
            { kind: 'numeric', sourceKey: 'sensor.temp', above: 32, below: 90 },
            { kind: 'not', conditions: [{ kind: 'state', sourceKey: 'mode', notEquals: 'away' }] },
          ],
        },
      ],
      whenUnknown: 'show',
    }, CTX)).toBeNull();
  });

  it('rejects an unknown condition kind', () => {
    expect(validateModuleVisibility({
      conditions: [{ kind: 'template', sourceKey: 'x' } as unknown as VisibilityCondition],
    }, CTX)).toMatch(/unknown visibility condition kind/);
  });

  it('rejects a bad sourceKey', () => {
    expect(validateModuleVisibility({
      conditions: [{ kind: 'state', sourceKey: 'Bad Key!', equals: 'x' }],
    }, CTX)).toMatch(/sourceKey/);
    expect(validateModuleVisibility({
      conditions: [{ kind: 'numeric', sourceKey: 5 as unknown as string }],
    }, CTX)).toMatch(/sourceKey/);
  });

  it('accepts an empty sourceKey (incomplete condition, evaluates as unknown)', () => {
    // The editor adds new conditions blank while the user picks a key; the
    // config must stay saveable through that state.
    expect(validateModuleVisibility({
      conditions: [{ kind: 'state', sourceKey: '', equals: '' }],
    }, CTX)).toBeNull();
    expect(validateModuleVisibility({
      conditions: [{ kind: 'numeric', sourceKey: '' }],
    }, CTX)).toBeNull();
  });

  it('rejects non-numeric bounds and non-string values', () => {
    expect(validateModuleVisibility({
      conditions: [{ kind: 'numeric', sourceKey: 'temp', above: Infinity }],
    }, CTX)).toMatch(/finite number/);
    expect(validateModuleVisibility({
      conditions: [{ kind: 'numeric', sourceKey: 'temp', below: '80' as unknown as number }],
    }, CTX)).toMatch(/finite number/);
    expect(validateModuleVisibility({
      conditions: [{ kind: 'state', sourceKey: 'door', equals: 5 as unknown as string }],
    }, CTX)).toMatch(/string or string array/);
  });

  it('rejects a bad whenUnknown value', () => {
    expect(validateModuleVisibility({
      conditions: [{ kind: 'state', sourceKey: 'door', equals: 'x' }],
      whenUnknown: 'maybe' as unknown as 'hide',
    }, CTX)).toMatch(/whenUnknown/);
  });

  it('rejects empty group conditions', () => {
    expect(validateModuleVisibility({
      conditions: [{ kind: 'and', conditions: [] }],
    }, CTX)).toMatch(/non-empty/);
  });

  it('rejects over-deep nesting', () => {
    let condition: VisibilityCondition = { kind: 'state', sourceKey: 'door', equals: 'x' };
    for (let i = 0; i < MAX_CONDITION_DEPTH + 1; i++) {
      condition = { kind: 'and', conditions: [condition] };
    }
    expect(validateModuleVisibility({ conditions: [condition] }, CTX)).toMatch(/nested too deeply/);
  });

  it('rejects too many total conditions', () => {
    const leaves: VisibilityCondition[] = Array.from({ length: 40 }, () => (
      { kind: 'state' as const, sourceKey: 'door', equals: 'x' }
    ));
    expect(validateModuleVisibility({ conditions: leaves }, CTX)).toMatch(/too many/);
  });

  it('accepts a well-formed time condition (no sourceKey needed)', () => {
    expect(validateModuleVisibility({
      conditions: [{ kind: 'time', startTime: '07:00', endTime: '21:00', daysOfWeek: [1, 2, 3, 4, 5] }],
    }, CTX)).toBeNull();
    // All fields absent = always true, still valid.
    expect(validateModuleVisibility({ conditions: [{ kind: 'time' }] }, CTX)).toBeNull();
  });

  it('rejects a malformed time condition (bad HH:MM and out-of-range day)', () => {
    expect(validateModuleVisibility({
      conditions: [{ kind: 'time', startTime: '7am' } as unknown as VisibilityCondition],
    }, CTX)).toMatch(/HH:MM/);
    expect(validateModuleVisibility({
      conditions: [{ kind: 'time', daysOfWeek: [9] } as unknown as VisibilityCondition],
    }, CTX)).toMatch(/daysOfWeek/);
  });

  it('is enforced by validateAllSchedules for both config surfaces', () => {
    const badVisibility = { conditions: [{ kind: 'state', sourceKey: '!!', equals: 'x' }] };

    const legacyScreen = makeScreen('s1');
    legacyScreen.modules = [makeVisModule(badVisibility)];
    expect(validateAllSchedules(makeConfig({ screens: [legacyScreen] })))
      .toMatch(/screen "s1" module "m1".*sourceKey/);

    const ownedScreen = makeScreen('k-s1');
    ownedScreen.modules = [makeVisModule(badVisibility)];
    expect(validateAllSchedules(makeConfig({
      screens: [],
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [ownedScreen] }],
    }))).toMatch(/display "kitchen" screen "k-s1" module "m1"/);
  });
});
