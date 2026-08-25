import { describe, it, expect } from 'vitest';
import {
  buildModuleProps,
  resolveProvider,
  toDisplaySource,
  toEditorSource,
  type PreviewData,
  type PreviewSettings,
  type SharedDisplayData,
} from '../module-props';
import type { ModuleType } from '@/types/config';

/**
 * The display and the editor canvas render the same module components from
 * different data sources. They used to do it through two hand-maintained
 * prop-builders, so a prop added to one silently went missing in the other.
 * These tests pin the replacement: one builder, two adapters, equivalent props.
 */

const LOCATION = { lat: 44.7133, lon: -93.4227 };

const WEATHER_PAYLOAD = {
  hourly: [{ temp: 72 }],
  forecast: [{ high: 78 }],
  minutely: [{ precipitation: 0 }],
  alerts: [{ event: 'Heat Advisory' }],
};

const EVENTS = [{ id: 'e1', summary: 'Dentist' }];

const emptyShared = (): SharedDisplayData => ({
  owmData: null,
  wapiData: null,
  pirateData: null,
  noaaData: null,
  openMeteoData: null,
  yrData: null,
  smhiData: null,
  metofficeData: null,
  envcanadaData: null,
  calendarData: null,
  calendarStatus: { error: null, updatedAt: null },
});

const displaySettings = {
  timezone: 'America/Chicago',
  fullscreenTheme: 'midnight',
  locationName: 'Prior Lake, MN',
  weather: { provider: 'weatherapi', units: 'imperial' as const },
};

const previewSettings: PreviewSettings = {
  latitude: LOCATION.lat,
  longitude: LOCATION.lon,
  locationName: 'Prior Lake, MN',
  timezone: 'America/Chicago',
  globalProvider: 'weatherapi',
  units: 'imperial',
  fullscreenTheme: 'midnight',
  timeFormat: undefined,
  calendarPeople: undefined,
};

const previewData: PreviewData = {
  weatherByProvider: { weatherapi: WEATHER_PAYLOAD },
  calendarEvents: EVENTS,
};

const displaySource = () => toDisplaySource(
  displaySettings,
  LOCATION,
  { ...emptyShared(), wapiData: WEATHER_PAYLOAD, calendarData: { events: EVENTS } },
);

const editorSource = () => toEditorSource(previewSettings, previewData);

const instance = (type: ModuleType, config: Record<string, unknown> = {}) => ({ type, config });

describe('adapter equivalence', () => {
  // Every branch buildModuleProps can take: weather, calendar, the registry
  // `location` requirement, display-control, and a module wanting none of it.
  const TYPES: ModuleType[] = ['weather', 'calendar', 'moon-phase', 'display-control', 'clock'];

  for (const type of TYPES) {
    it(`produces identical props for ${type} from equivalent inputs`, () => {
      expect(buildModuleProps(instance(type), displaySource()))
        .toEqual(buildModuleProps(instance(type), editorSource()));
    });
  }

  it('resolves a per-module provider override the same way on both surfaces', () => {
    const mod = instance('weather', { provider: 'noaa' });
    const shared = { ...emptyShared(), noaaData: WEATHER_PAYLOAD };
    const fromDisplay = buildModuleProps(mod, toDisplaySource(displaySettings, LOCATION, shared));
    const fromEditor = buildModuleProps(mod, toEditorSource(previewSettings, {
      weatherByProvider: { noaa: WEATHER_PAYLOAD },
      calendarEvents: null,
    }));
    expect(fromDisplay.hourly).toEqual(WEATHER_PAYLOAD.hourly);
    expect(fromEditor.hourly).toEqual(WEATHER_PAYLOAD.hourly);
  });

  it('flags locationMissing on both surfaces when coordinates are unset', () => {
    const noCoords: PreviewSettings = { ...previewSettings, latitude: undefined, longitude: undefined };
    expect(buildModuleProps(instance('weather'), toDisplaySource(displaySettings, null, emptyShared())).locationMissing).toBe(true);
    expect(buildModuleProps(instance('weather'), toEditorSource(noCoords, previewData)).locationMissing).toBe(true);
  });
});

