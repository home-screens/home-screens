import { describe, it, expect } from 'vitest';
import { generateRandomPlan } from '@/lib/meal-shuffle';
import { mulberry32 } from '@/lib/sun-astro';
import type { SavedMeal, MealSlotType, PlannedMeal } from '@/types/config';

const SLOTS: MealSlotType[] = ['breakfast', 'lunch', 'snack', 'dinner'];
const WEEK_DATES = ['2026-03-29', '2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04'];
const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

function makeMeal(id: string, tags?: string[], category?: SavedMeal['category']): SavedMeal {
  return { id, name: `Meal ${id}`, tags, ...(category ? { category } : {}) };
}

function suggest(
  meals: SavedMeal[],
  seed: number,
  slots: MealSlotType[] = SLOTS,
  history: PlannedMeal[] = [],
): PlannedMeal[] {
  return generateRandomPlan(meals, slots, WEEK_DATES, { history, random: mulberry32(seed) });
}

const inSlot = (plan: PlannedMeal[], slot: MealSlotType) => plan.filter((p) => p.slot === slot);
const ids = (plan: PlannedMeal[]) => plan.map((p) => p.mealId);

/** A family library like the one testers planned from: mains, a few tagged, and dishes that go with a meal. */
const FAMILY: SavedMeal[] = [
  makeMeal('tacos', ['kid-friendly']), makeMeal('spaghetti', ['comfort']), makeMeal('stirfry', ['healthy']),
  makeMeal('salmon'), makeMeal('chili'), makeMeal('pizza', ['kid-friendly']), makeMeal('burgers'),
  makeMeal('curry', ['vegetarian']), makeMeal('soup'), makeMeal('lasagna'),
  makeMeal('pancakes', ['breakfast']), makeMeal('oatmeal', ['healthy', 'breakfast']), makeMeal('eggs', ['breakfast']),
  makeMeal('pbj', ['lunch']), makeMeal('quesadillas', ['lunch']),
  makeMeal('salad', ['healthy'], 'side'), makeMeal('garlicbread', undefined, 'side'),
  makeMeal('cookies', undefined, 'dessert'), makeMeal('pie', undefined, 'dessert'),
  makeMeal('lemonade', undefined, 'drink'), makeMeal('smoothie', ['breakfast'], 'drink'),
];

