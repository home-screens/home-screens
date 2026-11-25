import { describe, expect, it } from 'vitest';
import { addItemIfNew, itemTextKey, orderWithItemAt, sameItemText } from '../todo-actions';
import { groceryAddListId, groceryCardAdds, todoCardAdds, wallMayAddToList, wallMayAddToMealie } from '../todo-wall';
import type { ScreenConfiguration } from '@/types/config';
import type { TodoData } from '@/types/todos';

const NOW = '2026-11-20T12:00:00.000Z';

function configWith(...modules: Array<{ type: string; config: Record<string, unknown>; enabled?: boolean }>): ScreenConfiguration {
  return {
    version: 21,
    settings: {},
    screens: [{ id: 's', name: 'S', modules: modules.map((m, i) => ({ id: `m${i}`, position: { x: 0, y: 0 }, size: { w: 1, h: 1 }, style: {}, ...m })) }],
  } as unknown as ScreenConfiguration;
}

describe('todoCardAdds', () => {
  it('needs taps, adding, and a view that lists items', () => {
    expect(todoCardAdds({ view: 'list', interactive: true, wallAdd: true })).toBe(true);
    expect(todoCardAdds({ view: 'compact', interactive: true, wallAdd: true })).toBe(true);
    expect(todoCardAdds({ view: 'board', interactive: true, wallAdd: true })).toBe(true);
    expect(todoCardAdds({ interactive: true, wallAdd: true })).toBe(true);
    expect(todoCardAdds({ view: 'focus', interactive: true, wallAdd: true })).toBe(false);
    expect(todoCardAdds({ view: 'progress', interactive: true, wallAdd: true })).toBe(false);
    expect(todoCardAdds({ view: 'list', wallAdd: true })).toBe(false);
    expect(todoCardAdds({ view: 'list', interactive: true })).toBe(false);
  });
});

describe('groceryCardAdds', () => {
  it('needs the grocery view and adding; taps are on unless switched off', () => {
    expect(groceryCardAdds({ view: 'grocery', wallAdd: true })).toBe(true);
    expect(groceryCardAdds({ view: 'grocery', wallAdd: true, interactive: false })).toBe(false);
    expect(groceryCardAdds({ view: 'week', wallAdd: true })).toBe(false);
    expect(groceryCardAdds({ view: 'grocery' })).toBe(false);
  });
});

describe('groceryAddListId', () => {
  it('is the list picked for other things to buy, unless the plan lives in Mealie', () => {
    expect(groceryAddListId({ groceryExtrasListId: 'shop' })).toBe('shop');
    expect(groceryAddListId({ groceryExtrasListId: 'shop', planSource: 'mealie' })).toBeNull();
    expect(groceryAddListId({})).toBeNull();
  });
});

describe('wallMayAddToList', () => {
  const card = { type: 'todo', config: { view: 'list', listId: 'shop', interactive: true, wallAdd: true } };

  it('allows the list a card shows with adding on, and no other', () => {
    expect(wallMayAddToList(configWith(card), 'shop', {})).toBe(true);
    expect(wallMayAddToList(configWith(card), 'jobs', {})).toBe(false);
  });

  it('counts a Board card for every list', () => {
    expect(wallMayAddToList(configWith({ type: 'todo', config: { view: 'board', interactive: true, wallAdd: true } }), 'jobs', {})).toBe(true);
  });

  it('ignores a card that is switched off', () => {
    expect(wallMayAddToList(configWith({ ...card, enabled: false }), 'shop', {})).toBe(false);
  });

  it('counts a grocery card for the list picked for other things to buy', () => {
    const grocery = { type: 'meal-planner', config: { view: 'grocery', wallAdd: true } };
    expect(wallMayAddToList(configWith(grocery), 'shop', { groceryExtrasListId: 'shop' })).toBe(true);
    expect(wallMayAddToList(configWith(grocery), 'shop', {})).toBe(false);
    expect(wallMayAddToList(configWith(grocery), 'shop', { groceryExtrasListId: 'shop', planSource: 'mealie' })).toBe(false);
  });

  it('counts the full-screen meal planner the same as the small card', () => {
    const fullscreen = { type: 'fullscreen-meal-planner', config: { view: 'grocery', wallAdd: true } };
    expect(wallMayAddToList(configWith(fullscreen), 'shop', { groceryExtrasListId: 'shop' })).toBe(true);
    expect(wallMayAddToMealie(configWith(fullscreen), { planSource: 'mealie' })).toBe(true);
    expect(wallMayAddToList(configWith({ ...fullscreen, config: { view: 'week', wallAdd: true } }), 'shop', { groceryExtrasListId: 'shop' })).toBe(false);
  });
});

