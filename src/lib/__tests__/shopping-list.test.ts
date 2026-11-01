import { describe, it, expect } from 'vitest';
import {
  foldedOnOpen,
  groceryShareText,
  mealieShoppingAddedWords,
  mealieShoppingErrorWords,
  mealieShoppingNoticeWords,
  mealieShoppingStaleKey,
  setShoppingItemChecked,
  shoppingAddPlan,
  shoppingCounts,
  shoppingPutBack,
  shoppingItemsNamed,
  shoppingListByName,
  shoppingListView,
  shoppingShareText,
  shoppingTextKey,
  shoppingTicksForName,
  tidyShoppingText,
  type ShoppingItem,
  type ShoppingList,
} from '../shopping-list';

const it_ = (id: string, text: string, fields: Partial<ShoppingItem> = {}): ShoppingItem => ({ id, text, name: text, checked: false, recipes: [], ...fields });

const LIST: ShoppingList = {
  id: 'groceries',
  name: 'Groceries',
  groups: [
    { label: null, items: [it_('milk', 'Milk'), it_('bread', 'Bread', { checked: true })] },
    { label: 'Baking', items: [it_('flour', '140 grams flour', { name: 'flour' }), it_('flour2', '2 tablespoons flour', { name: 'flour' })] },
    { label: 'Spices', items: [it_('salt', 'salt', { note: 'To taste', checked: true }), it_('salt2', '1 teaspoon salt', { name: 'salt', checked: true })] },
  ],
};

describe('shoppingListView', () => {
  it('folds away what was ticked when the tab opened and drops groups left empty', () => {
    const view = shoppingListView(LIST, { folded: foldedOnOpen(LIST), added: new Set() });
    expect(view.groups.map((g) => g.label)).toEqual([null, 'Baking']);
    expect(view.groups[0].items.map((i) => i.id)).toEqual(['milk']);
    expect(view.folded.map((i) => i.id)).toEqual(['bread', 'salt', 'salt2']);
  });

  it('keeps an item ticked this visit where it is', () => {
    const folded = foldedOnOpen(LIST);
    const ticked = setShoppingItemChecked(LIST, 'flour', true);
    const view = shoppingListView(ticked, { folded, added: new Set() });
    expect(view.groups[1].items.map((i) => [i.id, i.checked])).toEqual([['flour', true], ['flour2', false]]);
  });

  it('brings an item put back (here or in Mealie) out of the fold, at the head of its group', () => {
    const folded = foldedOnOpen(LIST);
    const putBack = setShoppingItemChecked(LIST, 'salt2', false);
    const view = shoppingListView(putBack, { folded, added: new Set() });
    expect(view.groups.map((g) => g.label)).toEqual([null, 'Baking', 'Spices']);
    expect(view.groups[2].items.map((i) => [i.id, i.checked])).toEqual([['salt2', false]]);
    // The fold holds only what is still ticked, so its count is true.
    expect(view.folded.map((i) => i.id)).toEqual(['bread', 'salt']);
    expect(shoppingPutBack(putBack, folded)).toEqual(['salt2']);
  });

  it('leads a group with what was added this visit', () => {
    const view = shoppingListView(LIST, { folded: new Set(), added: new Set(['bread']) });
    expect(view.groups[0].items.map((i) => i.id)).toEqual(['bread', 'milk']);
  });

  it("counts what is left to get in each group as drawn, not what was ticked in it this visit", () => {
    const ticked = setShoppingItemChecked(LIST, 'flour', true);
    const view = shoppingListView(ticked, { folded: foldedOnOpen(LIST), added: new Set() });
    expect(view.groups.map((g) => [g.label, g.items.length, g.left])).toEqual([[null, 1, 1], ['Baking', 2, 1]]);
  });
});

describe('setShoppingItemChecked', () => {
  it('answers the same list when nothing changes', () => {
    expect(setShoppingItemChecked(LIST, 'milk', false)).toBe(LIST);
    expect(setShoppingItemChecked(LIST, 'nope', true)).toBe(LIST);
  });

  it('moves the counts', () => {
    expect(shoppingCounts(LIST)).toEqual({ total: 6, got: 3 });
    expect(shoppingCounts(setShoppingItemChecked(LIST, 'milk', true))).toEqual({ total: 6, got: 4 });
  });
});

