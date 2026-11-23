import type { FullscreenMealPlannerConfig, MealPlannerConfig, MealSettings, ModuleInstance, ScreenConfiguration, TodoConfig } from '@/types/config';
import { someConfigModule, type ModuleSite } from './config-modules';

/**
 * What the wall may put on a list. A Pi kiosk holds the display token, and so
 * does any address on the sign-in bypass list, so the hub takes a list item
 * from that token only where a card on some wall offers an Add row, and only
 * words. Changing and removing stay with the phone and the editor.
 *
 * The cards read the same rules (`todoCardAdds`, `groceryCardAdds`) to decide
 * whether to draw the row, so a card never offers what the hub would refuse.
 * Pure: no server imports.
 */

/** The most a wall item may say, counted with `textLength`. Plenty for "Batteries (AA) for the smoke alarm". */
export const WALL_ITEM_MAX_LENGTH = 80;

/** A to-do card draws its Add row: taps on, adding on, and a view that lists items. */
export function todoCardAdds(config: Partial<TodoConfig>): boolean {
  const view = config.view ?? 'list';
  return !!config.interactive && !!config.wallAdd && (view === 'list' || view === 'compact' || view === 'board');
}

/**
 * A meal planner draws its Add row (the small card) or button (the full-screen
 * one): the grocery view, taps on (omitted means on, as everywhere in the
 * meal planner) and adding on.
 */
export function groceryCardAdds(config: Partial<MealPlannerConfig> | Partial<FullscreenMealPlannerConfig>): boolean {
  return config.view === 'grocery' && config.interactive !== false && !!config.wallAdd;
}

/** Either meal planner, small or full screen, in the grocery view with adding on. */
function isAddingGroceryCard(mod: ModuleInstance): boolean {
  if (mod.type !== 'meal-planner' && mod.type !== 'fullscreen-meal-planner') return false;
  return groceryCardAdds(mod.config as Partial<MealPlannerConfig>);
}

/**
 * A card some wall draws: switched on, and not one left behind in the old
 * top-level screens. Adding the first display copies those screens into it
 * and every later edit goes to a display, so a card there keeps whatever it
 * said that day and would go on allowing an Add row nobody can switch off.
 */
function onSomeWall(mod: ModuleInstance, site: ModuleSite): boolean {
  return site.live && mod.enabled !== false;
}

/** The meal settings that decide where a grocery card's Add goes. */
export type GroceryAddSettings = Pick<MealSettings, 'planSource' | 'groceryExtrasListId'>;

/**
 * The to-do list a grocery card adds to while the plan is kept in Home
 * Screens: the one picked for the other things to buy. Null with none picked,
 * or while the plan lives in Mealie (which has its own list).
 */
export function groceryAddListId(meals: GroceryAddSettings): string | null {
  return meals.planSource === 'mealie' ? null : meals.groceryExtrasListId ?? null;
}

/**
 * Whether some card in the config lets the wall add to this to-do list: a
 * List or Compact card showing it, a Board card (it shows every list), or a
 * grocery card adding to it as the family's other things to buy. A card that
 * is switched off, or that no wall draws, counts for nothing.
 */
export function wallMayAddToList(config: ScreenConfiguration, listId: string, meals: GroceryAddSettings): boolean {
  const groceryList = groceryAddListId(meals);
  return someConfigModule(config, (mod, site) => {
    if (!onSomeWall(mod, site)) return false;
    if (mod.type === 'todo') {
      const card = mod.config as Partial<TodoConfig>;
      return todoCardAdds(card) && (card.view === 'board' || card.listId === listId);
    }
    return groceryList === listId && isAddingGroceryCard(mod);
  });
}

/** Whether some grocery card lets the wall add to the Mealie list the family shops from. */
export function wallMayAddToMealie(config: ScreenConfiguration, meals: GroceryAddSettings): boolean {
  if (meals.planSource !== 'mealie') return false;
  return someConfigModule(config, (mod, site) => onSomeWall(mod, site) && isAddingGroceryCard(mod));
}