describe('wallMayAddToMealie', () => {
  it('needs a grocery card with adding on and the plan in Mealie', () => {
    const grocery = { type: 'meal-planner', config: { view: 'grocery', wallAdd: true } };
    expect(wallMayAddToMealie(configWith(grocery), { planSource: 'mealie' })).toBe(true);
    expect(wallMayAddToMealie(configWith(grocery), {})).toBe(false);
    expect(wallMayAddToMealie(configWith({ type: 'meal-planner', config: { view: 'grocery' } }), { planSource: 'mealie' })).toBe(false);
  });
});

describe('a card left in the old screens after displays were added', () => {
  // Adding the first display copies the screens into it and leaves the
  // originals behind; no wall draws those, and no edit reaches them.
  const withDisplays = (
    legacy: Array<{ type: string; config: Record<string, unknown> }>,
    live: Array<{ type: string; config: Record<string, unknown> }>,
  ): ScreenConfiguration => ({
    ...configWith(...legacy),
    displays: [{ id: 'main', name: 'Main', screens: configWith(...live).screens }],
  }) as unknown as ScreenConfiguration;

  const todoOn = { type: 'todo', config: { view: 'list', listId: 'shop', interactive: true, wallAdd: true } };
  const todoOff = { type: 'todo', config: { view: 'list', listId: 'shop', interactive: true, wallAdd: false } };
  const groceryOn = { type: 'meal-planner', config: { view: 'grocery', wallAdd: true } };
  const groceryOff = { type: 'meal-planner', config: { view: 'grocery', wallAdd: false } };

  it('does not count for a to-do list', () => {
    expect(wallMayAddToList(withDisplays([todoOn], [todoOff]), 'shop', {})).toBe(false);
    expect(wallMayAddToList(withDisplays([todoOff], [todoOn]), 'shop', {})).toBe(true);
  });

  it('does not count for the grocery list, here or in Mealie', () => {
    expect(wallMayAddToList(withDisplays([groceryOn], [groceryOff]), 'shop', { groceryExtrasListId: 'shop' })).toBe(false);
    expect(wallMayAddToMealie(withDisplays([groceryOn], [groceryOff]), { planSource: 'mealie' })).toBe(false);
    expect(wallMayAddToMealie(withDisplays([groceryOff], [groceryOn]), { planSource: 'mealie' })).toBe(true);
  });
});

describe('sameItemText', () => {
  it('reads capitals and spacing as the same thing, different words as different', () => {
    expect(sameItemText('Milk', ' milk ')).toBe(true);
    expect(sameItemText('MILK', 'milk')).toBe(true);
    expect(sameItemText('Paper  towels', 'paper towels')).toBe(true);
    expect(sameItemText('Milk', '2% milk')).toBe(false);
  });

  it('reads words typed without their accents as the same thing', () => {
    expect(sameItemText('Pão', 'Pao')).toBe(true);
    expect(sameItemText('Crème fraîche', 'Creme fraiche')).toBe(true);
    expect(sameItemText('crème fraîche', 'CREME FRAICHE')).toBe(true);
    expect(sameItemText('Äpfel', 'apfel')).toBe(true);
    expect(sameItemText('Açúcar', 'acucar')).toBe(true);
    // English keyboards, the wall's included, have no ñ.
    expect(sameItemText('Jalapeños', 'jalapenos')).toBe(true);
    // A phone or a paste can send an accent as a letter plus a mark of its own.
    expect(sameItemText('Cre\u0300me', 'crème')).toBe(true);
  });

  it('spells out letters with no mark to take off: ß, œ and ł', () => {
    expect(sameItemText('Süßkartoffeln', 'Susskartoffeln')).toBe(true);
    expect(sameItemText('STRASSE', 'Straße')).toBe(true);
    expect(sameItemText('Bœuf', 'boeuf')).toBe(true);
    expect(sameItemText('Œufs', 'oeufs')).toBe(true);
    expect(sameItemText('Kiełbasa', 'kielbasa')).toBe(true);
  });

  it("keeps Danish æ, ø and å as letters of their own: to a Dane 'Ål' is not 'Al'", () => {
    expect(sameItemText('Ål', 'Al')).toBe(false);
    expect(sameItemText('Ål', 'ål')).toBe(true);
    expect(sameItemText('A\u030Al', 'ål')).toBe(true);
    expect(sameItemText('Æg', 'ag')).toBe(false);
    expect(sameItemText('Æg', 'aeg')).toBe(false);
    expect(sameItemText('ÆG', 'æg')).toBe(true);
    expect(sameItemText('Øl', 'ol')).toBe(false);
    expect(sameItemText('Øl', 'øl')).toBe(true);
    expect(sameItemText('Rødkål', 'rodkal')).toBe(false);
    expect(sameItemText('RØDKÅL', 'rødkål')).toBe(true);
  });

  it('compares by one key, which is never what the list shows', () => {
    expect(itemTextKey('  Crème   Fraîche ')).toBe('creme fraiche');
    expect(itemTextKey('Rødkål')).toBe('rødkål');
    expect(itemTextKey(itemTextKey('Süßkartoffeln'))).toBe(itemTextKey('Süßkartoffeln'));
  });
});

