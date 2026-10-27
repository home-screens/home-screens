import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CalendarSettings, GlobalSettings, ModuleInstance, ModuleType, Screen } from '@/types/config';
import { collectProvidedStateKeys, isStateProducerType } from '../provided-state-keys';
import { CALENDAR_STATE_KEYS } from '../calendar-state';
import { WEATHER_STATE_KEYS } from '../weather-state';
import { NOTES_STATE_KEYS } from '../notes-state';

// Definitions are controlled per-test; malformed shapes must be testable
// here even though registerPluginModule filters them on the real path
// (built-in defs and the dev-plugin path do not go through validateManifest).
const { defs } = vi.hoisted(() => ({
  defs: new Map<string, Record<string, unknown>>(),
}));

vi.mock('@/lib/module-registry', () => ({
  getModuleDefinition: (type: string) => defs.get(type),
  getAllModuleDefinitions: () => Array.from(defs.values()),
}));

let nextId = 0;
function makeModule(overrides: Partial<ModuleInstance> & { type: string }): ModuleInstance {
  return {
    id: `mod-${nextId++}`,
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 0,
    config: {},
    style: {} as ModuleInstance['style'],
    backgroundProvider: true,
    ...overrides,
    type: overrides.type as ModuleType,
  };
}

function screensWith(...modules: ModuleInstance[]): Screen[] {
  return [{ id: 's1', name: 's1', backgroundImage: '', modules }];
}

