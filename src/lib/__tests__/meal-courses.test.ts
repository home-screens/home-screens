import { describe, it, expect } from 'vitest';
import type { PlannedMeal, SavedMeal } from '@/types/config';
import {
  addPlanCourse,
  MAX_COURSES,
  movePlanCourse,
  normalizeMealCourses,
  normalizeStoredMeal,
  normalizeStoredPlanEntry,
  planEntryMealIds,
  removePlanCourse,
  resolveCourses,
  setPlanCourse,
} from '../meal-courses';
import { removeSavedMeal, setPlanSlotText, assignPlanSlot } from '../meal-plan-actions';
import { getNextPlannedMeal, resolveMealWithEntry } from '../meal-constants';
import { generateGroceryList } from '../grocery-utils';

const DAY = '2026-10-30';

const dinner = (extra: Partial<PlannedMeal> = {}): PlannedMeal => ({ date: DAY, slot: 'dinner', ...extra });

const meal = (id: string, extra: Partial<SavedMeal> = {}): SavedMeal => ({ id, name: id, ...extra });

describe('normalizeMealCourses', () => {
  it('keeps valid courses in order and drops ones with nothing to show', () => {
    expect(normalizeMealCourses([
      { kind: 'side', mealId: 'naan' },
      { kind: 'dessert', customText: '  Brownies  ' },
      { kind: 'drink' },
      { kind: 'soup', customText: 'Tomato' },
      'not a course',
      { kind: 'main', customText: '   ' },
    ])).toEqual([
      { kind: 'side', mealId: 'naan' },
      { kind: 'dessert', customText: 'Brownies' },
    ]);
  });

  it('answers undefined for an empty or missing list', () => {
    expect(normalizeMealCourses([])).toBeUndefined();
    expect(normalizeMealCourses(undefined)).toBeUndefined();
  });

  it('keeps sourceId only when asked', () => {
    const raw = [{ kind: 'side', customText: 'Salad', sourceId: 'mealie:9' }];
    expect(normalizeMealCourses(raw)).toEqual([{ kind: 'side', customText: 'Salad' }]);
    expect(normalizeMealCourses(raw, true)).toEqual([{ kind: 'side', customText: 'Salad', sourceId: 'mealie:9' }]);
  });

  it('caps a runaway list', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ kind: 'side', customText: `Side ${i}` }));
    expect(normalizeMealCourses(many)).toHaveLength(MAX_COURSES);
  });
});

describe('normalizeStoredPlanEntry', () => {
  it('hands back an entry without courses or a source untouched', () => {
    const e = dinner({ mealId: 'tacos' });
    expect(normalizeStoredPlanEntry(e)).toBe(e);
  });

  it('never keeps a Mealie source in meals.json', () => {
    const e = dinner({ mealId: 'tacos', sourceId: 'mealie:4', courses: [{ kind: 'side', customText: 'Rice', sourceId: 'mealie:5' }] });
    expect(normalizeStoredPlanEntry(e)).toEqual(dinner({ mealId: 'tacos', courses: [{ kind: 'side', customText: 'Rice' }] }));
  });
});

