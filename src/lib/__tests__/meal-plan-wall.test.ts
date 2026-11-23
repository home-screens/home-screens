import { describe, expect, it } from 'vitest';
import type { MealCourse, PlannedMeal, SavedMeal, ScreenConfiguration } from '@/types/config';
import { MAX_COURSES } from '../meal-courses';
import { mealieMealId } from '../mealie-map';
import {
  applyWallPlanChange,
  mainDishMark,
  mealCardPlans,
  sameMeal,
  undoWallPlanChange,
  wallCanPlanMeal,
  wallDayTap,
  wallMayPlanMeals,
  wallPlanDayOpen,
  wallPlanKind,
  wallPlanWeeks,
  type WallPlanChange,
} from '../meal-plan-wall';

// A Wednesday. Sunday-start weeks run Nov 15 to 21 and Nov 22 to 28;
// Monday-start weeks run Nov 16 to 22 and Nov 23 to 29.
const TODAY = '2026-11-18';
const WED = TODAY;
const THU = '2026-11-19';

const dinner = (date: string, extra: Partial<PlannedMeal> = {}): PlannedMeal => ({ date, slot: 'dinner', ...extra });
const at = (plan: PlannedMeal[], date = WED, slot: PlannedMeal['slot'] = 'dinner') => plan.find((p) => p.date === date && p.slot === slot);
const change = (action: WallPlanChange['action'], mealId: string, extra: Partial<WallPlanChange> = {}): WallPlanChange =>
  ({ action, date: WED, slot: 'dinner', mealId, kind: 'main', ...extra });
const courses = (n: number): MealCourse[] => Array.from({ length: n }, (_, i) => ({ kind: 'side', mealId: `side-${i}` }));

function configWith(...modules: Array<{ type: string; config: Record<string, unknown>; enabled?: boolean }>): ScreenConfiguration {
  return {
    version: 21,
    settings: {},
    screens: [{ id: 's', name: 'S', modules: modules.map((m, i) => ({ id: `m${i}`, position: { x: 0, y: 0 }, size: { w: 1, h: 1 }, style: {}, ...m })) }],
  } as unknown as ScreenConfiguration;
}

describe('mealCardPlans', () => {
  it('needs planning on; taps are on unless switched off', () => {
    expect(mealCardPlans({ wallPlan: true })).toBe(true);
    expect(mealCardPlans({ wallPlan: true, interactive: true })).toBe(true);
    expect(mealCardPlans({ wallPlan: true, interactive: false })).toBe(false);
    expect(mealCardPlans({ interactive: true })).toBe(false);
    expect(mealCardPlans({})).toBe(false);
  });
});

describe('wallMayPlanMeals', () => {
  const planner = { type: 'meal-planner', config: { view: 'week', wallPlan: true } };

  it('allows planning while some meal card has it on', () => {
    expect(wallMayPlanMeals(configWith(planner))).toBe(true);
    expect(wallMayPlanMeals(configWith({ type: 'fullscreen-meal-planner', config: { view: 'week', wallPlan: true } }))).toBe(true);
  });

  it('refuses while no meal card has it on', () => {
    expect(wallMayPlanMeals(configWith({ type: 'meal-planner', config: { view: 'week' } }))).toBe(false);
    expect(wallMayPlanMeals(configWith())).toBe(false);
  });

  it('ignores a card that is switched off, or that takes no taps', () => {
    expect(wallMayPlanMeals(configWith({ ...planner, enabled: false }))).toBe(false);
    expect(wallMayPlanMeals(configWith({ ...planner, config: { ...planner.config, interactive: false } }))).toBe(false);
  });

  it('ignores a card that is not a meal card', () => {
    expect(wallMayPlanMeals(configWith({ type: 'todo', config: { view: 'list', interactive: true, wallPlan: true } }))).toBe(false);
  });

  describe('a card left in the old screens after displays were added', () => {
    // Adding the first display copies the screens into it and leaves the
    // originals behind; no wall draws those, and no edit reaches them.
    const withDisplays = (
      legacy: Array<{ type: string; config: Record<string, unknown> }>,
      live: Array<{ type: string; config: Record<string, unknown> }>,
    ): ScreenConfiguration => ({
      ...configWith(...legacy),
      displays: [{ id: 'main', name: 'Main', screens: configWith(...live).screens }],
    }) as unknown as ScreenConfiguration;
    const plannerOff = { type: 'meal-planner', config: { view: 'week', wallPlan: false } };

    it('does not count', () => {
      expect(wallMayPlanMeals(withDisplays([planner], [plannerOff]))).toBe(false);
    });

    it('lets a card on a display count', () => {
      expect(wallMayPlanMeals(withDisplays([plannerOff], [planner]))).toBe(true);
    });
  });
});

