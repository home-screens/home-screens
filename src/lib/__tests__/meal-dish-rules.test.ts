import { describe, it, expect } from 'vitest';
import type { SavedMeal } from '@/types/config';
import { dinnerCategories, filterLibraryMeals, isMealieMeal, kindToSave, matchCourseCategory, mealKind, mealShownMinutes, mealsForCourse, mealsForSlot, mealTagLabel, savedMealNamed, searchSavedMeals, splitMinutes } from '../meal-dish-rules';

const meal = (id: string, extra: Partial<SavedMeal> = {}): SavedMeal => ({ id, name: id, ...extra });

/** A Mealie recipe id as the hub hands it over. */
const RECIPE = 'mealie:95da3cd9-6bd2-4ef2-a316-2dbcaa30b6fd';

describe('isMealieMeal', () => {
  it('tells a Mealie recipe from a meal of the family own', () => {
    expect(isMealieMeal(meal(RECIPE))).toBe(true);
    expect(isMealieMeal(meal('local-tacos'))).toBe(false);
    expect(isMealieMeal(null)).toBe(false);
  });
});

describe('mealShownMinutes', () => {
  it('shows a Mealie recipe its whole time, prep plus cook', () => {
    expect(mealShownMinutes(meal(RECIPE, { prepTime: 20, cookTime: 120 }))).toEqual({ minutes: 140, kind: 'total' });
  });

  it('shows a Mealie recipe with only one of the two times that one', () => {
    // A recipe saved with only a total arrives with it as its prep time.
    expect(mealShownMinutes(meal(RECIPE, { prepTime: 45 }))).toEqual({ minutes: 45, kind: 'total' });
    expect(mealShownMinutes(meal(RECIPE, { cookTime: 30 }))).toEqual({ minutes: 30, kind: 'total' });
  });

  it('keeps prep time for the family own meals, cook time left out', () => {
    expect(mealShownMinutes(meal('tacos', { prepTime: 15, cookTime: 30 }))).toEqual({ minutes: 15, kind: 'prep' });
  });

  it('shows nothing when there is no time, or no meal', () => {
    expect(mealShownMinutes(meal('tacos', { cookTime: 30 }))).toBeNull();
    expect(mealShownMinutes(meal(RECIPE))).toBeNull();
    expect(mealShownMinutes(meal(RECIPE, { prepTime: 0, cookTime: 0 }))).toBeNull();
    expect(mealShownMinutes(null)).toBeNull();
  });
});

describe('splitMinutes', () => {
  it('splits a time into hours and minutes', () => {
    expect(splitMinutes(140)).toEqual({ hours: 2, minutes: 20 });
    expect(splitMinutes(60)).toEqual({ hours: 1, minutes: 0 });
    expect(splitMinutes(45)).toEqual({ hours: 0, minutes: 45 });
  });

  it('rounds and never goes below zero', () => {
    expect(splitMinutes(89.6)).toEqual({ hours: 1, minutes: 30 });
    expect(splitMinutes(-5)).toEqual({ hours: 0, minutes: 0 });
  });
});

describe('mealTagLabel', () => {
  it('dresses up the family own tags and leaves Mealie names as typed', () => {
    expect(mealTagLabel(meal('tacos'), 'kid-friendly')).toBe('Kid-Friendly');
    expect(mealTagLabel(meal('tacos'), 'healthy')).toBe('Healthy');
    expect(mealTagLabel(meal(RECIPE), 'Kid friendly')).toBe('Kid friendly');
  });
});

