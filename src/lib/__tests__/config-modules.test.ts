import { describe, it, expect } from 'vitest';
import type { ModuleInstance, ScreenConfiguration } from '@/types/config';
import {
  forEachConfigModule,
  mapConfigModules,
  mapConfigScreens,
  rewriteConfigModules,
  rewriteConfigScreens,
  someConfigModule,
  type ModuleSite,
} from '../config-modules';

const mod = (id: string, type = 'clock'): ModuleInstance => ({ id, type, config: {} } as unknown as ModuleInstance);

/** Legacy screens plus two displays, so a walk that skips a pool shows. */
function config(): ScreenConfiguration {
  return {
    version: 1,
    settings: {},
    screens: [{ id: 'legacy', modules: [mod('l1'), mod('l2', 'todo')] }],
    displays: [
      { id: 'main', screens: [{ id: 'm', modules: [mod('m1', 'todo')] }] },
      { id: 'kitchen', screens: [{ id: 'k', modules: [mod('k1')] }, { id: 'k2', modules: [] }] },
    ],
  } as unknown as ScreenConfiguration;
}

describe('rewriteConfigModules', () => {
  it('visits the legacy screens and every display, saying where each module is', () => {
    const seen: Array<[string, ModuleSite['owner'], boolean, string | undefined]> = [];
    rewriteConfigModules(config(), (m, site) => {
      seen.push([m.id, site.owner, site.live, site.display?.id]);
      return m;
    });
    expect(seen).toEqual([
      ['l1', 'legacy', false, undefined],
      ['l2', 'legacy', false, undefined],
      ['m1', 'display', true, 'main'],
      ['k1', 'display', true, 'kitchen'],
    ]);
  });

  it('calls the legacy screens live when there are no displays', () => {
    const single = { ...config(), displays: undefined } as ScreenConfiguration;
    const live: boolean[] = [];
    rewriteConfigModules(single, (m, site) => {
      live.push(site.live);
      return m;
    });
    expect(live).toEqual([true, true]);
  });

  it('returns the very same config when nothing changed', () => {
    const before = config();
    expect(rewriteConfigModules(before, (m) => m)).toBe(before);
  });

  it('copies only the path to a change', () => {
    const before = config();
    const after = rewriteConfigModules(before, (m) => (m.id === 'k1' ? { ...m, type: 'weather' } : m));
    expect(after).not.toBe(before);
    expect(after.screens).toBe(before.screens);
    expect(after.displays![0]).toBe(before.displays![0]);
    expect(after.displays![1]).not.toBe(before.displays![1]);
    expect(after.displays![1].screens[1]).toBe(before.displays![1].screens[1]);
    expect(after.displays![1].screens[0].modules[0].type).toBe('weather');
    // The input is never edited.
    expect(before.displays![1].screens[0].modules[0].type).toBe('clock');
  });

  it('takes a module off its screen when the visitor answers null, on every pool', () => {
    const after = rewriteConfigModules(config(), (m) => (m.type === 'todo' ? null : m));
    expect(after.screens[0].modules.map((m) => m.id)).toEqual(['l1']);
    expect(after.displays![0].screens[0].modules).toEqual([]);
    expect(after.displays![1].screens[0].modules.map((m) => m.id)).toEqual(['k1']);
  });

  it('passes a hand-edited shape through instead of throwing', () => {
    const broken = {
      version: 1,
      settings: {},
      screens: [null, { id: 'no-modules' }, { id: 'ok', modules: [mod('a')] }],
      displays: [null, { id: 'no-screens' }, { id: 'd', screens: [7, { id: 's', modules: [mod('b')] }] }],
    } as unknown as ScreenConfiguration;
    const seen: string[] = [];
    const after = rewriteConfigModules(broken, (m) => {
      seen.push(m.id);
      return m;
    });
    expect(seen).toEqual(['a', 'b']);
    expect(after).toBe(broken);
    expect(rewriteConfigModules({ version: 1, settings: {} } as unknown as ScreenConfiguration, (m) => m)).toEqual({ version: 1, settings: {} });
  });
});

describe('mapConfigModules and mapConfigScreens (the form a migration spreads)', () => {
  it('answer only screens and displays, so a version set beside them survives the spread', () => {
    const before = config();
    const migrated = { ...before, version: 2, ...mapConfigModules(before, (m) => m) };
    expect(migrated.version).toBe(2);
    expect(Object.keys(mapConfigModules(before, (m) => m)).sort()).toEqual(['displays', 'screens']);
  });

  it('leave displays out for a config that has none', () => {
    const single = { version: 1, settings: {}, screens: [] } as unknown as ScreenConfiguration;
    expect('displays' in mapConfigScreens(single, (s) => s)).toBe(false);
  });

  it('keep the arrays they were given when no screen changed', () => {
    const before = config();
    const out = mapConfigScreens(before, (s) => s);
    expect(out.screens).toBe(before.screens);
    expect(out.displays).toBe(before.displays);
  });
});

describe('rewriteConfigScreens', () => {
  it('tells the visitor each screen\'s place in its own list', () => {
    const places: Array<[string, number]> = [];
    rewriteConfigScreens(config(), (screen, _site, _display, index) => {
      places.push([screen.id, index]);
      return screen;
    });
    expect(places).toEqual([['legacy', 0], ['m', 0], ['k', 0], ['k2', 1]]);
  });
});

describe('someConfigModule and forEachConfigModule', () => {
  it('find a module that sits only on a display', () => {
    expect(someConfigModule(config(), (m) => m.id === 'k1')).toBe(true);
    expect(someConfigModule(config(), (m) => m.type === 'news')).toBe(false);
  });

  it('let a caller edit its own copy in place', () => {
    const copy = config();
    forEachConfigModule(copy, (m) => {
      if (m.type === 'todo') m.config = { touched: true };
    });
    expect(copy.screens[0].modules[1].config).toEqual({ touched: true });
    expect(copy.displays![0].screens[0].modules[0].config).toEqual({ touched: true });
  });
});
