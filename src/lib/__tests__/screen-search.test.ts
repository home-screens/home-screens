import { describe, it, expect } from 'vitest';
import { searchScreens } from '../screen-search';
import type { ModuleInstance, ModuleType, Screen, ScreenConfiguration } from '@/types/config';

function mod(type: ModuleType, id = `${type}-${Math.random().toString(36).slice(2, 6)}`): ModuleInstance {
  return { id, type, position: { x: 0, y: 0 }, size: { w: 100, h: 100 }, config: {} } as ModuleInstance;
}

function screen(id: string, name: string, modules: ModuleInstance[]): Screen {
  return { id, name, backgroundImage: '', modules };
}

const LABELS: Record<string, string> = {
  clock: 'Clock',
  weather: 'Weather',
  'fullscreen-weather': 'Full Screen Weather',
  'chore-chart': 'Chore Chart',
  'plugin:acme:strava': 'Strava',
};
const resolve = (type: ModuleType) => LABELS[type] ?? type;

function legacyConfig(screens: Screen[]): ScreenConfiguration {
  return { version: 4, settings: {}, screens } as unknown as ScreenConfiguration;
}

describe('searchScreens', () => {
  const morning = screen('morning', 'Morning', [mod('clock'), mod('clock'), mod('weather')]);
  const evening = screen('evening', 'Evening', [mod('clock'), mod('chore-chart')]);
  const clockWall = screen('wall', 'Clock wall', [mod('weather')]);

  it('returns nothing for an empty or whitespace query', () => {
    const cfg = legacyConfig([morning]);
    expect(searchScreens(cfg, '', resolve, null)).toEqual([]);
    expect(searchScreens(cfg, '   ', resolve, null)).toEqual([]);
  });

  it('matches module labels case-insensitively and counts repeats per screen', () => {
    const results = searchScreens(legacyConfig([morning, evening, clockWall]), 'CLOCK', resolve, null);
    expect(results.map((r) => r.screen.id)).toEqual(['morning', 'evening', 'wall']);
    expect(results[0].moduleHits).toEqual([{ type: 'clock', label: 'Clock', count: 2 }]);
    expect(results[0].nameMatch).toBe(false);
    expect(results[0].nameRange).toBeNull();
    expect(results[1].moduleHits).toEqual([{ type: 'clock', label: 'Clock', count: 1 }]);
  });

  it('matches screen names and reports the matched range', () => {
    const results = searchScreens(legacyConfig([morning, clockWall]), 'clock w', resolve, null);
    expect(results).toHaveLength(1);
    expect(results[0].screen.id).toBe('wall');
    expect(results[0].nameMatch).toBe(true);
    expect(results[0].nameRange).toEqual({ start: 0, end: 7 });
    expect(results[0].moduleHits).toEqual([]);
  });

  it('locates the highlight in the original name when lowercasing changes its length', () => {
    // U+0130 lowercases to two code units, shifting every offset after it.
    const cfg = legacyConfig([screen('ist', 'İstanbul Clock', [])]);
    const [result] = searchScreens(cfg, 'clock', resolve, null);
    expect(result.nameMatch).toBe(true);
    expect(result.nameRange).toEqual({ start: 9, end: 14 });
    expect('İstanbul Clock'.slice(9, 14)).toBe('Clock');
  });

  it('treats regex metacharacters in the query literally', () => {
    const cfg = legacyConfig([screen('q', 'İ (kids)', []), screen('r', 'İ kids', [])]);
    const results = searchScreens(cfg, '(kids)', resolve, null);
    expect(results.map((r) => r.screen.id)).toEqual(['q']);
    expect(results[0].nameRange).toEqual({ start: 2, end: 8 });
  });

  it('a substring finds every module whose label contains it', () => {
    const cfg = legacyConfig([screen('w', 'Wx', [mod('weather'), mod('fullscreen-weather'), mod('clock')])]);
    const [result] = searchScreens(cfg, 'weath', resolve, null);
    expect(result.moduleHits.map((h) => h.type)).toEqual(['weather', 'fullscreen-weather']);
  });

  it('matches plugin modules through the resolver and falls back to the raw type', () => {
    const cfg = legacyConfig([screen('p', 'Plugins', [mod('plugin:acme:strava'), mod('plugin:acme:unknown' as ModuleType)])]);
    expect(searchScreens(cfg, 'strava', resolve, null)[0].moduleHits[0].label).toBe('Strava');
    expect(searchScreens(cfg, 'unknown', resolve, null)[0].moduleHits[0].label).toBe('plugin:acme:unknown');
  });

  it('uses the legacy screen pool with a null display when no displays are registered', () => {
    const [result] = searchScreens(legacyConfig([morning]), 'morn', resolve, null);
    expect(result.displayId).toBeNull();
    expect(result.displayName).toBeNull();
  });

  it('searches every display and lists the selected display first', () => {
    const cfg = {
      version: 4,
      settings: {},
      screens: [],
      displays: [
        { id: 'main', name: 'Main', screens: [screen('m1', 'Main clocks', [mod('clock')])] },
        { id: 'hall', name: 'Hallway', screens: [screen('h1', 'Hall', [mod('clock')]), screen('h2', 'Hall 2', [mod('weather')])] },
      ],
    } as unknown as ScreenConfiguration;

    const fromHall = searchScreens(cfg, 'clock', resolve, 'hall');
    expect(fromHall.map((r) => `${r.displayId}/${r.screen.id}`)).toEqual(['hall/h1', 'main/m1']);
    expect(fromHall[1].displayName).toBe('Main');

    const fromMain = searchScreens(cfg, 'clock', resolve, 'main');
    expect(fromMain.map((r) => r.screen.id)).toEqual(['m1', 'h1']);
  });
});
