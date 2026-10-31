import type { SavedMeal, PlannedMeal } from '@/types/config';
import { guessGroceryCategory } from '@/lib/grocery-categories';
import { planEntryMealIds } from '@/lib/meal-courses';
import { sumGroceryAmounts } from '@/lib/grocery-amounts';
import { SLOT_ORDER } from '@/lib/meal-constants';

export const GROCERY_CATEGORY_ORDER = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other'];

// SVG path data for grocery category icons (Lucide-style)
export const GROCERY_CATEGORY_ICONS: Record<string, string> = {
  produce:   'M17 8C8 10 5.9 16.9 3.9 19.9A2 2 0 005.8 22h12.4a2 2 0 001.9-2.1c-.5-2.5-2-5-4.1-7 M2 12h20',
  meat:      'M13.3 3.7a8 8 0 0111 11l-7.4 7.4a2 2 0 01-2.8 0L3.7 11.7a2 2 0 010-2.8z M8 12l4 4',
  dairy:     'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 6a3 3 0 013 3',
  bakery:    'M4.6 13.11L10 18.5l5.4-5.39a3.82 3.82 0 000-5.39A3.82 3.82 0 0010 7.72a3.82 3.82 0 00-5.4 0 3.82 3.82 0 000 5.39z',
  pantry:    'M21 8v13H3V8 M1 3h22v5H1z M10 12h4',
  frozen:    'M12 2v20 M2 12h20 M4.93 4.93l14.14 14.14 M19.07 4.93L4.93 19.07',
  beverages: 'M8 2h8l4 10H4L8 2z M12 12v6 M6 22h12',
  other:     'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z',
};

/**
 * Whether the aisle headings are worth drawing.
 *
 * One heading over the whole list is not a grouping, it is a label on a flat
 * list, which is what a week of uncategorised items used to produce: a single
 * OTHER above everything. Both surfaces that draw the list read this, so they
 * agree.
 */
export function groceryListNeedsHeadings(
  list: Map<string, { items: unknown[] }>,
): boolean {
  return list.size > 1;
}

function hasIngredients(meal: SavedMeal): boolean {
  return (meal.ingredients ?? []).some((ing) => typeof ing.name === 'string' && ing.name.trim() !== '');
}

/**
 * The family's saved meals planned in the week that have no ingredients yet,
 * once each, in the order they come in the week. They add nothing to the
 * grocery list, so the list says which they are: a roast with no ingredients
 * typed in would otherwise leave the chicken off it without a word. A meal
 * typed straight into the plan has no ingredients to add and is not one.
 */
export function plannedMealsWithoutIngredients(
  planArr: readonly PlannedMeal[],
  meals: readonly SavedMeal[],
): SavedMeal[] {
  const mealMap = new Map(meals.map((m) => [m.id, m]));
  const inOrder = [...planArr].sort(
    (a, b) => a.date.localeCompare(b.date) || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot),
  );
  const found = new Map<string, SavedMeal>();
  for (const entry of inOrder) {
    for (const id of planEntryMealIds(entry)) {
      const meal = mealMap.get(id);
      if (meal && !found.has(id) && !hasIngredients(meal)) found.set(id, meal);
    }
  }
  return [...found.values()];
}

/**
 * Names for a one-line notice, joined the way the language joins a list:
 * every name up to four, else the first three and `more(rest)` ("Soup,
 * Oatmeal, Popcorn and 2 more").
 */
export function shortNameList(names: readonly string[], locale: string, more: (count: number) => string): string {
  const shown = names.length > 4 ? [...names.slice(0, 3), more(names.length - 3)] : [...names];
  try {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(shown);
  } catch {
    return shown.join(', ');
  }
}

/**
 * Generate a grocery list grouped by category from one week's planned meals.
 *
 * `checkedItems` is that same week's ticks (`groceryChecksForWeek`): a tick
 * belongs to the list it was made on, never to every week's.
 */
export function generateGroceryList(
  planArr: PlannedMeal[],
  meals: SavedMeal[],
  checkedItems: readonly string[],
): Map<string, { items: Array<{ name: string; amount: string; checked: boolean }> }> {
  const mealMap = new Map(meals.map((m) => [m.id, m]));
  const grouped = new Map<string, Map<string, string[]>>(); // category -> name -> amounts

  // A meal's courses are shopped for like its main dish: the side and the
  // dessert need their ingredients too.
  const plannedMeals = planArr.flatMap((entry) => planEntryMealIds(entry).map((id) => mealMap.get(id)));
  for (const meal of plannedMeals) {
    if (!meal?.ingredients) continue;
    for (const ing of meal.ingredients) {
      // A row saved with no name (older meals from the phone) is not an item.
      if (typeof ing.name !== 'string' || !ing.name.trim()) continue;
      // The per-row category select is a fourth control on a three-tap row, so
      // most ingredients arrive without one and every item ended up under a
      // single OTHER heading. Guess from the name when the household did not
      // say; a category that names an aisle always wins. "Other" names none:
      // the phone used to save it on every row nobody touched, so it is read
      // as "did not say", and the same ingredient from two meals lands in one
      // aisle, once.
      const said = ing.category && ing.category !== 'other' ? ing.category : undefined;
      const cat = said || guessGroceryCategory(ing.name) || 'other';
      // Merge 'seafood' into 'meat' bucket for display
      const displayCat = cat === 'seafood' ? 'meat' : cat;
      if (!grouped.has(displayCat)) grouped.set(displayCat, new Map());
      const catMap = grouped.get(displayCat)!;
      const key = ing.name.toLowerCase();
      if (!catMap.has(key)) catMap.set(key, []);
      catMap.get(key)!.push(ing.amount ?? '');
    }
  }

  const result = new Map<string, { items: Array<{ name: string; amount: string; checked: boolean }> }>();
  for (const catKey of GROCERY_CATEGORY_ORDER) {
    const catMap = grouped.get(catKey);
    if (!catMap || catMap.size === 0) continue;
    const items = Array.from(catMap.entries()).map(([name, amounts]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      // "Ground beef 5 lb" for a week that plans it three times, not "2 lb, 2 lb, 1 lb".
      amount: sumGroceryAmounts(amounts),
      checked: checkedItems.includes(name.toLowerCase()),
    }));
    items.sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    result.set(catKey, { items });
  }
  return result;
}
