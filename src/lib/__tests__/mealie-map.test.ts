import { describe, it, expect } from 'vitest';
import type { MealiePlanEntry, MealieRecipeSummary } from '../mealie';
import { normalizeMealieUrl, mealieMajorVersion, searchWords } from '../mealie';
import {
  cellToMealieOps,
  groupMealieEntries,
  isUnchanged,
  mealieEntriesToPlan,
  mealieEntryExtra,
  mealieMealId,
  mealieRecipeToMeal,
  mealieRuleCovers,
  mealieSourceId,
  normalizeMealieExtras,
  parseMealieMealId,
  parseMealieMinutes,
  parseMealieSourceId,
  MealieMapError,
} from '../mealie-map';
import { mergeMealSources, mealieReadWindow, mealieStatus, canEditMergedPlan, type MealieWireBlock } from '../meal-sources';

// Shapes as a real Mealie 3.29.0 answers them (recorded 2026-10-30), with
// the household's own recipes swapped for made-up ones.
const ctx = { baseUrl: 'http://mealie.local:9925', groupSlug: 'home' };

const RECIPE_IDS = {
  tikka: '0f1e2d3c-4b5a-4968-8776-655443322110',
  naan: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  pops: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
  pancakes: '3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f',
};

function recipe(key: keyof typeof RECIPE_IDS, extra: Partial<MealieRecipeSummary> = {}): MealieRecipeSummary {
  return {
    id: RECIPE_IDS[key],
    slug: key,
    name: key[0].toUpperCase() + key.slice(1),
    image: 'xmR8',
    recipeCategory: [{ name: 'Dinner' }],
    tags: [{ name: 'Indian' }],
    rating: null,
    recipeServings: 4,
    totalTime: '45 minutes',
    prepTime: '15 minutes',
    performTime: '30 minutes',
    totalTimeSeconds: null,
    prepTimeSeconds: null,
    performTimeSeconds: null,
    dateUpdated: '2026-10-31T00:02:28.285119Z',
    ...extra,
  };
}

let nextId = 100;
function entry(date: string, entryType: MealiePlanEntry['entryType'], dish: MealieRecipeSummary | string, extra: Partial<MealiePlanEntry> = {}): MealiePlanEntry {
  const isRecipe = typeof dish !== 'string';
  return {
    id: nextId++,
    date,
    entryType,
    title: isRecipe ? '' : dish,
    text: '',
    recipeId: isRecipe ? dish.id : null,
    recipe: isRecipe ? dish : null,
    groupId: 'g1',
    userId: 'u1',
    householdId: 'h1',
    ...extra,
  };
}

const DAY = '2026-10-30';

describe('parseMealieMinutes', () => {
  it.each([
    ['45 minutes', 45],
    ['1 hour 15 minutes', 75],
    ['2 hours', 120],
    ['1h30m', 90],
    ['1 hr 30 min', 90],
    ['PT1H30M', 90],
    ['PT45M', 45],
    ['90', 90],
    ['1.5 hours', 90],
    ['', undefined],
    ['overnight', undefined],
    [null, undefined],
  ])('%s -> %s', (text, minutes) => {
    expect(parseMealieMinutes(text)).toBe(minutes);
  });
});

describe('connection helpers', () => {
  it.each([
    ['http://mealie.local:9925/', 'http://mealie.local:9925'],
    ['mealie.local:9925', 'http://mealie.local:9925'],
    ['https://food.example.com/api', 'https://food.example.com'],
    ['https://food.example.com/docs/', 'https://food.example.com'],
    ['http://192.168.1.20:9000', 'http://192.168.1.20:9000'],
  ])('normalizes %s', (raw, url) => {
    expect(normalizeMealieUrl(raw)).toBe(url);
  });

  it('refuses what is not a web address', () => {
    expect(normalizeMealieUrl('ftp://mealie.local')).toBeNull();
    expect(normalizeMealieUrl('http://')).toBeNull();
  });

  it('reads Mealie versions, with named builds counting as current', () => {
    expect(mealieMajorVersion('v3.29.0')).toBe(3);
    expect(mealieMajorVersion('1.12.0')).toBe(1);
    expect(mealieMajorVersion('nightly')).toBeNull();
  });

  it('round-trips ids', () => {
    expect(parseMealieSourceId(mealieSourceId(entry(DAY, 'dinner', 'Tacos', { id: 42 })))).toBe(42);
    expect(parseMealieSourceId('mealie:42')).toBeNull();
    expect(parseMealieSourceId('mealie:abc')).toBeNull();
    expect(parseMealieSourceId(undefined)).toBeNull();
    expect(parseMealieMealId(mealieMealId(RECIPE_IDS.tikka))).toBe(RECIPE_IDS.tikka);
    expect(parseMealieMealId('tacos')).toBeNull();
  });
});

