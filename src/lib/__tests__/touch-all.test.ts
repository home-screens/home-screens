import { describe, expect, it } from 'vitest';
import type { DisplayNode, ModuleInstance, ScreenConfiguration } from '@/types/config';
import editor from '@/translations/en-US/editor.json';
import { getModuleDefinition } from '@/lib/module-registry';
import {
  MODULE_TOUCH_SWITCHES,
  applyTouchChanges,
  groupTouchSwitches,
  planTouchSwitches,
  listTouchSwitches,
  newCardsStartTouchOff,
  planTouchAll,
  touchAreaCounts,
  touchState,
  withTouchOff,
} from '@/lib/touch-all';

function mod(id: string, type: string, config: Record<string, unknown> = {}): ModuleInstance {
  return { id, type, config, position: { x: 0, y: 0 }, size: { width: 100, height: 100 }, zIndex: 1, style: {} } as unknown as ModuleInstance;
}

function screen(id: string, name: string, modules: ModuleInstance[]) {
  return { id, name, modules } as unknown as ScreenConfiguration['screens'][number];
}

function single(modules: ModuleInstance[], settings: Record<string, unknown> = {}): ScreenConfiguration {
  return {
    version: 1,
    settings: { calendar: {}, ...settings },
    screens: [screen('s1', 'Home', modules)],
  } as unknown as ScreenConfiguration;
}

function multi(displays: Partial<DisplayNode>[], settings: Record<string, unknown> = {}): ScreenConfiguration {
  return {
    version: 1,
    settings: { calendar: {}, ...settings },
    // The frozen copy a multi-display config still carries; nothing renders it.
    screens: [screen('old', 'Old', [mod('m-old', 'todo', { interactive: true })])],
    displays,
  } as unknown as ScreenConfiguration;
}

const press = (config: ScreenConfiguration, on: boolean, displayId?: string) =>
  applyTouchChanges(config, planTouchAll(config, { displayId }, on));

function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>((at, part) => (at as Record<string, unknown> | undefined)?.[part], editor);
}

describe('touch switch table', () => {
  it('names a real label for every switch', () => {
    for (const rules of Object.values(MODULE_TOUCH_SWITCHES)) {
      for (const rule of rules ?? []) expect(typeof lookup(rule.labelKey), rule.labelKey).toBe('string');
    }
  });

  it('makes a switch depend only on another switch of the same module', () => {
    for (const [type, rules] of Object.entries(MODULE_TOUCH_SWITCHES)) {
      for (const rule of rules ?? []) {
        if (rule.needs) expect((rules ?? []).some((other) => other.field === rule.needs && !other.needs), `${type}.${rule.field}`).toBe(true);
      }
    }
  });

  it('covers only module types that exist, and every switch a new module starts with', () => {
    for (const [type, rules] of Object.entries(MODULE_TOUCH_SWITCHES)) {
      const def = getModuleDefinition(type as ModuleInstance['type']);
      expect(def, type).toBeTruthy();
      expect(def?.takesTaps, type).toBe(true);
      const off = withTouchOff(type as ModuleInstance['type'], def!.defaultConfig);
      for (const rule of rules ?? []) expect(rule.isOn(off[rule.field]), `${type}.${rule.field}`).toBe(false);
    }
  });
});

describe('listTouchSwitches', () => {
  it('reads an absent value the way the wall does', () => {
    const config = single([mod('p', 'photo-slideshow'), mod('t', 'todo'), mod('n', 'news'), mod('c', 'calendar')]);
    const on = Object.fromEntries(listTouchSwitches(config).map((s) => [s.key, s.on]));
    expect(on['module::p:interactive']).toBe(true);
    expect(on['module::t:interactive']).toBe(false);
    expect(on['module::n:tapAction']).toBe(true);
    expect(on['module::c:eventTapDetails']).toBe(false);
    expect(on['module::c:addEvents']).toBe(true);
    expect(on['module::c:wallViews']).toBe(false);
  });

  it('counts pausing only while the dots show, and wall adding only once adding is on', () => {
    const keys = (config: ScreenConfiguration) => listTouchSwitches(config).filter((s) => !s.module).map((s) => s.key);
    expect(keys(single([]))).toEqual(['setting::swipeEnabled', 'setting::pauseEnabled']);
    expect(keys(single([], { showPaginationDots: false }))).toEqual(['setting::swipeEnabled']);
    expect(keys(single([], { calendar: { eventEntry: { enabled: true } } }))).toContain('setting::calendarWallEntry');
  });

  it('skips the frozen top-level screens of a multi-display config and keeps to the display asked for', () => {
    const config = multi([
      { id: 'kitchen', name: 'Kitchen', screens: [screen('k1', 'Home', [mod('a', 'todo', { interactive: true })])] },
      { id: 'tv', name: 'TV', screens: [screen('t1', 'Pictures', [mod('b', 'photo-slideshow')])] },
    ]);
    expect(listTouchSwitches(config).some((s) => s.module?.id === 'm-old')).toBe(false);
    const tv = listTouchSwitches(config, { displayId: 'tv' });
    expect(tv.map((s) => s.displayId)).toEqual(['tv', 'tv', 'tv']);
    expect(tv.find((s) => s.module)?.module?.screenName).toBe('Pictures');
  });
});