describe('buildModuleProps', () => {
  it('threads coordinates to modules declaring the location requirement', () => {
    const props = buildModuleProps(instance('moon-phase'), displaySource());
    expect(props).toMatchObject({ latitude: LOCATION.lat, longitude: LOCATION.lon });
  });

  it('threads coordinates and the place name to weather, which does not declare it', () => {
    const props = buildModuleProps(instance('weather'), displaySource());
    expect(props).toMatchObject({
      latitude: LOCATION.lat,
      longitude: LOCATION.lon,
      locationName: 'Prior Lake, MN',
      units: 'imperial',
    });
  });

  it('leaves weather payload props absent when no data has arrived', () => {
    const props = buildModuleProps(instance('weather'), toDisplaySource(displaySettings, LOCATION, emptyShared()));
    expect(props).not.toHaveProperty('hourly');
    expect(props).not.toHaveProperty('forecast');
    expect(props.units).toBe('imperial');
  });

  it('omits events rather than passing null when no calendar data has arrived', () => {
    const props = buildModuleProps(instance('calendar'), toEditorSource(previewSettings, {
      weatherByProvider: {},
      calendarEvents: null,
    }));
    expect(props).not.toHaveProperty('events');
  });

  it('gives display-control the registered displays', () => {
    const displays = [{ id: 'kitchen', name: 'Kitchen' }];
    const props = buildModuleProps(
      instance('display-control'),
      toDisplaySource(displaySettings, LOCATION, emptyShared(), displays),
    );
    expect(props.availableDisplays).toEqual(displays);
  });

  it('does not give availableDisplays to other module types', () => {
    const props = buildModuleProps(instance('clock'), toDisplaySource(displaySettings, LOCATION, emptyShared(), [
      { id: 'kitchen', name: 'Kitchen' },
    ]));
    expect(props).not.toHaveProperty('availableDisplays');
  });
});

describe('toDisplaySource', () => {
  it('accepts the calendar payload as a bare array or an {events} envelope', () => {
    const wrapped = toDisplaySource(displaySettings, LOCATION, { ...emptyShared(), calendarData: { events: EVENTS } });
    const bare = toDisplaySource(displaySettings, LOCATION, { ...emptyShared(), calendarData: EVENTS });
    expect(wrapped.calendarEvents).toEqual(EVENTS);
    expect(bare.calendarEvents).toEqual(EVENTS);
  });

  it('returns null for a provider that was never fetched', () => {
    expect(displaySource().weather.payloadFor('pirateweather')).toBeNull();
  });
});

describe('toEditorSource', () => {
  it("falls back to the global provider's payload while a switched provider is still fetching", () => {
    const source = toEditorSource(previewSettings, previewData);
    expect(source.weather.payloadFor('pirateweather')).toEqual(WEATHER_PAYLOAD);
  });

  it('supplies safe defaults before the config has loaded', () => {
    const source = toEditorSource(null, { weatherByProvider: {}, calendarEvents: null });
    expect(source.location).toBeNull();
    expect(source.weather.units).toBe('imperial');
    expect(source.weather.globalProvider).toBe('weatherapi');
  });
});

describe('per-module timezone override', () => {
  it('a config timezone wins over the display setting on both surfaces', () => {
    const mod = instance('clock', { timezone: 'Asia/Tokyo' });
    expect(buildModuleProps(mod, displaySource()).timezone).toBe('Asia/Tokyo');
    expect(buildModuleProps(mod, editorSource()).timezone).toBe('Asia/Tokyo');
  });

  it("an empty-string override ('use display setting') falls back to the display timezone", () => {
    const mod = instance('date', { timezone: '' });
    expect(buildModuleProps(mod, displaySource()).timezone).toBe('America/Chicago');
  });

  it('no override passes the display timezone through unchanged', () => {
    expect(buildModuleProps(instance('clock'), displaySource()).timezone).toBe('America/Chicago');
  });
});

describe('timeFormat threading', () => {
  it('buildModuleProps passes a resolved timeFormat to every module (ambient, like timezone)', () => {
    const source = toDisplaySource({ ...displaySettings, timeFormat: '24h' }, LOCATION, emptyShared());
    const cal = buildModuleProps(instance('calendar'), source);
    expect(cal.timeFormat).toBe('24h');
    const other = buildModuleProps(instance('clock'), source);
    expect(other.timeFormat).toBe('24h');
  });

  it('defaults to 12h when no adapter supplies a value', () => {
    const cal = buildModuleProps(instance('calendar'), toDisplaySource(displaySettings, LOCATION, emptyShared()));
    expect(cal.timeFormat).toBe('12h');
  });

  it('toDisplaySource reads settings.timeFormat', () => {
    const source = toDisplaySource({ ...displaySettings, timeFormat: '24h' }, null, emptyShared());
    expect(source.timeFormat).toBe('24h');
  });

  it('toEditorSource reads the preview settings snapshot', () => {
    const source = toEditorSource({ ...previewSettings, timeFormat: '24h' }, { weatherByProvider: {}, calendarEvents: null });
    expect(source.timeFormat).toBe('24h');
  });
});

describe('resolveProvider', () => {
  it("defers to the global provider for 'global' and for non-weather modules", () => {
    expect(resolveProvider({ type: 'weather', config: { provider: 'global' } }, 'noaa')).toBe('noaa');
    expect(resolveProvider({ type: 'weather', config: {} }, 'noaa')).toBe('noaa');
    expect(resolveProvider({ type: 'plugin:strava', config: { provider: 'yr' } }, 'noaa')).toBe('noaa');
  });

  it('honours a weather module override', () => {
    expect(resolveProvider({ type: 'weather', config: { provider: 'yr' } }, 'noaa')).toBe('yr');
  });
});