describe('course edits', () => {
  it('adds a course to an existing meal, after the others', () => {
    let plan = [dinner({ mealId: 'tikka' })];
    plan = addPlanCourse(plan, DAY, 'dinner', { kind: 'side', mealId: 'naan' });
    plan = addPlanCourse(plan, DAY, 'dinner', { kind: 'drink', customText: 'Lemonade' });
    expect(plan[0].courses).toEqual([{ kind: 'side', mealId: 'naan' }, { kind: 'drink', customText: 'Lemonade' }]);
  });

  it('places a new course by kind: a side ahead of the drink, a second dessert beside the first', () => {
    let plan = [dinner({ mealId: 'tikka', courses: [{ kind: 'drink', customText: 'Lassi' }, { kind: 'dessert', customText: 'Kulfi' }] })];
    plan = addPlanCourse(plan, DAY, 'dinner', { kind: 'side', mealId: 'naan' });
    plan = addPlanCourse(plan, DAY, 'dinner', { kind: 'main', customText: 'Dal' });
    expect(plan[0].courses?.map((c) => c.customText ?? c.mealId)).toEqual(['Dal', 'naan', 'Lassi', 'Kulfi']);
    plan = addPlanCourse(plan, DAY, 'dinner', { kind: 'dessert', customText: 'Cookies' });
    // The hand-made "Lassi before Kulfi" stays; the new dessert joins Kulfi.
    expect(plan[0].courses?.map((c) => c.customText ?? c.mealId)).toEqual(['Dal', 'naan', 'Lassi', 'Kulfi', 'Cookies']);
  });

  it('starts a meal from just a course', () => {
    const plan = addPlanCourse([], DAY, 'dinner', { kind: 'side', customText: 'Big salad' });
    expect(plan).toEqual([dinner({ courses: [{ kind: 'side', customText: 'Big salad' }] })]);
  });

  it('refuses an empty course and a full list by identity', () => {
    const plan = [dinner({ mealId: 'tikka' })];
    expect(addPlanCourse(plan, DAY, 'dinner', { kind: 'side', customText: ' ' })).toBe(plan);
    const full = [dinner({ courses: Array.from({ length: MAX_COURSES }, () => ({ kind: 'side' as const, customText: 'x' })) })];
    expect(addPlanCourse(full, DAY, 'dinner', { kind: 'side', customText: 'one more' })).toBe(full);
  });

  it('changes a course in place and keeps its Mealie source', () => {
    const plan = [dinner({ mealId: 'tikka', courses: [{ kind: 'side', mealId: 'naan', sourceId: 'mealie:3' }] })];
    const next = setPlanCourse(plan, DAY, 'dinner', 0, { kind: 'dessert', customText: 'Kulfi' });
    expect(next[0].courses).toEqual([{ kind: 'dessert', customText: 'Kulfi', sourceId: 'mealie:3' }]);
    const kindOnly = setPlanCourse(plan, DAY, 'dinner', 0, { kind: 'main' });
    expect(kindOnly[0].courses).toEqual([{ kind: 'main', mealId: 'naan', sourceId: 'mealie:3' }]);
  });

  it('treats emptying a course as removing it', () => {
    const plan = [dinner({ mealId: 'tikka', courses: [{ kind: 'side', customText: 'Rice' }] })];
    const next = setPlanCourse(plan, DAY, 'dinner', 0, { customText: '' });
    expect(next).toEqual([dinner({ mealId: 'tikka' })]);
  });

  it('removes a course, and the whole entry when nothing is left', () => {
    const withMain = [dinner({ mealId: 'tikka', courses: [{ kind: 'side', customText: 'Rice' }] })];
    expect(removePlanCourse(withMain, DAY, 'dinner', 0)).toEqual([dinner({ mealId: 'tikka' })]);
    const onlyCourse = [dinner({ courses: [{ kind: 'side', customText: 'Rice' }] })];
    expect(removePlanCourse(onlyCourse, DAY, 'dinner', 0)).toEqual([]);
    expect(removePlanCourse(withMain, DAY, 'dinner', 5)).toBe(withMain);
  });

  it('moves a course', () => {
    const plan = [dinner({ courses: [{ kind: 'side', customText: 'A' }, { kind: 'side', customText: 'B' }, { kind: 'drink', customText: 'C' }] })];
    expect(movePlanCourse(plan, DAY, 'dinner', 2, 0)[0].courses!.map((c) => c.customText)).toEqual(['C', 'A', 'B']);
    expect(movePlanCourse(plan, DAY, 'dinner', 0, 0)).toBe(plan);
    expect(movePlanCourse(plan, DAY, 'dinner', 0, 9)).toBe(plan);
  });
});

