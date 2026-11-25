import { displayCache } from '@/lib/display-cache';
import { displayFetch } from '@/lib/display-fetch';
import { addToMealieShoppingList, loadMealieShopping, removeMealieShoppingItem, tickMealieShoppingItem } from '@/lib/meal-client';
import { shoppingItems } from '@/lib/shopping-list';
import { addItemRequest, deleteItemRequest, sendTodoWrite, updateItemRequest } from '@/lib/todo-client';
import type { WallAddResult } from './WallAddSheet';
import { WALL_SHOPPING_URL } from './useWallGrocery';

/**
 * One Add from a wall to a to-do list, as `WallAddSheet` shows it. The hub
 * keeps to one copy (`addItemIfNew`), so the answer says whether the words
 * made a new item, were already there, or put a ticked one back. Undo takes a
 * new item off again (the hub lets a wall remove what it added moments ago)
 * or ticks a put-back one again. `itemId` is the item the add landed on, for
 * a card that shows it.
 */
export async function addToTodoListFromWall(listId: string, text: string, failedText: string): Promise<WallAddResult & { itemId?: string }> {
  const { lists, created, outcome = 'added' } = await sendTodoWrite(displayFetch, addItemRequest(listId, text), failedText);
  if (!created) return { outcome, text };
  const item = lists.find((l) => l.id === listId)?.items.find((it) => it.id === created.id);
  const undo = outcome === 'added'
    ? async () => { await sendTodoWrite(displayFetch, deleteItemRequest(listId, created.id), failedText); }
    : outcome === 'putBack'
      ? async () => { await sendTodoWrite(displayFetch, updateItemRequest(listId, created.id, { completed: true }), failedText); }
      : undefined;
  return { outcome, text: item?.text ?? text, undo, itemId: created.id };
}

/**
 * One Add from a wall to the Mealie list the family shops from. The answer
 * carries the list read fresh, which every grocery card on the wall shows at
 * once. The hub keeps one of each thing here too, so the answer says whether
 * the words made a new line, were already there, or put a ticked one back;
 * Mealie may also fold a repeat into a line it counts as the same, which
 * leaves nothing new to undo.
 */
export async function addToMealieFromWall(listId: string, text: string, ttlMs: number): Promise<WallAddResult> {
  const { wire, added, outcome, item } = await addToMealieShoppingList(displayFetch, listId, text);
  displayCache.replace(WALL_SHOPPING_URL, wire, ttlMs);
  const reread = async () => {
    displayCache.replace(WALL_SHOPPING_URL, await loadMealieShopping(displayFetch), ttlMs);
  };
  if (outcome === 'already' || outcome === 'putBack') {
    // The line as the list says it, not as it was typed.
    const there = item && wire.list ? shoppingItems(wire.list).find((i) => i.id === item) : undefined;
    const undo = outcome === 'putBack' && item
      ? async () => { await tickMealieShoppingItem(displayFetch, item, true); await reread(); }
      : undefined;
    return { outcome, text: there?.text ?? text, ...(undo ? { undo } : {}) };
  }
  if (!added) return { outcome: 'merged', text };
  return {
    outcome: 'added',
    text,
    undo: async () => {
      await removeMealieShoppingItem(displayFetch, added);
      await reread();
    },
  };
}
