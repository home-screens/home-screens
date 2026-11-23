import type { MealCourseKind, MealIngredient, MealSlotType, SavedMeal } from '@/types/config';
import { parseMealieMealId } from './mealie-map';
import type { TranslateFn } from '@/i18n/types';
import { DEFAULT_MEAL_EMOJI, MEAL_TAGS, normalizeTag, type LibraryFilter } from './meal-constants';
import { ingredientsToSave } from './meal-ingredients';
import type { MealPickTarget } from './meal-courses';

/**
 * Small rules about how a dish is offered and described wherever the family
 * plans meals: the cooking time a row shows, how typed words narrow the
 * family's own meals, and which of them a course picker lists first. The
 * phone and the editor draw these their own way; what they show must agree.
 */

/** True for a recipe read from Mealie (its id is `mealie:<recipe id>`). */
export function isMealieMeal(meal: Pick<SavedMeal, 'id'> | null | undefined): boolean {
  return !!meal && parseMealieMealId(meal.id) !== null;
}

/**
 * The cooking time to show beside a dish, in minutes: the whole time, prep
 * plus cook, or whichever of the two is set. Prep alone sent whoever cooks a
 * stew to start it an hour late. Mealie recipes and the family's own meals
 * follow the same rule (a Mealie recipe saved with only a total arrives with
 * it as its prep time). Nothing to show gives null.
 */
export function mealShownMinutes(meal: SavedMeal | null | undefined): number | null {
  if (!meal) return null;
  const total = (meal.prepTime ?? 0) + (meal.cookTime ?? 0);
  return total > 0 ? total : null;
}

/** The longest a meal can take, prep and cook together, and still count as Quick without the tag. */
export const QUICK_MEAL_MINUTES = 30;

/** Whole hours and the minutes left over, for "2h 20m". */
export function splitMinutes(total: number): { hours: number; minutes: number } {
  const whole = Math.max(0, Math.round(total));
  return { hours: Math.floor(whole / 60), minutes: whole % 60 };
}

const FIXED_TAGS: ReadonlySet<string> = new Set(MEAL_TAGS);

/**
 * A tag as a dish's meta line prints it. One of the fixed tags the meal forms
 * offer ("kid-friendly") reads in the family's language from `core`
 * `meal.tags.*`. Any other tag, and every Mealie category and tag, is a name
 * someone typed and is shown as typed.
 *
 * `tCore` reads the `core` dictionary.
 */
export function mealTagLabel(meal: Pick<SavedMeal, 'id'>, tag: string, tCore: TranslateFn): string {
  if (isMealieMeal(meal)) return tag;
  const fixed = normalizeTag(tag);
  return FIXED_TAGS.has(fixed) ? tCore(`meal.tags.${fixed}`) : tag;
}

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

/**
 * A saved meal as a form holds it while the family edits it. The phone's form
 * and the editor's Detail tab keep these in their own state and draw them
 * their own way; what an absent value shows as, and what is saved, is decided
 * here once.
 */
export interface MealFormFields {
  name: string;
  /** Empty for a meal with no picture of its own. */
  emoji: string;
  /** Minutes; a cleared number box holds `''` or nothing. */
  prepTime: number | '' | undefined;
  cookTime: number | '' | undefined;
  servings: number | '' | undefined;
  difficulty: SavedMeal['difficulty'];
  kind: NonNullable<SavedMeal['category']>;
  tags: string[];
  ingredients: MealIngredient[];
  recipeUrl: string;
  notes: string;
  /** The form's own heart. Left out by a form that has none, and the meal keeps the one it had. */
  favorite?: boolean;
}

/**
 * What a form opens with: a saved meal's values, or a new meal's (`null`).
 * A new meal starts with the plate; a saved meal with no picture stays
 * without one, so opening and saving it does not give it a picture on the
 * wall. Tags are read in their stored form ("Batch Cook" is `batch-cook`),
 * once each, so every form ticks the same chip and saves the same word.
 */
export function mealFormFields(meal: SavedMeal | null): Required<MealFormFields> {
  return {
    name: meal?.name ?? '',
    emoji: meal ? meal.emoji ?? '' : DEFAULT_MEAL_EMOJI,
    prepTime: meal?.prepTime,
    cookTime: meal?.cookTime,
    servings: meal?.servings,
    difficulty: meal?.difficulty,
    kind: meal ? mealKind(meal) : 'main',
    tags: [...new Set((meal?.tags ?? []).map(normalizeTag))],
    ingredients: (meal?.ingredients ?? []).map((row) => ({ ...row })),
    recipeUrl: meal?.recipeUrl ?? '',
    notes: meal?.notes ?? '',
    favorite: meal?.isFavorite ?? false,
  };
}

/**
 * The meal a form saves, or null while it has no name: a meal without one is
 * a blank row in every list and picker. `existing` is the meal being edited
 * (null for a new one, which gets `newId()`).
 */