describe('mealsForCourse', () => {
  const library = [
    meal('tacos'),
    meal('garlic-bread', { category: 'side' }),
    meal('brownies', { category: 'dessert' }),
    meal('salad', { category: 'side' }),
    meal('lemonade', { category: 'drink' }),
  ];

  it('leads with the meals saved as that kind, in library order', () => {
    const { matching, others } = mealsForCourse(library, 'side');
    expect(matching.map((m) => m.id)).toEqual(['garlic-bread', 'salad']);
    expect(others.map((m) => m.id)).toEqual(['tacos', 'brownies', 'lemonade']);
  });

  it('lists everything as other when nothing was saved as that kind', () => {
    const noDrinks = library.filter((m) => m.category !== 'drink');
    const { matching, others } = mealsForCourse(noDrinks, 'drink');
    expect(matching).toEqual([]);
    expect(others).toHaveLength(noDrinks.length);
  });
});

describe('searchSavedMeals', () => {
  const meals: SavedMeal[] = [
    { id: 'a', name: 'Garlic Bread', tags: ['side'] },
    { id: 'b', name: 'Tacos', tags: ['Quick'] },
    { id: 'c', name: 'Brownies' },
  ];

  it('matches the name or a tag, ignoring case', () => {
    expect(searchSavedMeals(meals, 'bread').map((m) => m.id)).toEqual(['a']);
    expect(searchSavedMeals(meals, 'quick').map((m) => m.id)).toEqual(['b']);
  });

  it('hands back every meal for blank words', () => {
    expect(searchSavedMeals(meals, '  ')).toBe(meals);
  });
});

describe('mealsForSlot', () => {
  const library = [
    meal('tacos', { tags: ['quick'] }),
    meal('pancakes', { tags: ['kid-friendly', 'breakfast'] }),
    meal('oatmeal', { tags: ['Breakfast'] }),
    meal('pbj', { tags: ['lunch'] }),
    meal('salad'),
  ];

  it('leads with the meals tagged for that meal of the day, in library order', () => {
    const { matching, others } = mealsForSlot(library, 'breakfast');
    expect(matching.map((m) => m.id)).toEqual(['pancakes', 'oatmeal']);
    expect(others.map((m) => m.id)).toEqual(['tacos', 'pbj', 'salad']);
  });

  it('lists everything as other when nothing is tagged for it', () => {
    const { matching, others } = mealsForSlot(library, 'snack');
    expect(matching).toEqual([]);
    expect(others).toHaveLength(library.length);
  });
});

describe('savedMealNamed', () => {
  const library = [meal('a', { name: 'Pancakes' }), meal('b', { name: 'Sheet Pan  Salmon' })];

  it('finds the meal the words name, ignoring case and extra spaces', () => {
    expect(savedMealNamed(library, 'pancakes')?.id).toBe('a');
    expect(savedMealNamed(library, '  sheet pan salmon ')?.id).toBe('b');
  });

  it('answers null for words that only appear in a name, or no words', () => {
    expect(savedMealNamed(library, 'pan')).toBeNull();
    expect(savedMealNamed(library, 'pancake')).toBeNull();
    expect(savedMealNamed(library, ' ')).toBeNull();
  });
});

describe('a meal with no kind of dish', () => {
  it('is a main dish to the forms and the course pickers', () => {
    expect(mealKind({})).toBe('main');
    const { matching } = mealsForCourse([meal('old'), meal('tacos', { category: 'main' }), meal('rice', { category: 'side' })], 'main');
    expect(matching.map((m) => m.id)).toEqual(['old', 'tacos']);
  });

  it('keeps having none when saved on Main dish, and takes any other kind picked', () => {
    expect(kindToSave('main', undefined)).toBeUndefined();
    expect(kindToSave('main', 'side')).toBe('main');
    expect(kindToSave('side', undefined)).toBe('side');
  });
});