describe('All off and All on', () => {
  const base = single([
    mod('c', 'calendar', { eventTapDetails: true, wallViews: ['week'], showOnePerson: true }),
    mod('t', 'todo', { interactive: true, wallAdd: true }),
    mod('n', 'news', { tapAction: 'details' }),
    mod('m', 'meal-planner', { tapRecipeAction: 'qr', wallPlan: true }),
    mod('w', 'weather', { units: 'metric' }),
  ]);

  it('All off turns every switch off and nothing else', () => {
    const off = press(base, false);
    expect(touchState(listTouchSwitches(off))).toBe('off');
    expect(off.settings.swipeEnabled).toBe(false);
    expect(off.settings.pauseEnabled).toBe(false);
    expect(off.settings.newCardsTouchOff).toBe(true);
    expect(off.screens[0].modules[4]).toBe(base.screens[0].modules[4]);
    expect(off.screens[0].modules[2].config.tapAction).toBe('none');
    expect(off.screens[0].modules[0].config.wallViews).toEqual([]);
  });

  it('All on turns every switch on, and keeps a choice somebody made', () => {
    const on = press(press(base, false), true);
    expect(touchState(listTouchSwitches(on))).toBe('on');
    expect(on.settings.newCardsTouchOff).toBeUndefined();
    // Filled from what a new module gets.
    expect(on.screens[0].modules[2].config.tapAction).toBe('qr');
    expect(on.screens[0].modules[0].config.wallViews).toEqual(getModuleDefinition('calendar')!.defaultConfig.wallViews);
    // Left alone when it was not at nothing.
    const kept = press(base, true);
    expect(kept.screens[0].modules[2].config.tapAction).toBe('details');
    expect(kept.screens[0].modules[3].config.tapRecipeAction).toBe('qr');
    expect(kept.screens[0].modules[0].config.wallViews).toEqual(['week']);
  });

  it('plans nothing when it is already so', () => {
    const off = press(base, false);
    expect(planTouchAll(off, {}, false)).toEqual([]);
    expect(applyTouchChanges(off, [])).toBe(off);
  });

  it('undo puts back exactly what was there, and keeps an edit made in between', () => {
    const changes = planTouchAll(base, {}, false);
    const off = applyTouchChanges(base, changes);
    const edited = { ...off, settings: { ...off.settings, rotationIntervalMs: 9000 } } as ScreenConfiguration;
    const back = applyTouchChanges(edited, changes, 'back');
    expect(back.settings.rotationIntervalMs).toBe(9000);
    expect(back.screens).toEqual(base.screens);
    expect('swipeEnabled' in back.settings).toBe(false);
    expect('newCardsTouchOff' in back.settings).toBe(false);
  });

  it('a switch changed afterwards stays, and shows as a mix', () => {
    const off = press(base, false);
    const one = applyTouchChanges(off, [{ kind: 'module', moduleId: 't', field: 'interactive', from: false, to: true }]);
    const switches = listTouchSwitches(one);
    expect(touchState(switches)).toBe('some');
    expect(switches.filter((s) => s.on).map((s) => s.key)).toEqual(['module::t:interactive']);
    expect(touchAreaCounts(switches, true).find((row) => row.area === 'tap')).toEqual({ area: 'tap', total: 2, changing: 1 });
  });
});

