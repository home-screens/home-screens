import type { ShoppingItem, ShoppingList, ShoppingListSummary } from './shopping-list';

/**
 * A Mealie shopping list as the Grocery tab draws it. Pure, and tested
 * against a list recorded from a real Mealie 3.29.
 */

// ── Mealie's shapes, only the fields Home Screens reads ──

export interface MealieShoppingLabel {
  id: string;
  name: string;
}

export interface MealieShoppingItem {
  id: string;
  shoppingListId: string;
  checked: boolean;
  position?: number | null;
  quantity?: number | null;
  note?: string | null;
  /** Mealie's own wording of the whole line: amount, unit, food, note. */
  display?: string | null;
  food?: { name?: string | null } | null;
  unit?: { name?: string | null; pluralName?: string | null; abbreviation?: string | null; pluralAbbreviation?: string | null } | null;
  label?: MealieShoppingLabel | null;
  recipeReferences?: { recipeId: string }[] | null;
}

export interface MealieShoppingListRaw {
  id: string;
  name: string;
  createdAt?: string | null;
  listItems?: MealieShoppingItem[] | null;
  /** The list's own order of labels. */
  labelSettings?: { position: number; label: MealieShoppingLabel }[] | null;
  /** The recipes added to the list, with their names. */
  recipeReferences?: { recipeId: string; recipe?: { name?: string | null } | null }[] | null;
}

/**
 * One item as a line on the list.
 *
 * A typed item (no food, no unit) is its note; Mealie stores "Milk" typed in
 * its own box with quantity 0, and items made through its API often carry
 * quantity 1, which `display` writes as "1 Milk". Anything else reads as
 * Mealie writes it, with the note on a line of its own the way Mealie's list
 * shows it.
 */
function itemWords(item: MealieShoppingItem): Pick<ShoppingItem, 'text' | 'note' | 'name' | 'alsoCalled'> {
  const note = (item.note ?? '').trim();
  const display = (item.display ?? '').trim();
  const food = (item.food?.name ?? '').trim();
  if (!food) {
    const typed = !item.unit && (item.quantity ?? 0) <= 1 && !!note;
    const text = typed ? note : display || note;
    return { text, name: note || text };
  }
  const text = (note && display.endsWith(note) ? display.slice(0, -note.length).trim() : display) || food;
  const name = spokenName(text, item.unit) || food;
  return {
    text,
    ...(note ? { note } : {}),
    name,
    ...(name.toLowerCase() !== food.toLowerCase() ? { alsoCalled: food } : {}),
  };
}

/** An amount as Mealie writes one at the start of a line: "2", "1.5", "1 ¹/₄", "½". */
const LEADING_AMOUNT = /^[\d\s.,/⁄¹²³⁴⁵⁶⁷⁸⁹⁰₀₁₂₃₄₅₆₇₈₉½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+/u;

/**
 * What a line is, without its amount and unit, in the line's own words: "4
 * eggs" is "eggs", "5 bay leaves" is "bay leaves", "8 Slices bread" is
 * "bread". It is what a person says ("check off the eggs"), where Mealie's
 * food name is singular ("egg"). Empty when nothing is left.
 */
function spokenName(text: string, unit: MealieShoppingItem['unit']): string {
  let rest = text.replace(LEADING_AMOUNT, '').trim();
  const unitWords = [unit?.pluralName, unit?.name, unit?.pluralAbbreviation, unit?.abbreviation]
    .flatMap((w) => (w?.trim() ? [w.trim(), `${w.trim()}s`, `${w.trim()}es`] : []))
    .sort((a, b) => b.length - a.length);
  const lower = rest.toLowerCase();
  const unitWord = unitWords.find((w) => lower.startsWith(`${w.toLowerCase()} `));
  if (unitWord) rest = rest.slice(unitWord.length).trim();
  return rest;
}

/** The recipe ids a list's items are on the list for. */
export function mealieListRecipeIds(raw: MealieShoppingListRaw): string[] {
  return [...new Set((raw.listItems ?? []).flatMap((i) => (i.recipeReferences ?? []).map((r) => r.recipeId)).filter(Boolean))];
}

/** The recipe names a list itself carries, by id. */
export function mealieListRecipeNames(raw: MealieShoppingListRaw): Map<string, string> {
  const names = new Map<string, string>();
  for (const ref of raw.recipeReferences ?? []) {
    const name = ref.recipe?.name?.trim();
    if (ref.recipeId && name) names.set(ref.recipeId, name);
  }
  return names;
}

/**
 * Mealie's list in the list's own label order, items with no label first, as
 * Mealie draws it. Recipe names come from the list's own references, then
 * `knownRecipes`: Mealie drops a recipe from the list's references once every
 * one of its items is ticked, while each item still names its recipe.
 */
export function mapMealieShoppingList(raw: MealieShoppingListRaw, knownRecipes?: ReadonlyMap<string, string>): ShoppingList {
  const recipes = new Map(knownRecipes);
  for (const [id, name] of mealieListRecipeNames(raw)) recipes.set(id, name);
  const labelOrder = new Map<string, number>();
  for (const setting of raw.labelSettings ?? []) labelOrder.set(setting.label.id, setting.position);

  const items = (raw.listItems ?? [])
    .filter((i) => typeof i?.id === 'string')
    .map((item, index) => ({ item, index }));
  // Within a label Mealie orders by position; a tie keeps the order it answered in.
  items.sort((a, b) => (a.item.position ?? 0) - (b.item.position ?? 0) || a.index - b.index);

  const groups = new Map<string, ShoppingList['groups'][number]>();
  for (const { item } of items) {
    const key = item.label?.id ?? '';
    let group = groups.get(key);
    if (!group) groups.set(key, group = { label: item.label?.name?.trim() || null, items: [] });
    const names = (item.recipeReferences ?? []).map((r) => recipes.get(r.recipeId)).filter((n): n is string => !!n);
    group.items.push({ id: item.id, ...itemWords(item), checked: !!item.checked, recipes: [...new Set(names)] });
  }
  const rank = (key: string) => (key === '' ? -Infinity : labelOrder.get(key) ?? Number.MAX_SAFE_INTEGER);
  const ordered = [...groups.entries()].sort(([a, ga], [b, gb]) => rank(a) - rank(b) || (ga.label ?? '').localeCompare(gb.label ?? ''));
  return { id: raw.id, name: raw.name, groups: ordered.map(([, g]) => g) };
}

export function mealieListSummary(raw: MealieShoppingListRaw): ShoppingListSummary {
  return { id: raw.id, name: raw.name, left: (raw.listItems ?? []).filter((i) => !i.checked).length };
}
