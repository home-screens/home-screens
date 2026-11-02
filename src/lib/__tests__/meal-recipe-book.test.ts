import { describe, expect, it } from 'vitest';
import type { SavedMeal } from '@/types/config';
import { chipRows, chipsThatFit, localBookMeals, localBookSearch, mealieBookChips, recipeBookChipId, recipeBookHeading, recipeBookSource, savedMealWithoutRecipe, spellingFallbacks, LOCAL_BOOK_CHIPS } from '../meal-recipe-book';

const meal = (name: string, extra: Partial<SavedMeal> = {}): SavedMeal => ({ id: name.toLowerCase(), name, ...extra });

describe('recipeBookSource', () => {
  it("is Mealie's recipes whenever Mealie is connected, whatever the plan source", () => {
    expect(recipeBookSource(true)).toBe('mealie');
    expect(recipeBookSource(false)).toBe('local');
  });
});

describe('mealieBookChips', () => {
  it('puts the shortcuts first, then the cookbooks, then the categories', () => {
    const chips = mealieBookChips([{ name: 'Kids like it', slug: 'kids' }], [{ name: 'Beef', slug: 'beef' }]);
    expect(chips.map(recipeBookChipId)).toEqual(['favorites', 'recent', 'all', 'cookbook:kids', 'category:beef']);
  });

  it("follows the phone Library's filters for a family without Mealie", () => {
    expect(LOCAL_BOOK_CHIPS.map(recipeBookChipId).slice(0, 3)).toEqual(['local:all', 'local:favorites', 'local:side']);
  });
});

describe('localBookMeals', () => {
  const meals = [
    meal('Tacos', { ingredients: [{ name: 'Tortillas' }], tags: ['quick'], isFavorite: true }),
    meal('Eating out'),
    meal('banana bread', { notes: 'Bake at 350' }),
    meal('Lemonade', { ingredients: [{ name: 'Lemons' }], category: 'drink' }),
  ];

  it('lists only meals with a recipe of their own, A to Z ignoring case', () => {
    expect(localBookMeals(meals, '', 'all').map((m) => m.name)).toEqual(['banana bread', 'Lemonade', 'Tacos']);
  });

  it("filters and searches the way the phone's Library does", () => {
    expect(localBookMeals(meals, '', 'favorites').map((m) => m.name)).toEqual(['Tacos']);
    expect(localBookMeals(meals, '', 'drink').map((m) => m.name)).toEqual(['Lemonade']);
    expect(localBookMeals(meals, 'ban', 'all').map((m) => m.name)).toEqual(['banana bread']);
  });
});

describe('chipRows', () => {
  it('wraps like a flex row', () => {
    expect(chipRows([100, 100, 100], 340, 10)).toBe(1);
    expect(chipRows([100, 100, 100, 100], 340, 10)).toBe(2);
    expect(chipRows([400, 100], 340, 10)).toBe(2);
    expect(chipRows([], 340, 10)).toBe(0);
  });
});