describe('mealieRecipeToMeal', () => {
  it('maps what the views draw', () => {
    const meal = mealieRecipeToMeal(recipe('tikka', { rating: 4.4, tags: [{ name: 'Indian' }, { name: 'indian' }, { name: 'Quick' }] }), ctx);
    expect(meal).toEqual({
      id: `mealie:${RECIPE_IDS.tikka}`,
      name: 'Tikka',
      recipeUrl: 'http://mealie.local:9925/g/home/r/tikka',
      tags: ['Dinner', 'Indian', 'Quick'],
      prepTime: 15,
      cookTime: 30,
      servings: 4,
      rating: 4,
      photoUrl: `/api/mealie/image/${RECIPE_IDS.tikka}?v=xmR8`,
    });
  });

  it('prefers the seconds fields when Mealie has them', () => {
    const meal = mealieRecipeToMeal(recipe('tikka', { prepTimeSeconds: 600, performTimeSeconds: 1500 }), ctx);
    expect([meal.prepTime, meal.cookTime]).toEqual([10, 25]);
  });

  it('shows a total-only time where the views show prep time', () => {
    const meal = mealieRecipeToMeal(recipe('tikka', { prepTime: null, performTime: null, totalTime: '1 hour' }), ctx);
    expect(meal.prepTime).toBe(60);
    expect(meal.cookTime).toBeUndefined();
  });

  it('has no photo when Mealie has none', () => {
    expect(mealieRecipeToMeal(recipe('tikka', { image: null }), ctx).photoUrl).toBeUndefined();
  });
});

describe('mealieEntriesToPlan', () => {
  it('reads a Mealie dinner with sides, dessert and drink as one meal with courses', () => {
    const entries = [
      entry(DAY, 'breakfast', recipe('pancakes')),
      entry(DAY, 'lunch', 'School lunch', { text: 'Pizza day in the cafeteria' }),
      entry(DAY, 'dinner', recipe('tikka')),
      entry(DAY, 'side', recipe('naan')),
      entry(DAY, 'side', 'Cucumber salad'),
      entry(DAY, 'dessert', recipe('pops')),
      entry(DAY, 'drink', 'Lemonade'),
    ];
    const { plan, meals } = mealieEntriesToPlan(entries, { ...ctx, extras: {} });
    const dinner = plan.find((p) => p.slot === 'dinner')!;
    expect(dinner.mealId).toBe(`mealie:${RECIPE_IDS.tikka}`);
    expect(dinner.sourceId).toBe(mealieSourceId(entries[2]));
    expect(dinner.courses).toEqual([
      { kind: 'side', mealId: `mealie:${RECIPE_IDS.naan}`, sourceId: mealieSourceId(entries[3]) },
      { kind: 'side', customText: 'Cucumber salad', sourceId: mealieSourceId(entries[4]) },
      { kind: 'dessert', mealId: `mealie:${RECIPE_IDS.pops}`, sourceId: mealieSourceId(entries[5]) },
      { kind: 'drink', customText: 'Lemonade', sourceId: mealieSourceId(entries[6]) },
    ]);
    const lunch = plan.find((p) => p.slot === 'lunch')!;
    expect(lunch).toMatchObject({ customText: 'School lunch', notes: 'Pizza day in the cafeteria' });
    expect(meals.map((m) => m.name).sort()).toEqual(['Naan', 'Pancakes', 'Pops', 'Tikka']);
  });

  it('reads a second dinner as another main, in the order the entries were made', () => {
    const later = entry(DAY, 'dinner', 'Veggie burgers', { id: 900 });
    const first = entry(DAY, 'dinner', recipe('tikka'), { id: 800 });
    const { plan } = mealieEntriesToPlan([later, first], { ...ctx, extras: {} });
    expect(plan).toHaveLength(1);
    expect(plan[0].mealId).toBe(`mealie:${RECIPE_IDS.tikka}`);
    expect(plan[0].courses).toEqual([{ kind: 'main', customText: 'Veggie burgers', sourceId: mealieSourceId(later) }]);
  });

  it('keeps sides with no dinner as a meal of courses', () => {
    const side = entry(DAY, 'side', 'Big salad');
    const { plan } = mealieEntriesToPlan([side], { ...ctx, extras: {} });
    expect(plan).toEqual([{ date: DAY, slot: 'dinner', courses: [{ kind: 'side', customText: 'Big salad', sourceId: mealieSourceId(side) }] }]);
  });

  it('applies what the hub remembers: a time, and a drink that went with breakfast', () => {
    const breakfast = entry(DAY, 'breakfast', recipe('pancakes'));
    const juice = entry(DAY, 'drink', 'Orange juice');
    const extras = { [String(breakfast.id)]: { time: '07:15', date: DAY, type: 'breakfast' as const }, [String(juice.id)]: { slot: 'breakfast' as const, date: DAY, type: 'drink' as const } };
    const { plan } = mealieEntriesToPlan([breakfast, juice], { ...ctx, extras });
    expect(plan).toEqual([{
      date: DAY,
      slot: 'breakfast',
      mealId: `mealie:${RECIPE_IDS.pancakes}`,
      sourceId: mealieSourceId(breakfast),
      time: '07:15',
      courses: [{ kind: 'drink', customText: 'Orange juice', sourceId: mealieSourceId(juice) }],
    }]);
  });

  it('skips an entry with nothing in it', () => {
    expect(mealieEntriesToPlan([entry(DAY, 'dinner', '')], { ...ctx, extras: {} }).plan).toEqual([]);
  });
});