describe('wallCanPlanMeal', () => {
  const STIR_FRY = mealieMealId('5f8b7c2e-1a3d-4e6f-9b0a-2c4d6e8f0a1b');

  it('takes a saved meal with a recipe on a plan kept here', () => {
    expect(wallCanPlanMeal({ id: 'tacos', name: 'Tacos', ingredients: [{ name: 'Tortillas' }] } as SavedMeal, false)).toBe(true);
    expect(wallCanPlanMeal({ id: 'chili', name: 'Chili', notes: 'Brown the beef first' } as SavedMeal, false)).toBe(true);
  });

  it('refuses a saved meal with no recipe behind it on a plan kept here', () => {
    expect(wallCanPlanMeal({ id: 'pizza', name: 'Pizza night' } as SavedMeal, false)).toBe(false);
    expect(wallCanPlanMeal({ id: 'pizza', name: 'Pizza night', ingredients: [{ name: '  ' }], notes: ' ' } as SavedMeal, false)).toBe(false);
  });

  it('refuses a Mealie recipe on a plan kept here, and takes it on a plan kept in Mealie', () => {
    const recipe = { id: STIR_FRY, name: 'Veggie stir fry' } as SavedMeal;
    expect(wallCanPlanMeal(recipe, false)).toBe(false);
    expect(wallCanPlanMeal(recipe, true)).toBe(true);
  });

  it('refuses a Home Screens meal on a plan kept in Mealie, recipe or not', () => {
    expect(wallCanPlanMeal({ id: 'tacos', name: 'Tacos', ingredients: [{ name: 'Tortillas' }] } as SavedMeal, true)).toBe(false);
  });

  it('refuses no meal at all', () => {
    expect(wallCanPlanMeal(null, false)).toBe(false);
    expect(wallCanPlanMeal(undefined, true)).toBe(false);
  });
});

describe('wallPlanWeeks', () => {
  it('is this week and next for a Sunday-start household', () => {
    expect(wallPlanWeeks(TODAY, 'sunday')).toEqual([
      ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'],
      ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'],
    ]);
  });

  it('is this week and next for a Monday-start household', () => {
    expect(wallPlanWeeks(TODAY, 'monday')).toEqual([
      ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'],
      ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'],
    ]);
  });

  it('runs on into the new year', () => {
    expect(wallPlanWeeks('2026-12-30', 'sunday')[1]).toEqual(
      ['2027-01-03', '2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08', '2027-01-09'],
    );
  });
});

describe('wallPlanDayOpen', () => {
  it('opens today to the last day of next week in a Sunday-start week', () => {
    expect(wallPlanDayOpen('2026-11-17', TODAY, 'sunday')).toBe(false);
    expect(wallPlanDayOpen(TODAY, TODAY, 'sunday')).toBe(true);
    expect(wallPlanDayOpen('2026-11-28', TODAY, 'sunday')).toBe(true);
    expect(wallPlanDayOpen('2026-11-29', TODAY, 'sunday')).toBe(false);
  });

  it('opens today to the last day of next week in a Monday-start week', () => {
    expect(wallPlanDayOpen('2026-11-17', TODAY, 'monday')).toBe(false);
    expect(wallPlanDayOpen(TODAY, TODAY, 'monday')).toBe(true);
    expect(wallPlanDayOpen('2026-11-29', TODAY, 'monday')).toBe(true);
    expect(wallPlanDayOpen('2026-11-30', TODAY, 'monday')).toBe(false);
  });

  it('counts weeks from the household week today falls in, not seven days from today', () => {
    // Sunday is the first day of a Sunday-start week and the last of a Monday-start one.
    expect(wallPlanDayOpen('2026-12-05', '2026-11-22', 'sunday')).toBe(true);
    expect(wallPlanDayOpen('2026-12-06', '2026-11-22', 'sunday')).toBe(false);
    expect(wallPlanDayOpen('2026-11-29', '2026-11-22', 'monday')).toBe(true);
    expect(wallPlanDayOpen('2026-11-30', '2026-11-22', 'monday')).toBe(false);
  });
});

