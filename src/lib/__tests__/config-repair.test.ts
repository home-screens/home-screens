import { describe, expect, it } from 'vitest';
import { repairConfigShape } from '../config-repair';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance, ScreenConfiguration } from '@/types/config';

const sound: ModuleInstance = {
  id: 'clock-1',
  type: 'clock',
  position: { x: 10, y: 20 },
  size: { w: 300, h: 200 },
  zIndex: 1,
  style: { ...DEFAULT_MODULE_STYLE },
  config: {},
};

function configWith(modules: unknown[], displays?: unknown[]): ScreenConfiguration {
  return {
    version: 14,
    settings: {},
    screens: [{ id: 's1', name: 'Home', backgroundImage: '', modules }],
    ...(displays ? { displays } : {}),
  } as unknown as ScreenConfiguration;
}

describe('repairConfigShape', () => {
  it('hands back the same config when every module is whole', () => {
    const config = configWith([sound]);
    expect(repairConfigShape(config)).toBe(config);
  });

  it('gives a module with a missing piece a plain stand-in, and keeps the rest of it', () => {
    const config = configWith([
      sound,
      { ...sound, id: 'weather-1', type: 'weather', config: null },
      { ...sound, id: 'date-1', type: 'date', position: null, size: { w: 'wide' }, zIndex: undefined, style: null },
    ]);
    const repaired = repairConfigShape(config);
    const [first, weather, date] = repaired.screens[0].modules;
    expect(first).toBe(sound);
    expect(weather).toEqual({ ...sound, id: 'weather-1', type: 'weather', config: {} });
    expect(date.position).toEqual({ x: 0, y: 0 });
    expect(date.size).toEqual({ w: 400, h: 300 });
    expect(date.zIndex).toBe(1);
    expect(date.style).toEqual(DEFAULT_MODULE_STYLE);
  });

  it('leaves out an entry that is not a module at all', () => {
    const repaired = repairConfigShape(configWith([null, 'clock', { ...sound, type: 7 }, { id: 'no-type' }, sound]));
    expect(repaired.screens[0].modules).toEqual([sound]);
  });

  it('gives a module with no id one that is the same on every read', () => {
    const config = configWith([sound, { ...sound, id: '' }]);
    const once = repairConfigShape(config).screens[0].modules[1].id;
    expect(once).toBe('module-s1-1');
    expect(repairConfigShape(config).screens[0].modules[1].id).toBe(once);
  });

  it('repairs the screens of every display too', () => {
    const config = configWith([sound], [
      { id: 'main', name: 'Main', screens: [{ id: 'm1', name: 'A', backgroundImage: '', modules: [{ ...sound, config: null }] }] },
      { id: 'kitchen', name: 'Kitchen', screens: [{ id: 'k1', name: 'B', backgroundImage: '', modules: [sound] }] },
    ]);
    const repaired = repairConfigShape(config);
    expect(repaired.screens).toBe(config.screens);
    expect(repaired.displays![0].screens[0].modules[0].config).toEqual({});
    expect(repaired.displays![1]).toBe(config.displays![1]);
  });
});

describe('repairConfigShape: the household\'s calendar names and colours', () => {
  const withLooks = (calendarOverrides: unknown) => ({
    version: 1, screens: [], settings: { calendar: { googleCalendarIds: [], calendarOverrides } },
  }) as unknown as ScreenConfiguration;

  it('leaves sound names and colours as they are', () => {
    const config = withLooks({ work: { name: 'Work', color: '#10b981' } });
    expect(repairConfigShape(config)).toBe(config);
  });

  it('drops what a hand edit left that is not a name or a #rrggbb colour', () => {
    const repaired = repairConfigShape(withLooks({ work: { name: 42, color: '#10b981' }, home: { name: 'Home', color: 'blue' }, odd: 'x' }));
    expect(repaired.settings.calendar.calendarOverrides).toEqual({ work: { color: '#10b981' }, home: { name: 'Home' } });
  });

  it('removes the map when nothing in it is usable', () => {
    const repaired = repairConfigShape(withLooks([1, 2]));
    expect('calendarOverrides' in repaired.settings.calendar).toBe(false);
  });
});
