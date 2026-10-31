import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MealiePlanEntry } from '../mealie';

vi.mock('../meal-data', () => ({ readMealData: vi.fn(async () => ({ mealieExtras: {} })), updateMealData: vi.fn() }));
vi.mock('../mealie', async (importOriginal) => {
  const real = await importOriginal<typeof import('../mealie')>();
  return {
    ...real,
    readMealiePlan: vi.fn(),
    listMealieRules: vi.fn(),
    listMealieCategories: vi.fn(),
    pickMealieRecipes: vi.fn(),
    createMealieEntry: vi.fn(),
    createRandomMealieEntry: vi.fn(),
    clearMealiePlanCache: vi.fn(),
  };
});

import { saveMealieCells, suggestMealieMeals } from '../mealie-plan';
import { clearMealiePlanCache, createMealieEntry, createRandomMealieEntry, listMealieCategories, listMealieRules, pickMealieRecipes, readMealiePlan } from '../mealie';
import { mealieSourceId } from '../mealie-map';

const THURSDAY = '2026-10-29';
const FRIDAY = '2026-10-30';
const SATURDAY = '2026-10-31';
let nextId = 100;
const made = (date: string, entryType: MealiePlanEntry['entryType'], recipeId: string | null): MealiePlanEntry =>
  ({ id: nextId++, date, entryType, title: '', text: '', recipeId, recipe: null });

beforeEach(() => {
  vi.clearAllMocks();
  nextId = 100;
  const planned = made(SATURDAY, 'dinner', 'already-planned');
  vi.mocked(readMealiePlan).mockResolvedValue({ status: 'ok', read: { entries: [planned] } } as never);
  vi.mocked(listMealieRules).mockResolvedValue([{ day: 'friday', entryType: 'dinner', queryFilterString: 'tags.name IN ["Pizza night"]' }]);
  vi.mocked(listMealieCategories).mockResolvedValue([{ name: 'Beef', slug: 'beef' }, { name: 'Dessert', slug: 'dessert' }]);
  vi.mocked(pickMealieRecipes).mockResolvedValue([{ id: 'beef-stew', slug: 'beef-stew', name: 'Beef stew' }] as never);
  vi.mocked(createMealieEntry).mockImplementation(async (w) => made(w.date, w.entryType, w.recipeId));
  vi.mocked(createRandomMealieEntry).mockImplementation(async (date, type) => made(date, type, 'pizza'));
});

describe('suggestMealieMeals', () => {
  it('lets a Mealie rule pick its dinner, picks the rest from dinner categories, and leaves planned meals alone', async () => {
    const result = await suggestMealieMeals([
      { date: THURSDAY, slot: 'dinner' },
      { date: FRIDAY, slot: 'dinner' },
      { date: SATURDAY, slot: 'dinner' },
    ]);
    // Friday has the pizza-night rule: Mealie picks it.
    expect(createRandomMealieEntry).toHaveBeenCalledWith(FRIDAY, 'dinner');
    // Thursday is Home Screens' pick, never from the desserts.
    expect(pickMealieRecipes).toHaveBeenCalledWith(1, { without: ['dessert'] });
    expect(createMealieEntry).toHaveBeenCalledWith({ date: THURSDAY, entryType: 'dinner', recipeId: 'beef-stew', title: '', text: '' });
    // Saturday was planned already.
    expect(result).toMatchObject({ ok: true, created: 2, skipped: 0 });
    if (result.ok) expect(result.entries.map((e) => e.date)).toEqual([THURSDAY, FRIDAY]);
  });

  it('counts a dinner as skipped when Mealie has too few recipes to pick from', async () => {
    vi.mocked(listMealieRules).mockResolvedValue([]);
    const result = await suggestMealieMeals([{ date: THURSDAY, slot: 'dinner' }, { date: FRIDAY, slot: 'dinner' }]);
    expect(pickMealieRecipes).toHaveBeenCalledWith(2, { without: ['dessert'] });
    expect(result).toMatchObject({ ok: true, created: 1, skipped: 1 });
  });
});

describe('saveMealieCells', () => {
  it('refuses a save made on an older copy, and forgets the cached plan so the answer is read fresh', async () => {
    const theirs = made(THURSDAY, 'dinner', 'their-recipe');
    vi.mocked(readMealiePlan).mockResolvedValue({ status: 'ok', read: { entries: [theirs] } } as never);
    // The edit was made on the entry that had this number before.
    const ours = { ...theirs, recipeId: 'our-recipe' };
    const result = await saveMealieCells([{ date: THURSDAY, slot: 'dinner', before: [mealieSourceId(ours)], after: null }]);
    expect(result).toEqual({ ok: false, reason: 'conflict' });
    expect(clearMealiePlanCache).toHaveBeenCalled();
  });
});