describe('generateRandomPlan', () => {
  it('returns an empty plan for an empty library', () => {
    expect(generateRandomPlan([], SLOTS, WEEK_DATES)).toEqual([]);
  });

  it('never makes a side, a dessert or a drink the meal itself', () => {
    const extras = new Set(['salad', 'garlicbread', 'cookies', 'pie', 'lemonade', 'smoothie']);
    for (const seed of SEEDS) {
      expect(ids(suggest(FAMILY, seed)).filter((id) => extras.has(id!))).toEqual([]);
    }
  });

  it('keeps a meal tagged for a slot in that slot, and untagged mains out of breakfast and snack', () => {
    const breakfasts = new Set(['pancakes', 'oatmeal', 'eggs']);
    const lunches = new Set(['pbj', 'quesadillas']);
    for (const seed of SEEDS) {
      const plan = suggest(FAMILY, seed);
      for (const p of inSlot(plan, 'breakfast')) expect(breakfasts).toContain(p.mealId);
      for (const p of plan.filter((e) => e.slot !== 'breakfast')) expect(breakfasts).not.toContain(p.mealId);
      for (const p of plan.filter((e) => e.slot !== 'lunch')) expect(lunches).not.toContain(p.mealId);
      // Nothing in this library is tagged as a snack.
      expect(inSlot(plan, 'snack')).toEqual([]);
    }
  });

  it('fills every dinner when the library has enough, with no dinner twice in the week', () => {
    for (const seed of SEEDS) {
      const dinners = inSlot(suggest(FAMILY, seed), 'dinner');
      expect(dinners.map((p) => p.date)).toEqual(WEEK_DATES);
      expect(new Set(ids(dinners)).size).toBe(7);
    }
  });

  it('never puts the same meal in two slots of one day', () => {
    const meals = [makeMeal('toast', ['breakfast', 'lunch', 'snack']), makeMeal('fruit', ['breakfast', 'snack'])];
    for (const seed of SEEDS) {
      const plan = suggest(meals, seed);
      for (const date of WEEK_DATES) {
        const day = ids(plan.filter((p) => p.date === date));
        expect(new Set(day).size).toBe(day.length);
      }
    }
  });

  it('uses a new meal before it repeats one anywhere in the week', () => {
    for (const seed of SEEDS) {
      const plan = suggest(FAMILY, seed);
      // Ten untagged mains: seven dinners, then three lunches beside the two
      // lunch meals. Only the tagged breakfasts and lunches come round again,
      // and only once every lunch has had a turn.
      const counts = new Map<string, number>();
      for (const id of ids(plan)) counts.set(id!, (counts.get(id!) ?? 0) + 1);
      const repeated = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
      expect(repeated.every((id) => ['pancakes', 'oatmeal', 'eggs', 'pbj', 'quesadillas'].includes(id))).toBe(true);
      const lunches = ids(inSlot(plan, 'lunch'));
      expect(lunches).toHaveLength(7);
      expect(lunches.filter((id) => id !== 'pbj' && id !== 'quesadillas')).toHaveLength(3);
    }
  });

  it("brings back the slot's own meals when it runs out, not two days running", () => {
    for (const seed of SEEDS) {
      const breakfasts = inSlot(suggest(FAMILY, seed), 'breakfast');
      expect(breakfasts).toHaveLength(7);
      for (let i = 1; i < breakfasts.length; i++) {
        expect(breakfasts[i].mealId).not.toBe(breakfasts[i - 1].mealId);
      }
    }
  });

  it('repeats a lone tagged meal every day when it is all the slot has', () => {
    const plan = suggest([makeMeal('oatmeal', ['Breakfast'])], 1);
    expect(plan.map((p) => `${p.slot}:${p.mealId}`)).toEqual(WEEK_DATES.map(() => 'breakfast:oatmeal'));
  });

  it('leaves dinners empty rather than repeat an untagged meal', () => {
    const meals = [makeMeal('a'), makeMeal('b'), makeMeal('c')];
    for (const seed of SEEDS) {
      const plan = suggest(meals, seed, ['dinner']);
      expect(plan).toHaveLength(3);
      expect(new Set(ids(plan))).toEqual(new Set(['a', 'b', 'c']));
    }
  });

  it('picks the meals tagged for a slot before the untagged ones', () => {
    const meals = [
      ...Array.from({ length: 9 }, (_, i) => makeMeal(`main-${i}`)),
      makeMeal('roast', ['dinner']), makeMeal('stew', ['Dinner']),
    ];
    for (const seed of SEEDS) {
      const dinners = ids(suggest(meals, seed, ['dinner']));
      expect(dinners).toContain('roast');
      expect(dinners).toContain('stew');
    }
  });

  it('gives dinner the first pick of the untagged mains', () => {
    const meals = Array.from({ length: 8 }, (_, i) => makeMeal(`main-${i}`));
    for (const seed of SEEDS) {
      const plan = suggest(meals, seed, ['lunch', 'dinner']);
      expect(inSlot(plan, 'dinner')).toHaveLength(7);
      expect(inSlot(plan, 'lunch')).toHaveLength(1);
    }
  });

  it('lists the week day by day in the order of the slots given', () => {
    const plan = suggest(FAMILY, 7, ['breakfast', 'lunch', 'dinner']);
    const order = plan.map((p) => `${WEEK_DATES.indexOf(p.date)}:${['breakfast', 'lunch', 'dinner'].indexOf(p.slot)}`);
    expect(order).toEqual([...order].sort());
    expect(plan.every((p) => p.slot !== 'snack')).toBe(true);
  });

  it('treats a meal with no slot tag as what the family has planned it as most', () => {
    const meals = [
      makeMeal('popcorn', ['quick']), makeMeal('apples'), makeMeal('tacos'), makeMeal('stew'),
      makeMeal('soup'), makeMeal('new-dish'),
    ];
    const history: PlannedMeal[] = [
      { date: '2026-03-20', slot: 'snack', mealId: 'popcorn' },
      { date: '2026-03-21', slot: 'snack', mealId: 'apples' },
      { date: '2026-03-21', slot: 'dinner', mealId: 'apples' },
      { date: '2026-03-20', slot: 'dinner', mealId: 'tacos' },
      { date: '2026-03-21', slot: 'breakfast', mealId: 'tacos' },
      { date: '2026-03-22', slot: 'dinner', mealId: 'tacos' },
      { date: '2026-03-22', slot: 'dinner', mealId: 'stew' },
      // A course is not the meal itself.
      { date: '2026-03-23', slot: 'dinner', mealId: 'stew', courses: [{ kind: 'side', mealId: 'soup' }] },
    ];
    for (const seed of SEEDS) {
      const plan = suggest(meals, seed, SLOTS, history);
      expect(new Set(ids(inSlot(plan, 'snack')))).toEqual(new Set(['popcorn', 'apples']));
      // Apples were a dinner once as well; tacos only once a breakfast.
      expect(ids(inSlot(plan, 'dinner'))).toEqual(expect.arrayContaining(['tacos', 'stew']));
      expect(ids(inSlot(plan, 'dinner'))).not.toContain('popcorn');
      expect(inSlot(plan, 'breakfast')).toEqual([]);
      // Never planned: lunch or dinner.
      const neverPlanned = plan.filter((p) => p.mealId === 'new-dish' || p.mealId === 'soup');
      expect(neverPlanned.every((p) => p.slot === 'lunch' || p.slot === 'dinner')).toBe(true);
    }
  });

  it('lets a slot tag win over what the family has planned', () => {
    const meals = [makeMeal('pancakes', ['breakfast'])];
    const history: PlannedMeal[] = [{ date: '2026-03-20', slot: 'dinner', mealId: 'pancakes' }];
    expect(new Set(suggest(meals, 3, SLOTS, history).map((p) => p.slot))).toEqual(new Set(['breakfast']));
  });

  it('gives the same week for the same seed', () => {
    expect(suggest(FAMILY, 42)).toEqual(suggest(FAMILY, 42));
  });
});