describe('voice', () => {
  it('finds every item of a name, ignoring case and spaces', () => {
    expect(shoppingItemsNamed(LIST, '  FLOUR ').map((i) => i.id)).toEqual(['flour', 'flour2']);
    expect(shoppingItemsNamed(LIST, ' ')).toEqual([]);
  });

  it('says each name once, ticked only when every one is', () => {
    const ticked = setShoppingItemChecked(LIST, 'flour', true);
    expect(shoppingListByName(ticked)).toEqual([
      { label: null, items: [{ name: 'Milk', checked: false }, { name: 'Bread', checked: true }] },
      { label: 'Baking', items: [{ name: 'flour', checked: false }] },
      { label: 'Spices', items: [{ name: 'salt', checked: true }] },
    ]);
  });

  it('checks off only what is left, and a repeat changes nothing', () => {
    const half = setShoppingItemChecked(LIST, 'flour', true);
    expect(shoppingTicksForName(half, 'flour', 'check')).toEqual({ ids: ['flour2'], checked: true, matched: 2 });
    expect(shoppingTicksForName(setShoppingItemChecked(half, 'flour2', true), 'flour', 'check')).toEqual({ ids: [], checked: true, matched: 2 });
    expect(shoppingTicksForName(LIST, 'salt', 'uncheck')).toEqual({ ids: ['salt', 'salt2'], checked: false, matched: 2 });
    expect(shoppingTicksForName(LIST, 'saffron', 'check')).toEqual({ ids: [], checked: true, matched: 0 });
  });

  it('flips with no direction: ticks while any is left, puts back once all are ticked', () => {
    expect(shoppingTicksForName(setShoppingItemChecked(LIST, 'flour', true), 'flour')).toMatchObject({ ids: ['flour2'], checked: true });
    expect(shoppingTicksForName(LIST, 'salt')).toMatchObject({ ids: ['salt', 'salt2'], checked: false });
  });

  it("finds a line by the food's own name too, and says one thing once", () => {
    const eggs: ShoppingList = { id: 'g', name: 'G', groups: [{ label: 'Dairy', items: [
      it_('e4', '4 eggs', { name: 'eggs', alsoCalled: 'egg' }),
      it_('e1', '1 egg', { name: 'egg', checked: true }),
    ] }] };
    expect(shoppingItemsNamed(eggs, 'Egg').map((i) => i.id)).toEqual(['e4', 'e1']);
    expect(shoppingItemsNamed(eggs, 'eggs').map((i) => i.id)).toEqual(['e4']);
    expect(shoppingListByName(eggs)).toEqual([{ label: 'Dairy', items: [{ name: 'eggs', alsoCalled: 'egg', checked: false }] }]);
  });
});

describe('groceryShareText', () => {
  it('puts each section with something in it under the heading, details in brackets', () => {
    const text = groceryShareText(
      [
        { label: 'Produce', items: [{ text: 'Onions', detail: '3' }, { text: 'Lemons', detail: '' }] },
        { label: 'Dairy', items: [] },
        { label: 'Meat', items: [{ text: 'Ground beef', detail: '2 lb' }] },
      ],
      { heading: "This week's groceries", complete: 'All done!' },
    );
    expect(text).toBe("This week's groceries\n\nProduce\n  Onions (3)\n  Lemons\n\nMeat\n  Ground beef (2 lb)");
  });

  it('says the list is done when no section has anything in it', () => {
    expect(groceryShareText([{ label: 'Dairy', items: [] }], { heading: 'H', complete: 'All done!' })).toBe('All done!');
  });
});

describe('shoppingShareText', () => {
  const words = { heading: 'Groceries', complete: 'All done!', labelFor: (l: string | null) => l ?? 'No label' };

  it('lists what is still to get under its label, notes in brackets', () => {
    const list = setShoppingItemChecked(LIST, 'salt', false);
    expect(shoppingShareText(list, words)).toBe('Groceries\n\nNo label\n  Milk\n\nBaking\n  140 grams flour\n  2 tablespoons flour\n\nSpices\n  salt (To taste)');
  });

  it('says the list is done when nothing is left', () => {
    let list = LIST;
    for (const id of ['milk', 'flour', 'flour2']) list = setShoppingItemChecked(list, id, true);
    expect(shoppingShareText(list, words)).toBe('All done!');
  });
});