describe('more than one display', () => {
  const config = multi(
    [
      { id: 'kitchen', name: 'Kitchen', settings: { swipeEnabled: false }, screens: [screen('k1', 'Home', [mod('a', 'todo', { interactive: true })])] },
      { id: 'tv', name: 'TV', screens: [screen('t1', 'Pictures', [mod('b', 'photo-slideshow')])] },
    ],
    { swipeEnabled: true },
  );
  const display = (c: ScreenConfiguration, id: string) => c.displays!.find((d) => d.id === id)!;

  it('one display: only its modules and its own settings change', () => {
    const off = press(config, false, 'tv');
    expect(touchState(listTouchSwitches(off, { displayId: 'tv' }))).toBe('off');
    expect(display(off, 'tv').settings).toEqual({ swipeEnabled: false, pauseEnabled: false });
    expect(display(off, 'tv').newCardsTouchOff).toBe(true);
    expect(display(off, 'kitchen')).toBe(display(config, 'kitchen'));
    expect(off.settings).toBe(config.settings);
    expect(off.screens).toBe(config.screens);
    expect(newCardsStartTouchOff(off, 'tv')).toBe(true);
    expect(newCardsStartTouchOff(off, 'kitchen')).toBe(false);
  });

  it('one display back on follows the shared value again', () => {
    const on = press(press(config, false, 'tv'), true, 'tv');
    expect(display(on, 'tv').settings).toBeUndefined();
    expect(display(on, 'tv').newCardsTouchOff).toBeUndefined();
  });

  it('every display: the shared value is set and the displays stop having their own', () => {
    const off = press(press(config, false, 'tv'), false);
    expect(off.settings.swipeEnabled).toBe(false);
    expect(display(off, 'kitchen').settings).toBeUndefined();
    expect(display(off, 'tv').settings).toBeUndefined();
    expect(display(off, 'tv').newCardsTouchOff).toBeUndefined();
    expect(touchState(listTouchSwitches(off))).toBe('off');
    expect(newCardsStartTouchOff(off, 'kitchen')).toBe(true);
    // The frozen copy is not touched.
    expect(off.screens).toBe(config.screens);
    const on = press(off, true);
    expect(touchState(listTouchSwitches(on))).toBe('on');
  });
});

describe('one screen or one switch at a time', () => {
  const config = multi(
    [
      {
        id: 'kitchen',
        name: 'Kitchen',
        screens: [
          screen('k1', 'Home', [
            mod('a', 'todo', { interactive: true, wallAdd: false }),
            { ...mod('b', 'todo', {}), style: { title: 'Weekend jobs' } } as ModuleInstance,
            mod('c', 'todo', {}),
            mod('n', 'notes', { wallDraw: true }),
          ]),
          screen('k2', 'Meals', [mod('m', 'meal-planner', {})]),
        ],
      },
      { id: 'tv', name: 'TV', screens: [screen('t1', 'Pictures', [mod('a', 'todo', { interactive: true })])] },
    ],
    { swipeEnabled: true },
  );
  const all = () => listTouchSwitches(config);
  const flip = (c: ScreenConfiguration, pick: (s: ReturnType<typeof listTouchSwitches>[number]) => boolean, on: boolean) =>
    applyTouchChanges(c, planTouchSwitches(c, listTouchSwitches(c).filter(pick), on));

  it('groups by display, then screen, then module, and tells same-kind modules apart', () => {
    const groups = groupTouchSwitches(all());
    expect(groups.map((g) => g.displayName)).toEqual(['Kitchen', 'TV']);
    const [own, home, meals] = groups[0].rows;
    expect(own.kind).toBe('display');
    expect([home.screenName, meals.screenName]).toEqual(['Home', 'Meals']);
    expect(home.modules.map((m) => [m.type, m.title, m.number])).toEqual([
      ['todo', undefined, 1],
      ['todo', 'Weekend jobs', undefined],
      ['todo', undefined, 3],
      ['notes', undefined, undefined],
    ]);
    const add = home.switches.find((s) => s.key === 'module:kitchen:a:wallAdd')!;
    expect(add.needsKey).toBe('module:kitchen:a:interactive');
  });

  it('a screen off changes that screen only, and not how new modules start', () => {
    const off = flip(config, (s) => s.module?.screenId === 'k1' && s.displayId === 'kitchen', false);
    const home = groupTouchSwitches(listTouchSwitches(off))[0].rows[1];
    expect(home.switches.every((s) => !s.on)).toBe(true);
    expect(off.displays![0].screens[1]).toBe(config.displays![0].screens[1]);
    // The TV has a module with the same id; it is another display's.
    expect(off.displays![1]).toBe(config.displays![1]);
    expect(off.settings).toBe(config.settings);
    expect(off.displays![0].newCardsTouchOff).toBeUndefined();
  });

  it('one switch flips alone, and a choice fills in what a new module gets', () => {
    const on = flip(config, (s) => s.key === 'module:kitchen:m:tapRecipeAction', true);
    expect(on.displays![0].screens[1].modules[0].config).toEqual({ tapRecipeAction: 'card' });
  });

  it("a display's own swipe goes into that display, and back to following the shared value", () => {
    const off = flip(config, (s) => s.key === 'setting:tv:swipeEnabled', false);
    expect(off.displays![1].settings).toEqual({ swipeEnabled: false });
    expect(off.settings).toBe(config.settings);
    const on = flip(off, (s) => s.key === 'setting:tv:swipeEnabled', true);
    expect(on.displays![1].settings).toBeUndefined();
  });

  it('with a single display the shared setting itself is flipped', () => {
    const one = single([mod('t', 'todo')]);
    const off = flip(one, (s) => s.key === 'setting::swipeEnabled', false);
    expect(off.settings.swipeEnabled).toBe(false);
    expect(planTouchSwitches(off, listTouchSwitches(off).filter((s) => !s.on), false)).toEqual([]);
  });
});