describe('cellToMealieOps', () => {
  const tikka = entry(DAY, 'dinner', recipe('tikka'));
  const naan = entry(DAY, 'side', recipe('naan'));
  const lemonade = entry(DAY, 'drink', 'Lemonade');
  const current = [tikka, naan, lemonade];
  const read = () => mealieEntriesToPlan(current, { ...ctx, extras: {} }).plan[0];

  it('changes nothing when the meal reads back the same', () => {
    const ops = cellToMealieOps(current, DAY, 'dinner', read());
    expect(ops.deletes).toEqual([]);
    expect(ops.entries.every(isUnchanged)).toBe(true);
  });

  it('updates the main dish in place when it is swapped', () => {
    const after = { ...read(), mealId: `mealie:${RECIPE_IDS.pancakes}` };
    const ops = cellToMealieOps(current, DAY, 'dinner', after);
    const changed = ops.entries.filter((e) => !isUnchanged(e));
    expect(changed).toHaveLength(1);
    expect(changed[0].existing?.id).toBe(tikka.id);
    expect(changed[0].write).toEqual({ date: DAY, entryType: 'dinner', recipeId: RECIPE_IDS.pancakes, title: '', text: '' });
  });

  it('creates a new course and deletes a removed one', () => {
    const before = read();
    const after = { ...before, courses: [before.courses![0], { kind: 'dessert' as const, customText: 'Ice cream' }] };
    const ops = cellToMealieOps(current, DAY, 'dinner', after);
    expect(ops.deletes).toEqual([lemonade.id]);
    const created = ops.entries.filter((e) => !e.existing);
    expect(created.map((e) => e.write)).toEqual([{ date: DAY, entryType: 'dessert', recipeId: null, title: 'Ice cream', text: '' }]);
  });

  it('clears the whole meal', () => {
    expect(cellToMealieOps(current, DAY, 'dinner', null)).toEqual({ entries: [], deletes: [tikka.id, naan.id, lemonade.id] });
  });

  it('remembers a time on the main dish and the meal of a breakfast drink', () => {
    const after = { date: DAY, slot: 'breakfast' as const, customText: 'Waffles', time: '07:30', courses: [{ kind: 'drink' as const, customText: 'Milk' }] };
    const ops = cellToMealieOps([], DAY, 'breakfast', after);
    expect(ops.entries.map((e) => [e.write.entryType, e.extra])).toEqual([['breakfast', { time: '07:30' }], ['drink', { slot: 'breakfast' }]]);
  });

  it('writes another main as an entry of the meal itself', () => {
    const after = { date: DAY, slot: 'lunch' as const, customText: 'Soup', courses: [{ kind: 'main' as const, customText: 'Grilled cheese' }] };
    expect(cellToMealieOps([], DAY, 'lunch', after).entries.map((e) => e.write.entryType)).toEqual(['lunch', 'lunch']);
  });

  it('creates rather than steals an entry from another meal', () => {
    const elsewhere = entry('2026-10-29', 'dinner', recipe('tikka'));
    const moved = { date: DAY, slot: 'dinner' as const, mealId: `mealie:${RECIPE_IDS.tikka}`, sourceId: mealieSourceId(elsewhere) };
    const ops = cellToMealieOps([], DAY, 'dinner', moved);
    expect(ops.entries[0].existing).toBeUndefined();
  });

  it('refuses a meal from the Home Screens library', () => {
    expect(() => cellToMealieOps([], DAY, 'dinner', { date: DAY, slot: 'dinner', mealId: 'local-tacos' })).toThrow(MealieMapError);
  });

  it('groups entries into meals the way reading does', () => {
    const juice = entry(DAY, 'drink', 'Juice');
    const groups = groupMealieEntries([tikka, naan, juice], { [String(juice.id)]: { slot: 'breakfast', date: DAY, type: 'drink' } });
    expect(groups.get(`${DAY}|dinner`)?.map((e) => e.id)).toEqual([tikka.id, naan.id]);
    expect(groups.get(`${DAY}|breakfast`)?.map((e) => e.id)).toEqual([juice.id]);
  });
});