describe('wallPlanKind', () => {
  it('plans a recipe as its own kind, or as a main dish when it has none', () => {
    expect(wallPlanKind({ id: 'm', category: 'side' })).toBe('side');
    expect(wallPlanKind({ id: 'm', category: 'dessert' })).toBe('dessert');
    expect(wallPlanKind({ id: 'm', category: 'drink' })).toBe('drink');
    expect(wallPlanKind({ id: 'm' })).toBe('main');
  });
});

describe('wallPlanKind for a Mealie recipe', () => {
  const mealie = (tags: string[]) => ({ id: 'mealie:7d7a7e0c-0000-4000-8000-000000000001', tags });

  it('reads the kind from the categories the household filed it under', () => {
    expect(wallPlanKind(mealie(['Sides', 'Quick']))).toBe('side');
    expect(wallPlanKind(mealie(['Desserts']))).toBe('dessert');
    expect(wallPlanKind(mealie(['Drink']))).toBe('drink');
    expect(wallPlanKind(mealie(['Weeknight']))).toBe('main');
    expect(wallPlanKind(mealie([]))).toBe('main');
  });

  it('keeps a recipe also filed as a dinner a main dish, and knows the words in the wall\'s language', () => {
    expect(wallPlanKind(mealie(['Dinner', 'Side']))).toBe('main');
    expect(wallPlanKind(mealie(['Beilagen']), { side: ['Beilage'] })).toBe('side');
  });

  it('never guesses from the tags of a saved meal, which says its own kind', () => {
    expect(wallPlanKind({ id: 'meal-1', tags: ['Dessert'] })).toBe('main');
  });
});

describe('mainDishMark', () => {
  it('names a saved meal by id and typed words by the words', () => {
    expect(mainDishMark(dinner(WED, { mealId: 'stir-fry' }))).toBe('m:stir-fry');
    expect(mainDishMark(dinner(WED, { customText: '  Eating out ' }))).toBe('t:Eating out');
  });

  it('is empty for no meal, blank words, or a meal of courses only', () => {
    expect(mainDishMark(undefined)).toBe('');
    expect(mainDishMark(dinner(WED, { customText: '   ' }))).toBe('');
    expect(mainDishMark(dinner(WED, { courses: [{ kind: 'side', mealId: 'garlic-bread' }] }))).toBe('');
  });
});

describe('wallDayTap', () => {
  it('puts a recipe straight on a free day', () => {
    expect(wallDayTap([], WED, 'dinner', 'tacos', 'main')).toBe('put');
    // A day with only a serving time on it has nothing to replace.
    expect(wallDayTap([dinner(WED, { time: '18:30' })], WED, 'dinner', 'tacos', 'main')).toBe('put');
  });

  it('puts a main dish straight on a day that has only sides', () => {
    const plan = [dinner(WED, { courses: [{ kind: 'side', mealId: 'garlic-bread' }] })];
    expect(wallDayTap(plan, WED, 'dinner', 'lasagna', 'main')).toBe('put');
  });

  it('lets a side, dessert or drink join a day that has a meal', () => {
    const plan = [dinner(WED, { mealId: 'lasagna' })];
    expect(wallDayTap(plan, WED, 'dinner', 'garlic-bread', 'side')).toBe('join');
    expect(wallDayTap(plan, WED, 'dinner', 'brownies', 'dessert')).toBe('join');
    expect(wallDayTap(plan, WED, 'dinner', 'lemonade', 'drink')).toBe('join');
  });

  it('asks before a main dish goes on a day with a different one, saved or typed', () => {
    expect(wallDayTap([dinner(WED, { mealId: 'stir-fry' })], WED, 'dinner', 'tacos', 'main')).toBe('ask');
    expect(wallDayTap([dinner(WED, { customText: 'Eating out' })], WED, 'dinner', 'tacos', 'main')).toBe('ask');
  });

  it('offers to take off a recipe already on the day, as the main dish or a course', () => {
    const plan = [dinner(WED, { mealId: 'lasagna', courses: [{ kind: 'side', mealId: 'garlic-bread' }] })];
    expect(wallDayTap(plan, WED, 'dinner', 'lasagna', 'main')).toBe('off');
    expect(wallDayTap(plan, WED, 'dinner', 'garlic-bread', 'side')).toBe('off');
  });

  it('reads only the meal it was tapped on', () => {
    const plan = [dinner(WED, { mealId: 'stir-fry' }), { date: THU, slot: 'lunch', mealId: 'tacos' } as PlannedMeal];
    expect(wallDayTap(plan, WED, 'lunch', 'tacos', 'main')).toBe('put');
    expect(wallDayTap(plan, THU, 'dinner', 'tacos', 'main')).toBe('put');
  });
});

