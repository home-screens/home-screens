import type { MealCourseKind, SavedMeal } from '@/types/config';
import { parseMealieMealId } from './mealie-map';
import { normalizeTag, type LibraryFilter } from './meal-constants';

/**
 * Small rules about how a dish is offered and described wherever the family
 * plans meals: which cooking time a row shows, how typed words narrow the
 * family's own meals, and which of them a course picker lists first. The
 * phone and the editor draw these their own way; what they show must agree.
 */

/** True for a recipe read from Mealie (its id is `mealie:<recipe id>`). */
export function isMealieMeal(meal: Pick<SavedMeal, 'id'> | null | undefined): boolean {
  return !!meal && parseMealieMealId(meal.id) !== null;
}

/** The one cooking time a row shows for a dish, in minutes, and which time it is. */
export interface ShownMinutes {
  minutes: number;
  /** `total` for a Mealie recipe (prep plus cook), `prep` for a meal of the family's own. */
  kind: 'total' | 'prep';
}

/**
 * Which cooking time to show beside a dish.
 *
 * Mealie recipes show the whole time, prep plus cook: Mealie families fill in
 * total time more often than prep, and a recipe saved with only a total
 * already arrives with it as its prep time. The family's own meals keep
 * showing prep time, as they always have. Nothing to show gives null.
 */
export function mealShownMinutes(meal: SavedMeal | null | undefined): ShownMinutes | null {
  if (!meal) return null;
  if (isMealieMeal(meal)) {
    const total = (meal.prepTime ?? 0) + (meal.cookTime ?? 0);
    return total > 0 ? { minutes: total, kind: 'total' } : null;
  }
  return meal.prepTime && meal.prepTime > 0 ? { minutes: meal.prepTime, kind: 'prep' } : null;
}

/** Whole hours and the minutes left over, for "2h 20m". */
export function splitMinutes(total: number): { hours: number; minutes: number } {
  const whole = Math.max(0, Math.round(total));
  return { hours: Math.floor(whole / 60), minutes: whole % 60 };
}

/**
 * The family's own meals for a course picker: the ones saved as that kind of
 * dish first ("Add a side" leads with the sides), then everything else, each
 * in library order. Any meal can still be a side; the split only saves a
 * scroll.
 */
/**
 * The kind of dish a meal is. A meal saved before kinds existed, or never
 * given one, is a main dish: that is what the forms show for it, and what
 * the course pickers group it under.
 */
export function mealKind(meal: Pick<SavedMeal, 'category'>): NonNullable<SavedMeal['category']> {
  return meal.category ?? 'main';
}

/**
 * The `category` a form should save: the kind picked, except that a meal with
 * no kind left on "Main dish" keeps having none, so opening and saving a meal
 * never changes it behind the family's back.
 */
export function kindToSave(picked: NonNullable<SavedMeal['category']>, previous: SavedMeal['category']): SavedMeal['category'] {
  return picked === 'main' && previous === undefined ? undefined : picked;
}

export function mealsForCourse(
  savedMeals: readonly SavedMeal[],
  kind: MealCourseKind,
): { matching: SavedMeal[]; others: SavedMeal[] } {
  const matching: SavedMeal[] = [];
  const others: SavedMeal[] = [];
  for (const meal of savedMeals) (mealKind(meal) === kind ? matching : others).push(meal);
  return { matching, others };
}