describe('normalizeMealieExtras', () => {
  it('keeps valid notes and drops the rest', () => {
    expect(normalizeMealieExtras({
      12: { time: '18:30', date: DAY, type: 'dinner' },
      13: { slot: 'lunch', date: DAY, type: 'drink' },
      14: { time: '25:00', date: DAY, type: 'dinner' },
      abc: { time: '18:30', date: DAY, type: 'dinner' },
      15: { time: '18:30', type: 'dinner' },
      16: { time: '18:30', date: DAY },
    })).toEqual({ 12: { time: '18:30', date: DAY, type: 'dinner' }, 13: { slot: 'lunch', date: DAY, type: 'drink' } });
    expect(normalizeMealieExtras([])).toBeUndefined();
  });
});

describe('meal sources', () => {
  const block: MealieWireBlock = {
    status: 'ok',
    plan: [{ date: DAY, slot: 'dinner', customText: 'From Mealie', sourceId: 'mealie:1' }],
    meals: [],
    range: { start: '2026-10-18', end: '2026-11-21' },
    fetchedAt: 1,
  };
  const local = { plan: [{ date: DAY, slot: 'dinner' as const, customText: 'Local' }], savedMeals: [{ id: 'x', name: 'X' }] };

  it('uses the local plan unless the plan lives in Mealie', () => {
    expect(mergeMealSources({ ...local, mealie: block }, {}).plan[0].customText).toBe('Local');
    expect(mergeMealSources({ ...local, mealie: block }, { planSource: 'mealie' }).plan[0].customText).toBe('From Mealie');
  });

  it('never falls back to the local plan in Mealie mode', () => {
    const merged = mergeMealSources(local, { planSource: 'mealie' });
    expect(merged.plan).toEqual([]);
    expect(canEditMergedPlan(merged)).toBe(false);
  });

  it('pauses editing while Mealie only has a stale copy', () => {
    expect(canEditMergedPlan(mergeMealSources({ mealie: block }, { planSource: 'mealie' }))).toBe(true);
    expect(canEditMergedPlan(mergeMealSources({ mealie: { ...block, status: 'stale' } }, { planSource: 'mealie' }))).toBe(false);
  });

  it('reads a week back and three ahead, aligned to the household week', () => {
    expect(mealieReadWindow('2026-10-30', 'sunday')).toEqual({ start: '2026-10-18', end: '2026-11-21' });
    expect(mealieReadWindow('2026-10-30', 'monday')).toEqual({ start: '2026-10-19', end: '2026-11-22' });
  });
});

describe('course order', () => {
  const din = entry(DAY, 'dinner', 'Tacos', { id: 500 });
  const rice = entry(DAY, 'side', 'Rice', { id: 501 });
  const beans = entry(DAY, 'side', 'Beans', { id: 502 });
  const flan = entry(DAY, 'dessert', 'Flan', { id: 503 });

  it('reads courses in the order the hub remembers, new ones after in the order they were made', () => {
    const extras = { 503: { order: 0, date: DAY, type: 'dessert' as const }, 501: { order: 1, date: DAY, type: 'side' as const } };
    const { plan } = mealieEntriesToPlan([din, rice, beans, flan], { ...ctx, extras });
    expect(plan[0].courses!.map((c) => c.customText)).toEqual(['Flan', 'Rice', 'Beans']);
  });

  it('writes the order of a meal with several courses, and none for a single one', () => {
    const read = mealieEntriesToPlan([din, rice, beans], { ...ctx, extras: {} }).plan[0];
    const moved = { ...read, courses: [read.courses![1], read.courses![0]] };
    const ops = cellToMealieOps([din, rice, beans], DAY, 'dinner', moved);
    expect(ops.entries.map((e) => [e.existing?.id, e.extra])).toEqual([[500, undefined], [502, { order: 0 }], [501, { order: 1 }]]);
    const single = { ...read, courses: [read.courses![0]] };
    expect(cellToMealieOps([din, rice, beans], DAY, 'dinner', single).entries[1].extra).toBeUndefined();
  });
});