describe('applyWallPlanChange', () => {
  describe('put', () => {
    it('plans a recipe on a free day', () => {
      const plan = [dinner(THU, { mealId: 'chili' })];
      const result = applyWallPlanChange(plan, change('put', 'tacos'));
      expect(result).toMatchObject({ ok: true, outcome: 'planned', changed: true });
      if (!result.ok) return;
      expect(at(result.plan)).toEqual({ date: WED, slot: 'dinner', mealId: 'tacos' });
      expect(at(result.plan, THU)).toEqual(dinner(THU, { mealId: 'chili' }));
    });

    it('plans a main dish under the sides already on the day, keeping them and the serving time', () => {
      const plan = [dinner(WED, { time: '17:45', courses: [{ kind: 'side', mealId: 'garlic-bread' }] })];
      const result = applyWallPlanChange(plan, change('put', 'lasagna'));
      expect(result).toMatchObject({ ok: true, outcome: 'planned', changed: true });
      if (!result.ok) return;
      expect(at(result.plan)).toEqual(dinner(WED, { mealId: 'lasagna', time: '17:45', courses: [{ kind: 'side', mealId: 'garlic-bread' }] }));
    });

    it('lets a side join a day that has a meal', () => {
      const plan = [dinner(WED, { mealId: 'lasagna' })];
      const result = applyWallPlanChange(plan, change('put', 'garlic-bread', { kind: 'side' }));
      expect(result).toMatchObject({ ok: true, outcome: 'joined', changed: true });
      if (!result.ok) return;
      expect(at(result.plan)).toEqual(dinner(WED, { mealId: 'lasagna', courses: [{ kind: 'side', mealId: 'garlic-bread' }] }));
    });

    it('lets a dessert join a typed meal, after its sides', () => {
      const plan = [dinner(WED, { customText: 'Grandma\'s roast', courses: [{ kind: 'side', mealId: 'mash' }, { kind: 'drink', mealId: 'cider' }] })];
      const result = applyWallPlanChange(plan, change('put', 'apple-pie', { kind: 'dessert' }));
      expect(result).toMatchObject({ ok: true, outcome: 'joined' });
      if (!result.ok) return;
      expect(at(result.plan)?.courses?.map((c) => c.mealId)).toEqual(['mash', 'apple-pie', 'cider']);
    });

    it('lets a side join a day that has only other sides', () => {
      const plan = [dinner(WED, { courses: [{ kind: 'side', mealId: 'garlic-bread' }] })];
      const result = applyWallPlanChange(plan, change('put', 'salad', { kind: 'side' }));
      expect(result).toMatchObject({ ok: true, outcome: 'joined' });
      if (!result.ok) return;
      expect(at(result.plan)?.mealId).toBeUndefined();
      expect(at(result.plan)?.courses?.map((c) => c.mealId)).toEqual(['garlic-bread', 'salad']);
    });

    it('refuses as taken when a different main dish is there', () => {
      const plan = [dinner(WED, { mealId: 'stir-fry' })];
      expect(applyWallPlanChange(plan, change('put', 'tacos'))).toEqual({ ok: false, reason: 'taken' });
    });

    it('counts typed words as a main dish', () => {
      const plan = [dinner(WED, { customText: 'Eating out' })];
      expect(applyWallPlanChange(plan, change('put', 'tacos'))).toEqual({ ok: false, reason: 'taken' });
    });

    it('answers done, changing nothing, for a recipe already there', () => {
      const plan = [dinner(WED, { mealId: 'tacos', courses: [{ kind: 'side', mealId: 'rice' }] })];
      expect(applyWallPlanChange(plan, change('put', 'tacos'))).toEqual({ ok: true, plan, outcome: 'planned', changed: false });
      expect(applyWallPlanChange(plan, change('put', 'rice', { kind: 'side' }))).toEqual({ ok: true, plan, outcome: 'planned', changed: false });
    });

    it('refuses as full when the meal holds as many dishes as it can', () => {
      const plan = [dinner(WED, { mealId: 'lasagna', courses: courses(MAX_COURSES) })];
      expect(applyWallPlanChange(plan, change('put', 'garlic-bread', { kind: 'side' }))).toEqual({ ok: false, reason: 'full' });
    });

    it('still takes a side with room for one more', () => {
      const plan = [dinner(WED, { mealId: 'lasagna', courses: courses(MAX_COURSES - 1) })];
      expect(applyWallPlanChange(plan, change('put', 'garlic-bread', { kind: 'side' }))).toMatchObject({ ok: true, outcome: 'joined' });
    });
  });

  describe('a dessert on a free day', () => {
    it('goes on as a dessert, so a main dish planned later leads the meal without a question', () => {
      const first = applyWallPlanChange([], { action: 'put', date: WED, slot: 'dinner', mealId: 'brownies', kind: 'dessert' });
      if (!first.ok) throw new Error('expected the dessert to be planned');
      expect(first.outcome).toBe('planned');
      expect(at(first.plan)).toEqual(dinner(WED, { courses: [{ kind: 'dessert', mealId: 'brownies' }] }));
      // The day has no main dish yet: a main is put, not asked about.
      expect(wallDayTap(first.plan, WED, 'dinner', 'pizza', 'main')).toBe('put');
      const second = applyWallPlanChange(first.plan, { action: 'put', date: WED, slot: 'dinner', mealId: 'pizza', kind: 'main' });
      if (!second.ok) throw new Error('expected the main dish to be planned');
      expect(at(second.plan)).toEqual(dinner(WED, { mealId: 'pizza', courses: [{ kind: 'dessert', mealId: 'brownies' }] }));
      // And the dessert is still found on that day, to take it off.
      expect(wallDayTap(second.plan, WED, 'dinner', 'brownies', 'dessert')).toBe('off');
    });
  });

  describe('swap', () => {
    it('changes the main dish while it is still the one the wall asked about', () => {
      const plan = [dinner(WED, { mealId: 'stir-fry', time: '18:15', courses: [{ kind: 'side', mealId: 'rice' }] })];
      const result = applyWallPlanChange(plan, change('swap', 'tacos', { expect: 'm:stir-fry' }));
      expect(result).toMatchObject({ ok: true, outcome: 'swapped', changed: true });
      if (!result.ok) return;
      // The serving time and the sides stay with the meal.
      expect(at(result.plan)).toEqual(dinner(WED, { mealId: 'tacos', time: '18:15', courses: [{ kind: 'side', mealId: 'rice' }] }));
    });

    it('changes typed words for a recipe when the wall asked about those words', () => {
      const plan = [dinner(WED, { customText: 'Eating out' })];
      const result = applyWallPlanChange(plan, change('swap', 'tacos', { expect: 't:Eating out' }));
      expect(result).toMatchObject({ ok: true, outcome: 'swapped' });
      if (!result.ok) return;
      expect(mainDishMark(at(result.plan))).toBe('m:tacos');
    });

    it('refuses as changed when another dish is there now', () => {
      const plan = [dinner(WED, { mealId: 'chili' })];
      expect(applyWallPlanChange(plan, change('swap', 'tacos', { expect: 'm:stir-fry' }))).toEqual({ ok: false, reason: 'changed' });
    });

    it('refuses as changed when the wall named no dish', () => {
      const plan = [dinner(WED, { mealId: 'stir-fry' })];
      expect(applyWallPlanChange(plan, change('swap', 'tacos'))).toEqual({ ok: false, reason: 'changed' });
    });

    it('just plans the recipe when the day was emptied since the wall asked', () => {
      const result = applyWallPlanChange([], change('swap', 'tacos', { expect: 'm:stir-fry' }));
      expect(result).toMatchObject({ ok: true, outcome: 'planned', changed: true });
      if (!result.ok) return;
      expect(at(result.plan)?.mealId).toBe('tacos');
    });

    it('answers done, changing nothing, when someone already put this recipe there', () => {
      const plan = [dinner(WED, { mealId: 'tacos' })];
      expect(applyWallPlanChange(plan, change('swap', 'tacos', { expect: 'm:stir-fry' }))).toEqual({ ok: true, plan, outcome: 'planned', changed: false });
    });
  });

  describe('both', () => {
    it('adds the recipe as a second main dish while the first is still there', () => {
      const plan = [dinner(WED, { mealId: 'stir-fry', courses: [{ kind: 'side', mealId: 'rice' }] })];
      const result = applyWallPlanChange(plan, change('both', 'tacos', { expect: 'm:stir-fry' }));
      expect(result).toMatchObject({ ok: true, outcome: 'both', changed: true });
      if (!result.ok) return;
      expect(at(result.plan)).toEqual(dinner(WED, {
        mealId: 'stir-fry',
        courses: [{ kind: 'main', mealId: 'tacos' }, { kind: 'side', mealId: 'rice' }],
      }));
    });

    it('refuses as changed when another dish is there now', () => {
      const plan = [dinner(WED, { customText: 'Leftovers' })];
      expect(applyWallPlanChange(plan, change('both', 'tacos', { expect: 'm:stir-fry' }))).toEqual({ ok: false, reason: 'changed' });
    });

    it('refuses as full when the meal holds as many dishes as it can', () => {
      const plan = [dinner(WED, { mealId: 'stir-fry', courses: courses(MAX_COURSES) })];
      expect(applyWallPlanChange(plan, change('both', 'tacos', { expect: 'm:stir-fry' }))).toEqual({ ok: false, reason: 'full' });
    });
  });

  describe('off', () => {
    it('takes off a main dish and keeps the sides and the serving time', () => {
      const plan = [dinner(WED, { mealId: 'lasagna', time: '18:00', courses: [{ kind: 'side', mealId: 'garlic-bread' }] })];
      const result = applyWallPlanChange(plan, change('off', 'lasagna'));
      expect(result).toMatchObject({ ok: true, outcome: 'off', changed: true });
      if (!result.ok) return;
      expect(at(result.plan)).toEqual(dinner(WED, { time: '18:00', courses: [{ kind: 'side', mealId: 'garlic-bread' }] }));
    });

    it('empties the day when the main dish was all there was', () => {
      const result = applyWallPlanChange([dinner(WED, { mealId: 'lasagna' })], change('off', 'lasagna'));
      expect(result).toMatchObject({ ok: true, outcome: 'off', changed: true });
      if (!result.ok) return;
      expect(result.plan).toEqual([]);
    });

    it('takes off one course and leaves the rest of the meal', () => {
      const plan = [dinner(WED, { mealId: 'lasagna', courses: [{ kind: 'side', mealId: 'garlic-bread' }, { kind: 'dessert', mealId: 'brownies' }] })];
      const result = applyWallPlanChange(plan, change('off', 'garlic-bread', { kind: 'side' }));
      expect(result).toMatchObject({ ok: true, outcome: 'off', changed: true });
      if (!result.ok) return;
      expect(at(result.plan)).toEqual(dinner(WED, { mealId: 'lasagna', courses: [{ kind: 'dessert', mealId: 'brownies' }] }));
    });

    it('answers done, changing nothing, for a recipe that is already gone', () => {
      const plan = [dinner(WED, { mealId: 'chili' })];
      expect(applyWallPlanChange(plan, change('off', 'tacos'))).toEqual({ ok: true, plan, outcome: 'off', changed: false });
      expect(applyWallPlanChange([], change('off', 'tacos'))).toMatchObject({ ok: true, outcome: 'off', changed: false });
    });
  });
});

