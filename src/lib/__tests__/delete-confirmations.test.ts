import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { lookupKey } from '@/i18n/fallback';
import { buildDeleteConfirm, buildLibraryDeleteConfirm, buildModuleDeleteConfirm, buildScreenDeleteConfirm } from '@/lib/delete-confirmations';
import editor from '@/translations/en-US/editor.json';
import core from '@/translations/en-US/core.json';
import type { Dictionary } from '@/i18n/types';
import type { ModuleInstance } from '@/types/config';

/** The real lookup, so the dictionary's own plural branches are exercised. */
const translator = (dict: Dictionary) => (key: string, vars?: Record<string, string | number>) =>
  lookupKey(dict, key, vars, 'en-US') ?? key;

const t = translator(editor as Dictionary);
const tCore = translator(core as Dictionary);

const modules = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}` })) as ModuleInstance[];

describe('buildScreenDeleteConfirm', () => {
  it('names the screen and how many modules go with it', () => {
    const four = buildScreenDeleteConfirm({ name: 'Weather', modules: modules(4) }, t, tCore);
    expect(four.title).toContain('Weather');
    expect(four.message).toContain('4');
    expect(four.message.toLowerCase()).toContain('module');
  });

  it('gets its plural from the dictionary, not from concatenation', () => {
    const one = buildScreenDeleteConfirm({ name: 'Weather', modules: modules(1) }, t, tCore);
    expect(one.message).toContain('1 module');
    expect(one.message).not.toContain('modules');

    const none = buildScreenDeleteConfirm({ name: 'Weather', modules: [] }, t, tCore);
    expect(none.message).not.toContain('0 module');
  });

  it('says the delete can be undone, because it can', () => {
    for (const count of [0, 1, 4]) {
      const built = buildScreenDeleteConfirm({ name: 'Weather', modules: modules(count) }, t, tCore);
      expect(built.message.toLowerCase()).toContain('undo');
    }
  });

  it('names the buttons that open the screen, since they go with it', () => {
    for (const count of [0, 1, 4]) {
      const built = buildScreenDeleteConfirm({ name: 'Recipe Book', modules: modules(count) }, t, tCore, { names: ['Meal Planner on Kitchen'], count: 1 });
      expect(built.message).toContain('Meal Planner on Kitchen has a button that opens this screen');
      expect(built.message.toLowerCase()).toContain('undo');
      expect(built.message).not.toMatch(/\{\w+\}/);
    }
    expect(buildScreenDeleteConfirm({ name: 'R', modules: modules(4) }, t, tCore, { names: ['X on Y'], count: 1 }).message).toContain('4 modules');
  });

  it('says "buttons" when more than one module opens the screen', () => {
    const several = buildScreenDeleteConfirm({ name: 'R', modules: modules(1) }, t, tCore, { names: ['Clock on Hall', 'Meals on Kitchen'], count: 2 });
    expect(several.message).toContain('Clock on Hall, Meals on Kitchen have buttons that open this screen');
    expect(several.message).toContain('1 module');
    // Two of the same module on one screen are named once, but still two buttons.
    const twins = buildScreenDeleteConfirm({ name: 'R', modules: [] }, t, tCore, { names: ['Clock on Hall (2)'], count: 2 });
    expect(twins.message).toContain('Clock on Hall (2) have buttons that open this screen');
  });

  it('resolves every string it returns, leaving no raw key behind', () => {
    for (const count of [0, 1, 4]) {
      const built = buildScreenDeleteConfirm({ name: 'S', modules: modules(count) }, t, tCore);
      for (const value of [built.title, built.message, built.confirmLabel]) {
        expect(value).not.toMatch(/^[a-z][\w.]*\.[\w.]+$/);
        expect(value).not.toMatch(/\{\w+\}/);
      }
    }
  });
});

describe('buildModuleDeleteConfirm', () => {
  it('names the module instead of asking about "this module"', () => {
    const built = buildModuleDeleteConfirm('Clock', t, tCore);
    expect(built.title).toContain('Clock');
    expect(built.title.toLowerCase()).not.toContain('this module');
  });
});

describe('one verb for one action', () => {
  it('uses the same confirm button label on both screen paths and on a module', () => {
    const tab = buildScreenDeleteConfirm({ name: 'Weather', modules: modules(4) }, t, tCore);
    const menu = buildScreenDeleteConfirm({ name: 'Weather', modules: modules(4) }, t, tCore);
    const oneModule = buildModuleDeleteConfirm('Clock', t, tCore);
    expect(tab.confirmLabel).toBe(menu.confirmLabel);
    expect(tab.confirmLabel).toBe(oneModule.confirmLabel);
    expect(tab.confirmLabel).toBe(tCore('actions.delete'));
  });

  it('asks the question with the same verb the button answers with', () => {
    const built = buildScreenDeleteConfirm({ name: 'Weather', modules: modules(4) }, t, tCore);
    expect(built.title.toLowerCase()).toContain(built.confirmLabel.toLowerCase());
  });

  it('leaves the screen tabs no way to pick a second verb', () => {
    // The "x" on a tab and the "..." menu are one action. They used to answer
    // the same question with Remove and Delete respectively.
    const source = readFileSync('src/components/editor/ScreenTabs.tsx', 'utf8');
    expect(source).not.toContain('actions.remove');
    expect(source.match(/buildScreenDeleteConfirm\(/g) ?? []).toHaveLength(2);
  });
});

describe('buildDeleteConfirm', () => {
  it('asks with the verb, quotes the name in curly quotes, and answers with the same verb', () => {
    expect(buildDeleteConfirm({ verb: 'delete', name: 'Kitchen', consequence: 'Its 4 modules go with it.' }, tCore)).toEqual({
      title: 'Delete “Kitchen”?',
      message: 'Its 4 modules go with it.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    expect(buildDeleteConfirm({ verb: 'remove', name: 'School', consequence: 'x' }, tCore).title).toBe('Remove “School”?');
    expect(buildDeleteConfirm({ verb: 'clear', name: 'Breakfast', consequence: 'x' }, tCore).confirmLabel).toBe('Clear');
  });

  it('takes a whole question for something with no name, and a fuller answer when given', () => {
    const built = buildDeleteConfirm({ verb: 'remove', question: 'Remove 3 done items?', consequence: 'x', confirmLabel: 'Remove items' }, tCore);
    expect(built.title).toBe('Remove 3 done items?');
    expect(built.confirmLabel).toBe('Remove items');
  });

  it('has a shared title for every verb', () => {
    for (const verb of ['delete', 'remove', 'clear'] as const) {
      expect(lookupKey(core as Dictionary, `confirm.${verb}Title`), verb).toContain('“{name}”');
      expect(lookupKey(core as Dictionary, `actions.${verb}`), verb).toBeTruthy();
    }
  });
});

describe('buildLibraryDeleteConfirm', () => {
  it('names one picture, and counts several', () => {
    expect(buildLibraryDeleteConfirm(['IMG_1234.JPG'], t, tCore).title).toBe('Delete “IMG_1234.JPG”?');
    expect(buildLibraryDeleteConfirm(['a.jpg', 'b.jpg', 'c.jpg'], t, tCore).title).toBe('Delete 3 files?');
  });

  it('says a Live Photo clip goes with its picture', () => {
    expect(buildLibraryDeleteConfirm(['IMG_1.JPG'], t, tCore, 1).message).toMatch(/Its Live Photo clip goes with it\.$/);
    expect(buildLibraryDeleteConfirm(['a.jpg', 'b.jpg'], t, tCore, 2).message).toMatch(/Their Live Photo clips go with them\.$/);
    expect(buildLibraryDeleteConfirm(['a.jpg'], t, tCore).message).not.toMatch(/Live Photo/);
  });
});
