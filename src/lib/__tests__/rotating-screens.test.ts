import { describe, it, expect } from 'vitest';
import { selectRotatingScreens } from '@/lib/rotating-screens';
import type { ModuleInstance, Screen } from '@/types/config';

function makeModule(id = 'm1', enabled?: boolean): ModuleInstance {
  return {
    id,
    type: 'clock',
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 1,
    config: {},
    style: {},
    ...(enabled === undefined ? {} : { enabled }),
  } as ModuleInstance;
}

function makeScreen(id: string, modules: ModuleInstance[] = [], extra: Partial<Screen> = {}): Screen {
  return { id, name: id, backgroundImage: '', modules, ...extra };
}

describe('selectRotatingScreens', () => {
  it('drops a screen whose only modules are shown on every screen or run hidden', () => {
    const full = makeScreen('s1', [makeModule()]);
    const dockOnly = makeScreen('s2', [{ ...makeModule('dock'), showOnEveryScreen: true }, { ...makeModule('bg'), backgroundProvider: true }]);
    const dockOnWallpaper = makeScreen('s3', [{ ...makeModule('dock'), showOnEveryScreen: true }], { backgroundImage: '/bg.jpg' });
    const dockWithClock = makeScreen('s4', [{ ...makeModule('dock'), showOnEveryScreen: true }, makeModule('clock')]);

    expect(selectRotatingScreens([full, dockOnly, dockOnWallpaper, dockWithClock])).toEqual([full, dockOnWallpaper, dockWithClock]);
    // Nothing else to show: the list stays as it is, like the all-empty case.
    expect(selectRotatingScreens([dockOnly])).toEqual([dockOnly]);
  });

  it('drops a screen with nothing on it from a rotation that has content elsewhere', () => {
    const full1 = makeScreen('s1', [makeModule()]);
    const blank = makeScreen('s2');
    const full2 = makeScreen('s3', [makeModule()]);

    expect(selectRotatingScreens([full1, blank, full2])).toEqual([full1, full2]);
  });

  it('keeps the order and identity of the screens it passes through', () => {
    const screens = [makeScreen('a', [makeModule()]), makeScreen('b'), makeScreen('c', [makeModule()])];
    const rotating = selectRotatingScreens(screens);

    expect(rotating.map((s) => s.id)).toEqual(['a', 'c']);
    expect(rotating[0]).toBe(screens[0]);
    expect(rotating[1]).toBe(screens[2]);
  });

  it('keeps a wallpaper-only screen: a background is something to show', () => {
    const wallpaper = makeScreen('s2', [], { backgroundImage: '/backgrounds/lake.jpg' });
    const rotating = makeScreen('s1', [makeModule()]);

    expect(selectRotatingScreens([rotating, wallpaper]).map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('keeps a screen whose only content is a rotating background', () => {
    const slideshow = makeScreen('s2', [], {
      backgroundRotation: { enabled: true, source: 'unsplash', query: 'lakes', intervalMinutes: 30 },
    });
    const rotating = makeScreen('s1', [makeModule()]);

    expect(selectRotatingScreens([rotating, slideshow]).map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('keeps a screen whose modules are all switched off: somebody put them there', () => {
    const offButAuthored = makeScreen('s2', [makeModule('m2', false)]);
    const rotating = makeScreen('s1', [makeModule()]);

    expect(selectRotatingScreens([rotating, offButAuthored]).map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('hands back every screen when they are all empty, so the setup hint still shows', () => {
    const screens = [makeScreen('s1'), makeScreen('s2')];

    expect(selectRotatingScreens(screens)).toEqual(screens);
  });

  it('hands back the single empty screen a fresh install ships with', () => {
    const screens = [makeScreen('default')];

    expect(selectRotatingScreens(screens)).toEqual(screens);
  });

  it('returns nothing when there is nothing to start with', () => {
    expect(selectRotatingScreens([])).toEqual([]);
  });
});
