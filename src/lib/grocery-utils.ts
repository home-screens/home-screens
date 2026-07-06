import type { SavedMeal, PlannedMeal } from '@/types/config';

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

/** Generate a grocery list grouped by category from planned meals. */
export function generateGroceryList(
  planArr: PlannedMeal[],
  meals: SavedMeal[],
  checkedItems: string[],
): Map<string, { items: Array<{ name: string; amount: string; checked: boolean }> }> {
  const mealMap = new Map(meals.map((m) => [m.id, m]));
  const grouped = new Map<string, Map<string, string>>(); // category -> name -> amount

  for (const entry of planArr) {
    if (!entry.mealId) continue;
    const meal = mealMap.get(entry.mealId);
    if (!meal?.ingredients) continue;
    for (const ing of meal.ingredients) {
      const cat = ing.category || 'other';
      // Merge 'seafood' into 'meat' bucket for display
      const displayCat = cat === 'seafood' ? 'meat' : cat;
      if (!grouped.has(displayCat)) grouped.set(displayCat, new Map());
      const catMap = grouped.get(displayCat)!;
      const existing = catMap.get(ing.name.toLowerCase());
      const amt = ing.amount ?? '';
      if (existing && amt) {
        catMap.set(ing.name.toLowerCase(), `${existing}, ${amt}`);
      } else if (!existing) {
        catMap.set(ing.name.toLowerCase(), amt);
      }
    }
  }

  const result = new Map<string, { items: Array<{ name: string; amount: string; checked: boolean }> }>();
  for (const catKey of GROCERY_CATEGORY_ORDER) {
    const catMap = grouped.get(catKey);
    if (!catMap || catMap.size === 0) continue;
    const items = Array.from(catMap.entries()).map(([name, amount]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      amount,
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
