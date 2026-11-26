import type { TodoListItem } from '@/types/todos';
import type { GroceryList } from './grocery-utils';
import { groceryItemKey, type GroceryCheckDirection } from './grocery-checks';

/**
 * A tick by name on this week's grocery list: "check off milk" from a voice
 * assistant, or an automation that knows an item by what the list calls it
 * rather than by the row it is drawn on. The phone and the wall tick a row;
 * a name can be on two rows at once, a meal's ingredient and an item on the
 * list picked for the other things to buy. It is one thing to buy, so it is
 * ticked on both, the way a Mealie list ticks every item of that name
 * (`shoppingTicksForName`).
 */
export interface GroceryNameTick {
  /**
   * The tick on the meals' ingredients, as `setGroceryCheck` takes it; null
   * leaves them alone. A name only on the other-things list is never written
   * there, or it would come up ticked on a meal planned later in the week.
   */
  meal: { direction?: GroceryCheckDirection } | null;
  /**
   * The other-things items to tick (`completed: true`) or put back, by id:
   * those of that name not already that way. Null when the name is not on
   * that list.
   */
  todo: { ids: string[]; completed: boolean } | null;
}

/**
 * What a tick by name does. `meals` is the week's list from its planned meals
 * (`weekGroceryList`), and `extras` what of the other-things list is on it
 * (`groceryExtrasItems`), empty when the household has none or the tick is
 * for another week. A name not on that list belongs to the meals alone and
 * keeps the call as it was sent, the flip included, so nothing changes for a
 * household with no list picked. With no direction, a name on both is ticked
 * while any of its rows is left to get, and put back once every one is.
 */
export function groceryTickByName(
  meals: GroceryList,
  extras: readonly TodoListItem[],
  name: string,
  direction?: GroceryCheckDirection,
): GroceryNameTick {
  const key = groceryItemKey(name);
  const named = extras.filter((it) => groceryItemKey(it.text) === key);
  if (named.length === 0) return { meal: { direction }, todo: null };
  const ingredient = [...meals.values()].flatMap((group) => group.items).find((it) => groceryItemKey(it.name) === key);
  const rows = [...(ingredient ? [ingredient.checked] : []), ...named.map((it) => it.completed)];
  const completed = direction ? direction === 'check' : rows.some((checked) => !checked);
  return {
    meal: ingredient ? { direction: completed ? 'check' : 'uncheck' } : null,
    todo: { ids: named.filter((it) => it.completed !== completed).map((it) => it.id), completed },
  };
}