describe('collectProvidedStateKeys', () => {
  beforeEach(() => {
    defs.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('aggregates static keys from backgroundProvider instances', () => {
    defs.set('plugin:ha', { providesState: [{ key: 'plugin:ha:door', label: 'Door' }] });
    const keys = collectProvidedStateKeys(screensWith(makeModule({ type: 'plugin:ha' })));
    expect(keys).toEqual([{ key: 'plugin:ha:door', label: 'Door' }]);
  });

  it('dedupes by key with first label winning', () => {
    defs.set('plugin:a', { providesState: [{ key: 'shared.key', label: 'First' }] });
    defs.set('plugin:b', { providesState: [{ key: 'shared.key', label: 'Second' }] });
    const keys = collectProvidedStateKeys(screensWith(
      makeModule({ type: 'plugin:a' }),
      makeModule({ type: 'plugin:b' }),
    ));
    expect(keys).toEqual([{ key: 'shared.key', label: 'First' }]);
  });

  it('skips non-backgroundProvider and disabled instances', () => {
    defs.set('plugin:ha', { providesState: [{ key: 'k', label: 'K' }] });
    const keys = collectProvidedStateKeys(screensWith(
      makeModule({ type: 'plugin:ha', backgroundProvider: undefined }),
      makeModule({ type: 'plugin:ha', enabled: false }),
    ));
    expect(keys).toEqual([]);
  });

  it('resolves config-driven keys via deriveProvidedKeys', () => {
    defs.set('plugin:ha', {
      deriveProvidedKeys: (config: Record<string, unknown>) =>
        (config.entities as string[]).map((e) => ({ key: `plugin:ha:${e}`, label: e })),
    });
    const keys = collectProvidedStateKeys(screensWith(
      makeModule({ type: 'plugin:ha', config: { entities: ['door', 'temp'] } }),
    ));
    expect(keys.map((k) => k.key)).toEqual(['plugin:ha:door', 'plugin:ha:temp']);
  });

  it('a throwing deriver warns and never breaks the panel', () => {
    defs.set('plugin:bad', {
      deriveProvidedKeys: () => { throw new Error('third-party bug'); },
    });
    defs.set('plugin:good', { providesState: [{ key: 'ok', label: 'OK' }] });
    const keys = collectProvidedStateKeys(screensWith(
      makeModule({ type: 'plugin:bad' }),
      makeModule({ type: 'plugin:good' }),
    ));
    expect(keys).toEqual([{ key: 'ok', label: 'OK' }]);
    expect(console.warn).toHaveBeenCalled();
  });

  it('tolerates malformed providesState and non-array deriver results', () => {
    defs.set('plugin:string', { providesState: 'not-an-array' });
    defs.set('plugin:noniter', { providesState: { length: 1 }, deriveProvidedKeys: () => 'nope' });
    const keys = collectProvidedStateKeys(screensWith(
      makeModule({ type: 'plugin:string' }),
      makeModule({ type: 'plugin:noniter' }),
    ));
    expect(keys).toEqual([]);
  });

  it('skips unregistered module types', () => {
    const keys = collectProvidedStateKeys(screensWith(makeModule({ type: 'plugin:missing' })));
    expect(keys).toEqual([]);
  });

  it('surfaces a demand-driven plugin\'s keys with zero on-screen instances', () => {
    defs.set('plugin:strava', {
      hasStateProvider: true,
      providesState: [{ key: 'plugin:strava:current_streak', label: 'Current streak' }],
    });
    const keys = collectProvidedStateKeys([]);
    expect(keys).toEqual([{ key: 'plugin:strava:current_streak', label: 'Current streak' }]);
  });

  it('does not surface a non-demand-driven plugin with no on-screen instance', () => {
    defs.set('plugin:ha', { providesState: [{ key: 'plugin:ha:door', label: 'Door' }] });
    const keys = collectProvidedStateKeys([]);
    expect(keys).toEqual([]);
  });

  it('demand-driven keys win dedup over an on-screen instance of the same plugin', () => {
    defs.set('plugin:strava', {
      hasStateProvider: true,
      providesState: [{ key: 'plugin:strava:current_streak', label: 'Current streak (provider)' }],
    });
    const keys = collectProvidedStateKeys(screensWith(makeModule({ type: 'plugin:strava' })));
    expect(keys).toEqual([{ key: 'plugin:strava:current_streak', label: 'Current streak (provider)' }]);
  });

  it('merges demand-driven and on-screen sources without duplicates', () => {
    defs.set('plugin:strava', {
      hasStateProvider: true,
      providesState: [{ key: 'plugin:strava:current_streak', label: 'Current streak' }],
    });
    defs.set('plugin:ha', { providesState: [{ key: 'plugin:ha:door', label: 'Door' }] });
    const keys = collectProvidedStateKeys(screensWith(makeModule({ type: 'plugin:ha' })));
    expect(keys).toEqual([
      { key: 'plugin:strava:current_streak', label: 'Current streak' },
      { key: 'plugin:ha:door', label: 'Door' },
    ]);
  });
});

describe('collectProvidedStateKeys host keys', () => {
  beforeEach(() => {
    defs.clear();
  });

  const t = (key: string) => `t:${key}`;
  const calendar = (over: Partial<CalendarSettings> = {}): CalendarSettings => ({
    googleCalendarId: '',
    googleCalendarIds: [],
    icalSources: [],
    daysAhead: 30,
    ...over,
  });
  // No location by default, so a calendar-only case sees calendar keys alone.
  const settings = (over: Partial<GlobalSettings> = {}): GlobalSettings => ({
    latitude: 0,
    longitude: 0,
    calendar: calendar(),
    ...over,
  } as GlobalSettings);
  const located = { latitude: 44.7, longitude: -93.4 };
  // The notes board needs no setting, so its keys close every host list.
  const NOTES_KEYS = Object.values(NOTES_STATE_KEYS);
  const hostKeys = (...args: Parameters<typeof collectProvidedStateKeys>) => collectProvidedStateKeys(...args).map((k) => k.key);

  it('offers the calendar keys when a calendar source is configured', () => {
    const keys = collectProvidedStateKeys([], {
      t,
      settings: settings({ calendar: calendar({ googleCalendarIds: ['family@example.com'] }) }),
    });
    expect(keys.map((k) => k.key)).toEqual([...Object.values(CALENDAR_STATE_KEYS), ...NOTES_KEYS]);
  });

  it('recognizes every source type, not just Google', () => {
    const feeds: Partial<CalendarSettings>[] = [
      { googleCalendarId: 'legacy@example.com' },
      { icalSources: [{ id: 'i1', type: 'ical', name: 'School', url: 'https://x/y.ics', color: '#fff', enabled: true }] },
      { icloudSources: [{ id: 'c1', accountId: 'a1', kind: 'birthdays', url: '', name: 'Birthdays', color: '#fff', enabled: true }] },
      { holidayCountry: 'US' },
    ];
    for (const over of feeds) {
      expect(hostKeys([], { t, settings: settings({ calendar: calendar(over) }) })).toContain(CALENDAR_STATE_KEYS.nextEventTitle);
    }
  });

  it('withholds them when nothing would ever be fetched, leaving only the notes board', () => {
    expect(hostKeys([], { t, settings: settings() })).toEqual(NOTES_KEYS);
    expect(hostKeys([], { t })).toEqual(NOTES_KEYS);
    // A disabled feed is not a source.
    expect(hostKeys([], {
      t,
      settings: settings({ calendar: calendar({ icalSources: [{ id: 'i1', type: 'ical', name: 'School', url: 'https://x/y.ics', color: '#fff', enabled: false }] }) }),
    })).toEqual(NOTES_KEYS);
  });

  it('always offers the notes board keys, labelled through the dictionary', () => {
    expect(collectProvidedStateKeys([], { t })).toEqual([
      { key: 'notes.count', label: 't:stateKeys.notes.count', sampleValues: ['3'] },
      { key: 'notes.important', label: 't:stateKeys.notes.important', sampleValues: ['1'] },
      { key: 'notes.pinned', label: 't:stateKeys.notes.pinned', sampleValues: ['1'] },
    ]);
  });

  it('omits them entirely when no host context is passed', () => {
    defs.set('plugin:ha', { providesState: [{ key: 'plugin:ha:door', label: 'Door' }] });
    const keys = collectProvidedStateKeys(screensWith(makeModule({ type: 'plugin:ha' })));
    expect(keys).toEqual([{ key: 'plugin:ha:door', label: 'Door' }]);
  });

  const CHANCE_KEYS = [
    WEATHER_STATE_KEYS.condition, WEATHER_STATE_KEYS.temperature, WEATHER_STATE_KEYS.precipChanceNow,
    WEATHER_STATE_KEYS.precipChanceNextHours, WEATHER_STATE_KEYS.precipChanceToday,
  ];
  const ALERT_KEYS = [WEATHER_STATE_KEYS.alertActive, WEATHER_STATE_KEYS.alertSeverity, WEATHER_STATE_KEYS.alertTitle];
  const weather = (provider: string) => ({ provider, latitude: 0, longitude: 0, units: 'imperial' } as GlobalSettings['weather']);

  it('offers the weather chance keys when a location is configured', () => {
    const keys = collectProvidedStateKeys([], { t, settings: settings({ ...located, weather: weather('open-meteo') }) });
    expect(keys.map((k) => k.key)).toEqual([...CHANCE_KEYS, ...NOTES_KEYS]);
  });

  it('adds the warning keys only when the default provider sends warnings', () => {
    for (const provider of ['pirateweather', 'noaa']) {
      const keys = collectProvidedStateKeys([], { t, settings: settings({ ...located, weather: weather(provider) }) });
      expect(keys.map((k) => k.key)).toEqual([...CHANCE_KEYS, ...ALERT_KEYS, ...NOTES_KEYS]);
    }
    for (const provider of ['openweathermap', 'weatherapi', 'yr', 'smhi', 'metoffice', 'envcanada']) {
      const keys = collectProvidedStateKeys([], { t, settings: settings({ ...located, weather: weather(provider) }) });
      expect(keys.map((k) => k.key)).toEqual([...CHANCE_KEYS, ...NOTES_KEYS]);
    }
  });

  it('withholds the warning keys without a location even on a warning provider', () => {
    expect(hostKeys([], { t, settings: settings({ weather: weather('noaa') }) })).toEqual(NOTES_KEYS);
  });

  it('reads the legacy weather location when the top-level fields are absent', () => {
    const keys = collectProvidedStateKeys([], {
      t,
      settings: {
        calendar: calendar(),
        weather: { provider: 'open-meteo', latitude: 44.7, longitude: -93.4, units: 'metric' },
      } as GlobalSettings,
    });
    expect(keys.map((k) => k.key)).toEqual([...CHANCE_KEYS, ...NOTES_KEYS]);
  });

  it('lists calendar keys, then weather keys, then the notes board, when both are configured', () => {
    const keys = collectProvidedStateKeys([], {
      t,
      settings: settings({ ...located, weather: weather('pirateweather'), calendar: calendar({ holidayCountry: 'US' }) }),
    });
    expect(keys.map((k) => k.key)).toEqual([
      ...Object.values(CALENDAR_STATE_KEYS),
      ...Object.values(WEATHER_STATE_KEYS),
      ...NOTES_KEYS,
    ]);
  });

  it('lists host keys ahead of plugin keys', () => {
    defs.set('plugin:ha', { providesState: [{ key: 'plugin:ha:door', label: 'Door' }] });
    const keys = collectProvidedStateKeys(screensWith(makeModule({ type: 'plugin:ha' })), {
      t,
      settings: settings({ calendar: calendar({ holidayCountry: 'US' }) }),
    });
    expect(keys[0].key).toBe(CALENDAR_STATE_KEYS.nextEventTitle);
    expect(keys.at(-1)).toEqual({ key: 'plugin:ha:door', label: 'Door' });
  });
});

describe('isStateProducerType', () => {
  beforeEach(() => {
    defs.clear();
  });

  it('true for a non-empty providesState array', () => {
    defs.set('plugin:a', { providesState: [{ key: 'k', label: 'K' }] });
    expect(isStateProducerType('plugin:a' as ModuleType)).toBe(true);
  });

  it('true for a deriveProvidedKeys function', () => {
    defs.set('plugin:b', { deriveProvidedKeys: () => [] });
    expect(isStateProducerType('plugin:b' as ModuleType)).toBe(true);
  });

  it('false for empty array, malformed shapes, and unregistered types', () => {
    defs.set('plugin:empty', { providesState: [] });
    defs.set('plugin:string', { providesState: 'truthy-with-length' });
    expect(isStateProducerType('plugin:empty' as ModuleType)).toBe(false);
    expect(isStateProducerType('plugin:string' as ModuleType)).toBe(false);
    expect(isStateProducerType('plugin:missing' as ModuleType)).toBe(false);
  });
});