export function buildSavedMeal(fields: MealFormFields, existing: SavedMeal | null, newId: () => string): SavedMeal | null {
  const name = fields.name.trim();
  if (!name) return null;
  return {
    id: existing?.id ?? newId(),
    name,
    emoji: fields.emoji || undefined,
    prepTime: Number(fields.prepTime) || undefined,
    cookTime: Number(fields.cookTime) || undefined,
    servings: Number(fields.servings) || undefined,
    difficulty: fields.difficulty,
    category: kindToSave(fields.kind, existing?.category),
    tags: fields.tags.length > 0 ? fields.tags : undefined,
    ingredients: ingredientsToSave(fields.ingredients),
    recipeUrl: fields.recipeUrl.trim() || undefined,
    notes: fields.notes.trim() || undefined,
    isFavorite: fields.favorite === undefined ? existing?.isFavorite : fields.favorite || undefined,
  };
}

/**
 * The family's own meals for a course picker: the ones saved as that kind of
 * dish first ("Add a side" leads with the sides), then everything else, each
 * in library order. Any meal can still be a side; the split only saves a
 * scroll.
 */
export function mealsForCourse(
  savedMeals: readonly SavedMeal[],
  kind: MealCourseKind,
): { matching: SavedMeal[]; others: SavedMeal[] } {
  const matching: SavedMeal[] = [];
  const others: SavedMeal[] = [];
  for (const meal of savedMeals) (mealKind(meal) === kind ? matching : others).push(meal);
  return { matching, others };
}

/**
 * The family's own meals for the main dish of a meal: the ones tagged for
 * that meal of the day first ("Breakfast" leads with the meals tagged
 * breakfast), then everything else, each in library order. The same split
 * the course pickers make by kind of dish.
 */
export function mealsForSlot(
  savedMeals: readonly SavedMeal[],
  slot: MealSlotType,
): { matching: SavedMeal[]; others: SavedMeal[] } {
  const matching: SavedMeal[] = [];
  const others: SavedMeal[] = [];
  for (const meal of savedMeals) (meal.tags?.some((tag) => normalizeTag(tag) === slot) ? matching : others).push(meal);
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
 * The saved meal the typed words name, ignoring case and extra spaces, or
 * null. Typing "pancakes" means the family's Pancakes, with its picture and
 * its ingredients, not a typed-in dish that only shares its name.
 */
export function savedMealNamed(meals: readonly SavedMeal[], words: string): SavedMeal | null {
  const key = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
  const wanted = key(words);
  if (!wanted) return null;
  return meals.find((m) => key(m.name) === wanted) ?? null;
}

/**
 * The family's own meals a picker lists (already narrowed by the words and
 * any chip), split as it groups them: a main dish leads with the meals
 * tagged for that meal of the day (`mealsForSlot`), a course with the meals
 * saved as its kind (`mealsForCourse`).
 */
export function pickerMealGroups(
  meals: readonly SavedMeal[],
  target: MealPickTarget,
): { matching: SavedMeal[]; others: SavedMeal[] } {
  return target.pick === 'main' ? mealsForSlot(meals, target.slot) : mealsForCourse(meals, target.kind);
}

/**
 * What Enter in a picker takes for the typed words: the saved meal they name
 * (`savedMealNamed`), or the words themselves when no saved meal holds them.
 * Null when nothing is typed, or when the words only match part of some
 * meals and the family still has to choose one.
 */
export function pickerEnterChoice(meals: SavedMeal[], query: string): { meal: SavedMeal } | { text: string } | null {
  const typed = query.trim();
  if (!typed) return null;
  const named = savedMealNamed(meals, typed);
  if (named) return { meal: named };
  return searchSavedMeals(meals, typed).length === 0 ? { text: typed } : null;
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
    // Quick is what a family would guess: tagged quick, or ready in half an
    // hour or less, prep and cook together.
    case 'quick': return found.filter((m) => m.tags?.some((t) => normalizeTag(t) === 'quick')
      || ((mealShownMinutes(m) ?? Infinity) <= QUICK_MEAL_MINUTES));
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

/**
 * The kind of dish a Mealie recipe is, from the household's own category
 * names, which the hub hands over as the recipe's first tags: one filed
 * under Side, Dessert or Drink (or the word in the household's language,
 * `localWords`) is that; anything else, and anything also filed as a main
 * dish, is a main dish.
 */
export function courseKindFromTags(tags: readonly string[] | undefined, localWords: Partial<Record<MealCourseKind, readonly string[]>> = {}): MealCourseKind {
  const named = (kind: MealCourseKind) => matchCourseCategory((tags ?? []).map((name) => ({ name, slug: name })), kind, localWords[kind] ?? []) !== null;
  if (named('main')) return 'main';
  return (['side', 'dessert', 'drink'] as const).find(named) ?? 'main';
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