describe('undoWallPlanChange', () => {
  const before = dinner(WED, { mealId: 'stir-fry', time: '18:15' });
  const after = dinner(WED, { mealId: 'tacos', time: '18:15' });

  it('puts the meal back while it still reads as the change left it', () => {
    const lunch = { date: WED, slot: 'lunch', mealId: 'soup' } as PlannedMeal;
    const next = undoWallPlanChange([lunch, after], WED, 'dinner', before, after);
    expect(next).not.toBeNull();
    expect(at(next!)).toEqual(before);
    expect(at(next!, WED, 'lunch')).toEqual(lunch);
    expect(next).toHaveLength(2);
  });

  it('empties the day again when it was free before the change', () => {
    expect(undoWallPlanChange([after], WED, 'dinner', null, after)).toEqual([]);
  });

  it('puts back a meal the change took off, while the day is still empty', () => {
    expect(undoWallPlanChange([], WED, 'dinner', before, null)).toEqual([before]);
  });

  it('leaves the meal to whoever changed it since', () => {
    expect(undoWallPlanChange([dinner(WED, { mealId: 'chili' })], WED, 'dinner', before, after)).toBeNull();
    expect(undoWallPlanChange([dinner(WED, { mealId: 'tacos', courses: [{ kind: 'side', mealId: 'rice' }] })], WED, 'dinner', before, after)).toBeNull();
    expect(undoWallPlanChange([], WED, 'dinner', before, after)).toBeNull();
    expect(undoWallPlanChange([after], WED, 'dinner', before, null)).toBeNull();
  });

  it('reads a meal that came back from Mealie with new ids as the same meal', () => {
    const recipe = mealieMealId('5f8b7c2e-1a3d-4e6f-9b0a-2c4d6e8f0a1b');
    const side = mealieMealId('0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f');
    const left = dinner(WED, { mealId: recipe, courses: [{ kind: 'side', mealId: side }] });
    const fromMealie = dinner(WED, { mealId: recipe, sourceId: 'mealie:812', courses: [{ kind: 'side', mealId: side, sourceId: 'mealie:813' }] });
    expect(undoWallPlanChange([fromMealie], WED, 'dinner', null, left)).toEqual([]);
  });
});