describe('courses through the existing slot rules', () => {
  it('keeps courses when the main dish is swapped', () => {
    const plan = [dinner({ mealId: 'tikka', courses: [{ kind: 'side', mealId: 'naan' }] })];
    expect(assignPlanSlot(plan, DAY, 'dinner', 'tacos')[0]).toEqual(dinner({ mealId: 'tacos', courses: [{ kind: 'side', mealId: 'naan' }] }));
  });

  it('keeps courses when the main dish is emptied', () => {
    const plan = [dinner({ customText: 'Pizza', courses: [{ kind: 'dessert', customText: 'Ice cream' }] })];
    expect(setPlanSlotText(plan, DAY, 'dinner', '')).toEqual([dinner({ courses: [{ kind: 'dessert', customText: 'Ice cream' }] })]);
    expect(setPlanSlotText([dinner({ customText: 'Pizza' })], DAY, 'dinner', '')).toEqual([]);
  });

  it('removes a deleted library meal wherever it was planned', () => {
    const plan = [
      dinner({ mealId: 'naan', courses: [{ kind: 'side', mealId: 'rice' }] }),
      { date: '2026-10-31', slot: 'dinner' as const, mealId: 'tikka', courses: [{ kind: 'side' as const, mealId: 'naan' }] },
      { date: '2026-11-01', slot: 'lunch' as const, mealId: 'naan' },
    ];
    const { plan: next } = removeSavedMeal([meal('naan')], plan, 'naan');
    expect(next).toEqual([
      dinner({ courses: [{ kind: 'side', mealId: 'rice' }] }),
      { date: '2026-10-31', slot: 'dinner', mealId: 'tikka' },
    ]);
  });
});

describe('drawing courses', () => {
  const savedMeals = [meal('tikka', { prepTime: 45 }), meal('naan')];

  it('resolves names and skips a course whose meal is gone', () => {
    const entry = dinner({ mealId: 'tikka', courses: [{ kind: 'side', mealId: 'naan' }, { kind: 'side', mealId: 'gone' }, { kind: 'drink', customText: 'Lassi' }] });
    expect(resolveCourses(entry, savedMeals).map((c) => [c.kind, c.name])).toEqual([['side', 'naan'], ['drink', 'Lassi']]);
  });

  it('leads with the first course when there is no main dish', () => {
    const plan = [dinner({ courses: [{ kind: 'side', customText: 'Big salad' }, { kind: 'dessert', customText: 'Pie' }] })];
    const resolved = resolveMealWithEntry(DAY, 'dinner', plan, savedMeals);
    expect(resolved.name).toBe('Big salad');
    expect(resolved.courses.map((c) => c.name)).toEqual(['Pie']);
  });

  it('hands the next meal its courses', () => {
    const plan = [dinner({ mealId: 'tikka', courses: [{ kind: 'side', mealId: 'naan' }] })];
    const next = getNextPlannedMeal(DAY, 12 * 60, plan, savedMeals, ['dinner']);
    expect(next?.name).toBe('tikka');
    expect(next?.courses.map((c) => c.name)).toEqual(['naan']);
  });

  it('lists every planned meal id for the shopping list, main first', () => {
    expect(planEntryMealIds(dinner({ mealId: 'tikka', courses: [{ kind: 'side', mealId: 'naan' }, { kind: 'drink', customText: 'Lassi' }] }))).toEqual(['tikka', 'naan']);
  });

  it('shops for a course like a main dish', () => {
    const meals = [
      meal('tikka', { ingredients: [{ name: 'Chicken', amount: '1 lb' }] }),
      meal('naan', { ingredients: [{ name: 'Flour', amount: '2 cups' }] }),
    ];
    const list = generateGroceryList([dinner({ mealId: 'tikka', courses: [{ kind: 'side', mealId: 'naan' }] })], meals, []);
    const names = [...list.values()].flatMap((c) => c.items.map((i) => i.name.toLowerCase()));
    expect(names).toEqual(expect.arrayContaining(['chicken', 'flour']));
  });
});

describe('normalizeStoredMeal', () => {
  it('drops a kind of dish that is not a course kind, so an old snack reads as a main dish', () => {
    const old = { id: 'popcorn', name: 'Popcorn', category: 'snack' } as unknown as SavedMeal;
    expect(normalizeStoredMeal(old)).toEqual({ id: 'popcorn', name: 'Popcorn' });
  });

  it('hands back a meal with a course kind, or none, unchanged', () => {
    const side: SavedMeal = { id: 'rice', name: 'Rice', category: 'side' };
    const plain: SavedMeal = { id: 'tacos', name: 'Tacos' };
    expect(normalizeStoredMeal(side)).toBe(side);
    expect(normalizeStoredMeal(plain)).toBe(plain);
  });
});