describe('shoppingAddPlan', () => {
  it('adds what is not there yet', () => {
    expect(shoppingAddPlan(LIST, 'Lemons')).toEqual({ kind: 'new' });
  });

  it('does not add twice what is there to get, whatever the capitals', () => {
    expect(shoppingAddPlan(LIST, '  MILK ')).toEqual({ kind: 'already', item: LIST.groups[0].items[0] });
  });

  it('puts back what was checked off instead of adding it again', () => {
    expect(shoppingAddPlan(LIST, 'bread')).toEqual({ kind: 'putBack', item: LIST.groups[0].items[1] });
  });

  it("never stands in a recipe's line for the plain words", () => {
    expect(shoppingAddPlan(LIST, 'flour')).toEqual({ kind: 'new' });
  });

  it('matches words typed with extra spaces, the way the hub tidies them before adding', () => {
    const towels: ShoppingList = { id: 'g', name: 'G', groups: [{ label: null, items: [it_('pt', 'Paper towels')] }] };
    expect(shoppingAddPlan(towels, 'Paper  towels')).toEqual({ kind: 'already', item: towels.groups[0].items[0] });
    expect(shoppingAddPlan(LIST, 'Milk ')).toEqual({ kind: 'already', item: LIST.groups[0].items[0] });
  });
});

describe('shopping text', () => {
  it('tidies typed words as a list line keeps them, and keys them ignoring capitals', () => {
    expect(tidyShoppingText('  Paper  towels ')).toBe('Paper towels');
    expect(shoppingTextKey('Paper  towels')).toBe('paper towels');
    expect(shoppingTextKey('Milk ')).toBe('milk');
  });
});

describe('the lines around a Mealie list', () => {
  it('says a write with no reason given did not save, without blaming Mealie', () => {
    expect(mealieShoppingErrorWords({ action: 'choose', problem: null, gone: false })).toEqual({ key: 'saveFailed' });
    expect(mealieShoppingErrorWords({ action: 'tick', items: ['Milk'], problem: null, gone: false })).toEqual({ key: 'notSaved' });
  });

  it('names why when there is a reason', () => {
    expect(mealieShoppingErrorWords({ action: 'undo', problem: 'token', gone: false })).toEqual({ key: 'saveFailed', reason: 'token' });
    expect(mealieShoppingErrorWords({ action: 'choose', problem: 'setup', gone: false })).toEqual({ key: 'saveFailed', reason: 'setup' });
    expect(mealieShoppingErrorWords({ action: 'add', items: ['Milk'], problem: 'setup', gone: false })).toEqual({ key: 'notSavedSetup' });
    expect(mealieShoppingErrorWords({ action: 'tick', items: ['Milk'], problem: 'unreachable', gone: false })).toEqual({ key: 'notSavedUnreachable' });
    expect(mealieShoppingErrorWords({ action: 'add', items: ['Milk'], problem: 'connection', gone: false })).toEqual({ key: 'notSavedConnection' });
    expect(mealieShoppingErrorWords({ action: 'choose', problem: 'connection', gone: false })).toEqual({ key: 'noConnection' });
  });

  it('says a list gone from Mealie is gone, and stays quiet for a tick, which reads the list again', () => {
    expect(mealieShoppingErrorWords({ action: 'choose', problem: null, gone: true })).toEqual({ key: 'listGone' });
    expect(mealieShoppingErrorWords({ action: 'tick', items: ['Milk'], problem: null, gone: true })).toBeNull();
  });

  it('says why the list on screen is old', () => {
    expect(mealieShoppingStaleKey('token')).toBe('staleToken');
    expect(mealieShoppingStaleKey('setup')).toBe('staleSetup');
    expect(mealieShoppingStaleKey(null)).toBe('staleUnreachable');
  });

  it('words the line after an add and the line under the list chooser', () => {
    const added = { text: 'Lemons', list: 'Groceries' };
    expect(mealieShoppingAddedWords({ ...added, kind: 'added', label: 'Produce' })).toEqual({ key: 'addedUnder', vars: { item: 'Lemons', list: 'Groceries', label: 'Produce' } });
    expect(mealieShoppingAddedWords({ ...added, kind: 'added', label: null })).toEqual({ key: 'added', vars: { item: 'Lemons', list: 'Groceries' } });
    expect(mealieShoppingAddedWords({ ...added, kind: 'putBack', label: 'Produce' })).toEqual({ key: 'putBack', vars: { item: 'Lemons', list: 'Groceries' } });
    expect(mealieShoppingNoticeWords({ kind: 'gone', from: 'Party', list: 'Groceries' })).toEqual({ key: 'gone', vars: { from: 'Party', list: 'Groceries' } });
    expect(mealieShoppingNoticeWords({ kind: 'picked', list: 'Costco run', undo: () => {} })).toEqual({ key: 'picked', vars: { list: 'Costco run' } });
  });
});