describe('searchWords', () => {
  it('keeps the words a recipe name has to contain', () => {
    expect(searchWords('Mac and Cheese')).toEqual(['mac', 'and', 'cheese']);
    expect(searchWords('a "pie" 100%')).toEqual(['pie', '100']);
    expect(searchWords('soup soup')).toEqual(['soup']);
  });
});

describe('a number Mealie handed out again', () => {
  // Mealie on SQLite gives a deleted entry's number to the next one made.
  const chili = entry(DAY, 'dinner', recipe('tikka'), { id: 339 });
  const reused = entry(DAY, 'dinner', 'Samlar Kari', { id: 339 });

  it('is a different entry: same number, different identity', () => {
    expect(mealieSourceId(chili)).not.toBe(mealieSourceId(reused));
    expect(mealieSourceId(chili)).toBe(mealieSourceId({ ...chili }));
  });

  it('is never updated in place by an edit made on the entry that had the number before', () => {
    const edited = { date: DAY, slot: 'dinner' as const, customText: 'Leftovers', sourceId: mealieSourceId(chili) };
    const ops = cellToMealieOps([reused], DAY, 'dinner', edited);
    expect(ops.entries[0].existing).toBeUndefined();
    expect(ops.deletes).toEqual([339]);
  });

  it('does not inherit the hub notes of the entry that had the number before', () => {
    const side = entry(DAY, 'side', 'Rice', { id: 77 });
    const stale = { 77: { slot: 'breakfast' as const, time: '07:00', date: '2026-10-01', type: 'side' as const } };
    expect(mealieEntryExtra(stale, side)).toBeUndefined();
    expect(mealieEntryExtra({ 77: { ...stale[77], date: DAY, type: 'drink' } }, side)).toBeUndefined();
    expect(mealieEntryExtra({ 77: { ...stale[77], date: DAY } }, side)?.slot).toBe('breakfast');
  });
});

describe('mealieRuleCovers', () => {
  const pizzaFriday = { day: 'friday', entryType: 'dinner', queryFilterString: 'tags.name IN ["Pizza night"]' };
  const desserts = { day: 'unset', entryType: 'dessert', queryFilterString: 'recipeCategory.name IN ["Dessert"]' };

  it('covers the meal on its day, or every day, of its kind, or every kind', () => {
    expect(mealieRuleCovers([pizzaFriday], '2026-10-30', 'dinner')).toBe(true);
    expect(mealieRuleCovers([pizzaFriday], '2026-10-29', 'dinner')).toBe(false);
    expect(mealieRuleCovers([desserts], '2026-10-29', 'dessert')).toBe(true);
    expect(mealieRuleCovers([desserts], '2026-10-29', 'dinner')).toBe(false);
    expect(mealieRuleCovers([{ day: 'unset', entryType: 'unset', queryFilterString: 'tags.name IN ["Quick"]' }], '2026-10-29', 'dinner')).toBe(true);
  });

  it('leaves the pick to Home Screens when a rule filters nothing', () => {
    expect(mealieRuleCovers([{ day: 'unset', entryType: 'dinner', queryFilterString: '' }], '2026-10-29', 'dinner')).toBe(false);
    expect(mealieRuleCovers([], '2026-10-29', 'dinner')).toBe(false);
  });
});

describe('mealieStatus', () => {
  const failed = (failure?: MealieWireBlock['failure']): MealieWireBlock => ({ status: 'failed', failure, plan: [], meals: [], range: { start: DAY, end: DAY }, fetchedAt: null });

  it('says why there is no plan: not connected, the token refused, or Mealie not answering', () => {
    expect(mealieStatus({ source: 'mealie', mealie: failed('not-set-up') })).toMatchObject({ state: 'unreachable', problem: 'not-connected' });
    expect(mealieStatus({ source: 'mealie', mealie: failed('key-rejected') })).toMatchObject({ state: 'unreachable', problem: 'token' });
    expect(mealieStatus({ source: 'mealie', mealie: failed('unreachable') })).toMatchObject({ state: 'unreachable', problem: 'unreachable' });
    expect(mealieStatus({ source: 'mealie', mealie: null })).toMatchObject({ state: 'unreachable', problem: 'unreachable' });
  });
});