describe('sameMeal', () => {
  it('compares the dishes and their order', () => {
    const a = dinner(WED, { mealId: 'tacos', courses: [{ kind: 'side', mealId: 'rice' }, { kind: 'side', customText: 'Salsa' }] });
    expect(sameMeal(a, dinner(WED, { mealId: 'tacos', courses: [{ kind: 'side', mealId: 'rice' }, { kind: 'side', customText: ' Salsa ' }] }))).toBe(true);
    expect(sameMeal(a, dinner(WED, { mealId: 'tacos', courses: [{ kind: 'side', customText: 'Salsa' }, { kind: 'side', mealId: 'rice' }] }))).toBe(false);
    expect(sameMeal(a, dinner(WED, { mealId: 'tacos', courses: [{ kind: 'dessert', mealId: 'rice' }, { kind: 'side', customText: 'Salsa' }] }))).toBe(false);
  });

  it('tells a meal from no meal', () => {
    expect(sameMeal(null, null)).toBe(true);
    expect(sameMeal(null, dinner(WED, { mealId: 'tacos' }))).toBe(false);
  });

  it('tells a changed serving time or note apart, so an Undo never puts an old one back over it', () => {
    const a = dinner(WED, { mealId: 'tacos', time: '18:00' });
    expect(sameMeal(a, dinner(WED, { mealId: 'tacos', time: '18:30' }))).toBe(false);
    expect(sameMeal(a, dinner(WED, { mealId: 'tacos', time: '18:00', notes: 'Double batch' }))).toBe(false);
    expect(sameMeal(a, dinner(WED, { mealId: 'tacos', time: '18:00', sourceId: 'mealie:7.abc' }))).toBe(true);
  });
});