describe('addItemIfNew', () => {
  const data = (): TodoData => ({
    lists: [{
      id: 'shop', name: 'Shopping', slug: 'shopping', repeat: 'never', createdAt: NOW, updatedAt: NOW,
      items: [
        { id: 'milk', text: 'Milk', completed: false, createdAt: NOW },
        { id: 'eggs-old', text: 'Eggs', completed: true, createdAt: NOW, completedAt: '2026-11-01T09:00:00.000Z' },
        { id: 'eggs-new', text: 'eggs', completed: true, createdAt: NOW, completedAt: '2026-11-18T09:00:00.000Z' },
      ],
    }],
  });

  it('changes nothing for an item still to do', () => {
    const before = data();
    const result = addItemIfNew(before, 'shop', { text: 'MILK' });
    expect(result.outcome).toBe('already');
    expect(result.data).toBe(before);
    expect(result.item.id).toBe('milk');
  });

  it('puts back the most recently ticked copy instead of making another', () => {
    const result = addItemIfNew(data(), 'shop', { text: 'Eggs' }, new Date(NOW));
    expect(result.outcome).toBe('putBack');
    expect(result.item).toMatchObject({ id: 'eggs-new', completed: false });
    expect(result.item.completedAt).toBeUndefined();
    expect(result.data.lists[0].items.find((it) => it.id === 'eggs-old')?.completed).toBe(true);
    expect(result.data.lists[0].items).toHaveLength(3);
  });

  it('refuses words typed without their accents, and the item keeps its own spelling', () => {
    const before: TodoData = { lists: [{ ...data().lists[0], items: [
      { id: 'cf', text: 'Crème fraîche', completed: false, createdAt: NOW },
      { id: 'pao', text: 'Pão', completed: true, createdAt: NOW, completedAt: '2026-11-18T09:00:00.000Z' },
    ] }] };
    const already = addItemIfNew(before, 'shop', { text: 'creme fraiche' }, new Date(NOW));
    expect(already.outcome).toBe('already');
    expect(already.data).toBe(before);
    expect(already.item).toMatchObject({ id: 'cf', text: 'Crème fraîche' });
    const putBack = addItemIfNew(before, 'shop', { text: 'pao' }, new Date(NOW));
    expect(putBack.outcome).toBe('putBack');
    expect(putBack.item).toMatchObject({ id: 'pao', text: 'Pão', completed: false });
    expect(putBack.data.lists[0].items.map((it) => it.text)).toEqual(['Crème fraîche', 'Pão']);
  });

  it('adds a Danish word that only looks like one on the list', () => {
    const before: TodoData = { lists: [{ ...data().lists[0], items: [{ id: 'eel', text: 'Ål', completed: false, createdAt: NOW }] }] };
    const result = addItemIfNew(before, 'shop', { text: 'Al' }, new Date(NOW));
    expect(result.outcome).toBe('added');
    expect(result.data.lists[0].items.map((it) => it.text)).toEqual(['Ål', 'Al']);
  });

  it('adds something new at the end', () => {
    const result = addItemIfNew(data(), 'shop', { text: 'Bread' }, new Date(NOW));
    expect(result.outcome).toBe('added');
    expect(result.data.lists[0].items.at(-1)).toMatchObject({ text: 'Bread', completed: false });
  });

  it('still refuses nothing typed', () => {
    expect(() => addItemIfNew(data(), 'shop', { text: '  ' })).toThrow('Type something first');
  });
});

describe('orderWithItemAt', () => {
  it('moves a put-back item to where it was', () => {
    expect(orderWithItemAt(['a', 'b', 'c', 'new'], 'new', 1)).toEqual(['a', 'new', 'b', 'c']);
    expect(orderWithItemAt(['a', 'new'], 'new', 0)).toEqual(['new', 'a']);
  });

  it('leaves it at the end when the list got shorter meanwhile, and leaves an unknown id alone', () => {
    expect(orderWithItemAt(['a', 'new'], 'new', 5)).toEqual(['a', 'new']);
    expect(orderWithItemAt(['a', 'b'], 'gone', 0)).toEqual(['a', 'b']);
  });
});

describe('the words a list keeps', () => {
  it('keeps one line with single spaces, whoever typed them', () => {
    const data: TodoData = { migratedFromConfig: true, lists: [{ id: 'l', name: 'Shopping', slug: 'shopping', repeat: 'never', createdAt: '', updatedAt: '', items: [] }] };
    expect(addItemIfNew(data, 'l', { text: '  Paper  Towels\n' }).item.text).toBe('Paper Towels');
  });
});