describe('matchCourseCategory', () => {
  const cats = [{ name: 'Beef', slug: 'beef' }, { name: 'Side Dishes', slug: 'side-dishes' }, { name: 'Desserts', slug: 'desserts' }, { name: 'Getränke', slug: 'getraenke' }];

  it('finds the category named for the kind, in English or the household language', () => {
    expect(matchCourseCategory(cats, 'side')?.slug).toBe('side-dishes');
    expect(matchCourseCategory(cats, 'dessert')?.slug).toBe('desserts');
    expect(matchCourseCategory(cats, 'drink', ['Getränk'])?.slug).toBe('getraenke');
  });

  it('answers null when the household has no such category', () => {
    expect(matchCourseCategory(cats, 'drink')).toBeNull();
    expect(matchCourseCategory([], 'side')).toBeNull();
  });
});

describe('filterLibraryMeals', () => {
  const library: SavedMeal[] = [
    { id: 'tacos', name: 'Tacos', tags: ['Quick'], isFavorite: true },
    { id: 'rice', name: 'Mexican Rice', category: 'side', tags: ['quick'] },
    { id: 'bread', name: 'Garlic Bread', category: 'side' },
    { id: 'brownies', name: 'Brownies', category: 'dessert', isFavorite: true },
    { id: 'lemonade', name: 'Lemonade', category: 'drink' },
    { id: 'stew', name: 'Stew', category: 'main' },
  ];
  const ids = (meals: SavedMeal[]) => meals.map((m) => m.id);

  it('keeps everything on All, and narrows by the search words', () => {
    expect(filterLibraryMeals(library, '', 'all')).toBe(library);
    expect(ids(filterLibraryMeals(library, 'bread', 'all'))).toEqual(['bread']);
  });

  it('narrows to a kind of dish; a meal with no kind is a main and is in none of them', () => {
    expect(ids(filterLibraryMeals(library, '', 'side'))).toEqual(['rice', 'bread']);
    expect(ids(filterLibraryMeals(library, '', 'dessert'))).toEqual(['brownies']);
    expect(ids(filterLibraryMeals(library, '', 'drink'))).toEqual(['lemonade']);
  });

  it('narrows to favorites or a tag, and combines with the search words', () => {
    expect(ids(filterLibraryMeals(library, '', 'favorites'))).toEqual(['tacos', 'brownies']);
    expect(ids(filterLibraryMeals(library, '', 'quick'))).toEqual(['tacos', 'rice']);
    expect(ids(filterLibraryMeals(library, 'rice', 'side'))).toEqual(['rice']);
  });
});

describe('dinnerCategories', () => {
  const cat = (name: string) => ({ name, slug: name.toLowerCase().replace(/\s+/g, '-') });

  it('keeps to the household dinner categories when it has some', () => {
    expect(dinnerCategories([cat('Beef'), cat('Main Dishes'), cat('Dessert'), cat('Dinner')])).toEqual({ only: ['main-dishes', 'dinner'] });
    expect(dinnerCategories([cat('Hauptgerichte'), cat('Nachspeisen')])).toEqual({ only: ['hauptgerichte'] });
  });

  it('otherwise leaves out desserts, drinks, sides, breakfasts and starters, in any shipped language', () => {
    const mealDb = ['Vegetarian', 'Starter', 'Side', 'Seafood', 'Pork', 'Drink', 'Dessert', 'Chicken', 'Breakfast', 'Beef'].map(cat);
    expect(dinnerCategories(mealDb)).toEqual({ without: ['starter', 'side', 'drink', 'dessert', 'breakfast'] });
    expect(dinnerCategories([cat('Getränke'), cat('Nachspeisen'), cat('Rind')])).toEqual({ without: ['getränke', 'nachspeisen'] });
    expect(dinnerCategories([cat('Toetjes'), cat('Kip')])).toEqual({ without: ['toetjes'] });
  });

  it('does not mistake a dinner for its first word', () => {
    expect(dinnerCategories([cat('Sweet Potato'), cat('Side Salads For Two')])).toBeNull();
  });

  it('allows anything when the household names neither', () => {
    expect(dinnerCategories([cat('Beef'), cat('Chicken')])).toBeNull();
    expect(dinnerCategories([])).toBeNull();
  });
});