/** The family's saved meals whose name or a tag holds the typed words, in the order given. */
export function searchSavedMeals(meals: SavedMeal[], query: string): SavedMeal[] {
  const q = query.trim().toLowerCase();
  if (!q) return meals;
  return meals.filter(
    (m) => m.name.toLowerCase().includes(q) || (m.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
  );
}

/**
 * The family's own library narrowed by the search words and one filter pill:
 * favorites, a kind of dish (a meal saved with no kind is a main, so it is in
 * none of these), or a tag.
 */
export function filterLibraryMeals(meals: SavedMeal[], query: string, filter: LibraryFilter): SavedMeal[] {
  const found = searchSavedMeals(meals, query);
  switch (filter) {
    case 'all': return found;
    case 'favorites': return found.filter((m) => m.isFavorite);
    case 'side':
    case 'dessert':
    case 'drink': return found.filter((m) => mealKind(m) === filter);
    default: return found.filter((m) => m.tags?.some((t) => normalizeTag(t) === filter));
  }
}

/** English words a household might name its Mealie category for each kind of course. */
const COURSE_CATEGORY_WORDS: Record<MealCourseKind, readonly string[]> = {
  main: ['main', 'dinner', 'entree', 'entrée'],
  side: ['side'],
  dessert: ['dessert', 'sweet'],
  drink: ['drink', 'beverage'],
};

function categoryWord(name: string): string {
  return name.trim().toLowerCase().replace(/\s+dish(es)?$/, '').replace(/(es|s)$/, '');
}

/**
 * Two category words are the same word give or take a plural ending a letter
 * or two long either way ("Getränk", "Getränke"; "Toetje", "Toetjes"): the
 * other languages do not all end theirs in -s.
 */
function sameCategoryWord(a: string, b: string): boolean {
  return a.length >= b.length ? a.startsWith(b) && a.length - b.length <= 2 : b.startsWith(a) && b.length - a.length <= 2;
}

function categoryNamed<C extends { name: string }>(category: C, words: readonly string[]): boolean {
  const name = categoryWord(category.name);
  return words.some((w) => sameCategoryWord(name, categoryWord(w)));
}

/** Names a household might give its Mealie categories of dinners, in the seven languages Home Screens ships. */
const DINNER_CATEGORY_WORDS = [
  'main', 'main course', 'dinner', 'supper', 'entree', 'entrée',
  'hauptgericht', 'hauptspeise', 'abendessen', 'plat principal', 'dîner', 'plato principal', 'plato fuerte', 'cena',
  'hoofdgerecht', 'avondeten', 'prato principal', 'jantar', 'hovedret', 'aftensmad',
];

/**
 * Names of categories that hold no dinners: desserts, drinks, sides,
 * breakfasts, starters and snacks, in the same seven languages.
 */
const NOT_DINNER_CATEGORY_WORDS = [
  'dessert', 'sweet', 'baking', 'drink', 'beverage', 'cocktail', 'smoothie', 'side', 'breakfast', 'brunch', 'starter', 'appetizer', 'snack',
  'nachtisch', 'nachspeise', 'süßspeise', 'kuchen', 'getränk', 'beilage', 'frühstück', 'vorspeise',
  'boisson', 'accompagnement', 'petit-déjeuner', 'petit déjeuner', 'apéritif',
  'postre', 'bebida', 'guarnición', 'acompañamiento', 'desayuno', 'entrante', 'aperitivo',
  'toetje', 'nagerecht', 'drankje', 'drank', 'bijgerecht', 'ontbijt', 'voorgerecht',
  'sobremesa', 'acompanhamento', 'café da manhã', 'entrada', 'petisco',
  'drik', 'drikkevare', 'tilbehør', 'morgenmad', 'forret',
];

/** Which of a household's Mealie categories a dinner suggestion may come from (by slug). */
export type DinnerCategoryFilter = { only: string[] } | { without: string[] } | null;

/**
 * Where Suggest finds dinners in Mealie when no meal plan rule there says:
 * only the household's dinner categories when it has some ("Dinner", "Main
 * dishes"), otherwise anything outside its dessert, drink, side, breakfast,
 * starter and snack categories. Null when it names neither, and any recipe
 * will do. Mealie's own random pick ignores the kind of meal, which put cake
 * on the plan for dinner.
 */
export function dinnerCategories<C extends { name: string; slug: string }>(categories: readonly C[]): DinnerCategoryFilter {
  const dinners = categories.filter((c) => categoryNamed(c, DINNER_CATEGORY_WORDS));
  if (dinners.length > 0) return { only: dinners.map((c) => c.slug) };
  const others = categories.filter((c) => categoryNamed(c, NOT_DINNER_CATEGORY_WORDS));
  return others.length > 0 ? { without: others.map((c) => c.slug) } : null;
}

/**
 * The household's Mealie category to open a course picker on: the one named
 * for that kind ("Side", "Sides", "Side dishes", "Desserts", or the word in
 * the household's language, passed as `localWords`). Null when there is none,
 * and the picker opens on Favorites instead.
 */
export function matchCourseCategory<C extends { name: string; slug: string }>(
  categories: readonly C[],
  kind: MealCourseKind,
  localWords: readonly string[] = [],
): C | null {
  const wanted = [...COURSE_CATEGORY_WORDS[kind], ...localWords].filter((w) => categoryWord(w));
  return categories.find((c) => categoryNamed(c, wanted)) ?? null;
}