describe('chipsThatFit', () => {
  // 100-wide chips, 10 apart, in a 340-wide row: three to a row.
  const widths = (count: number) => Array.from({ length: count }, () => 100);

  it('shows them all when they fit in two rows', () => {
    expect(chipsThatFit(widths(6), 340, 10, 80)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('keeps room for "+ N more" at the end of the second row', () => {
    expect(chipsThatFit(widths(9), 340, 10, 80)).toEqual([0, 1, 2, 3, 4]);
  });

  it('takes off as many as the "more" chip needs', () => {
    expect(chipsThatFit(widths(9), 340, 10, 230)).toEqual([0, 1, 2, 3]);
  });

  it('keeps the lit chip showing in the last place when it lives further along', () => {
    expect(chipsThatFit(widths(9), 340, 10, 80, 2, 7)).toEqual([0, 1, 2, 3, 7]);
    expect(chipsThatFit(widths(9), 340, 10, 80, 2, 1)).toEqual([0, 1, 2, 3, 4]);
  });

  it('makes room for a wide lit chip', () => {
    const w = [...widths(8), 210];
    expect(chipsThatFit(w, 340, 10, 80, 2, 8)).toEqual([0, 1, 2, 8]);
  });

  it('allows one row when asked', () => {
    expect(chipsThatFit(widths(9), 340, 10, 80, 1)).toEqual([0, 1]);
  });
});

describe('spellingFallbacks', () => {
  it("tries the start of a child's spelling, four letters then three", () => {
    expect(spellingFallbacks('choclate')).toEqual(['choc', 'cho']);
    expect(spellingFallbacks('Wafles')).toEqual(['wafl', 'waf']);
    expect(spellingFallbacks('piza')).toEqual(['piz']);
  });

  it('takes the longest word', () => {
    expect(spellingFallbacks('mac n chese')).toEqual(['ches', 'che']);
  });

  it('counts letters, not code units', () => {
    expect(spellingFallbacks('crème')).toEqual(['crèm', 'crè']);
  });

  it('has nothing shorter to try for short words', () => {
    expect(spellingFallbacks('pie')).toEqual([]);
    expect(spellingFallbacks('  ')).toEqual([]);
  });
});

describe('localBookSearch', () => {
  const meals = [
    meal('Chocolate cake', { notes: 'Bake at 350' }),
    meal('Leftovers'),
    meal('Eating out'),
    meal('Tacos', { ingredients: [{ name: 'Tortillas' }] }),
  ];

  it('answers with the matches when there are some', () => {
    expect(localBookSearch(meals, 'taco', 'all')).toEqual({ items: [meals[3]], widenedTo: null, withoutRecipe: null });
  });

  it('names the saved meal that has no recipe instead of trying another spelling', () => {
    expect(localBookSearch(meals, 'leftovers', 'all')).toEqual({ items: [], widenedTo: null, withoutRecipe: meals[1] });
    expect(savedMealWithoutRecipe(meals, '  eating ')).toBe(meals[2]);
    expect(savedMealWithoutRecipe(meals, 'tacos')).toBeNull();
  });

  it('tries the start of the word when nothing matched', () => {
    expect(localBookSearch(meals, 'choclate', 'all')).toEqual({ items: [meals[0]], widenedTo: 'choc', withoutRecipe: null });
    // The mistake inside the first four letters: three find it.
    expect(localBookSearch(meals, 'tacoos', 'all')).toEqual({ items: [meals[3]], widenedTo: 'taco', withoutRecipe: null });
    expect(localBookSearch(meals, 'tcos', 'all').widenedTo).toBeNull();
    expect(localBookSearch([...meals, meal('Waffles', { notes: 'Batter' })], 'wafles', 'all').widenedTo).toBe('waf');
  });

  it('says nothing was found when the shorter try finds nothing too', () => {
    expect(localBookSearch(meals, 'zucchini', 'all')).toEqual({ items: [], widenedTo: null, withoutRecipe: null });
  });
});

describe('recipeBookHeading', () => {
  it('names the typed words first', () => {
    expect(recipeBookHeading('  chick ', { kind: 'mealie', filter: 'favorites' }, 30)).toEqual({ key: 'search', values: { query: 'chick' } });
  });

  // The hub leads with the recipes holding every word only for several words; one word comes back A to Z.
  it('says best matches come first only when the hub reorders', () => {
    expect(recipeBookHeading('mac and cheese', { kind: 'mealie', filter: 'favorites' }, 30).sideKey).toBe('bestFirst');
    expect(recipeBookHeading('soup soup', { kind: 'mealie', filter: 'all' }, 30).sideKey).toBeUndefined();
    expect(recipeBookHeading('mac and cheese', { kind: 'local', filter: 'all' }, 3).sideKey).toBeUndefined();
  });

  it('says when it searched a shorter spelling', () => {
    expect(recipeBookHeading('choclate', { kind: 'mealie', filter: 'favorites' }, 4, '', 'choc')).toEqual({ key: 'widened', values: { query: 'choclate', part: 'choc' } });
  });

  it('counts the chosen chip', () => {
    expect(recipeBookHeading('', { kind: 'mealie', filter: 'favorites' }, 30)).toEqual({ key: 'favorites', values: { count: 30 } });
    expect(recipeBookHeading('', { kind: 'mealie', filter: 'recent' }, 24).sideKey).toBe('newestFirst');
    expect(recipeBookHeading('', { kind: 'cookbook', slug: 'k', name: 'Kids like it' }, 12)).toEqual({ key: 'inGroup', values: { count: 12, group: 'Kids like it' } });
    expect(recipeBookHeading('', { kind: 'local', filter: 'dessert' }, 4, 'Desserts')).toEqual({ key: 'inGroup', values: { count: 4, group: 'Desserts' } });
    expect(recipeBookHeading('', { kind: 'local', filter: 'all' }, 12).key).toBe('all');
  });
});
