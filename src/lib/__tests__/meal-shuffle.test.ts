import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateRandomPlan } from '@/lib/meal-shuffle';
import type { SavedMeal, MealSlotType } from '@/types/config';

const SLOTS: MealSlotType[] = ['breakfast', 'lunch', 'snack', 'dinner'];
const WEEK_DATES = ['2026-03-29', '2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04'];

function makeMeal(id: string, tags?: string[]): SavedMeal {
  return { id, name: `Meal ${id}`, tags };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateRandomPlan', () => {
  it('returns empty plan when no saved meals', () => {
    expect(generateRandomPlan([], SLOTS, WEEK_DATES)).toEqual([]);
  });

  it('fills all slots when fillRate is 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const meals = [makeMeal('a')];

    const plan = generateRandomPlan(meals, SLOTS, WEEK_DATES, 1);
    // 7 days × 4 slots = 28
    expect(plan).toHaveLength(28);
  });

  it('fills no slots when fillRate is 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const meals = [makeMeal('a')];

    const plan = generateRandomPlan(meals, SLOTS, WEEK_DATES, 0);
    expect(plan).toHaveLength(0);
  });

  it('covers all 7 dates', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const meals = [makeMeal('a')];

    const plan = generateRandomPlan(meals, SLOTS, WEEK_DATES, 1);
    const dates = new Set(plan.map((p) => p.date));
    expect(dates.size).toBe(7);
    expect(dates).toContain('2026-03-29');
    expect(dates).toContain('2026-04-04');
  });

  it('only assigns eligible slots based on meal tags', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const meals = [makeMeal('bf', ['Breakfast'])];

    const plan = generateRandomPlan(meals, SLOTS, WEEK_DATES, 1);
    for (const entry of plan) {
      expect(entry.slot).toBe('breakfast');
    }
    expect(plan).toHaveLength(7);
  });

  it('assigns untagged meals to any slot', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const meals = [makeMeal('generic', ['Healthy'])];

    const plan = generateRandomPlan(meals, SLOTS, WEEK_DATES, 1);
    const usedSlots = new Set(plan.map((p) => p.slot));
    expect(usedSlots.size).toBe(4);
  });

  it('handles meals with multiple slot tags', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const meals = [makeMeal('combo', ['Breakfast', 'Snack'])];

    const plan = generateRandomPlan(meals, SLOTS, WEEK_DATES, 1);
    const usedSlots = new Set(plan.map((p) => p.slot));
    expect(usedSlots).toContain('breakfast');
    expect(usedSlots).toContain('snack');
    expect(usedSlots).not.toContain('lunch');
    expect(usedSlots).not.toContain('dinner');
  });

  it('returns valid PlannedMeal entries', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const meals = [makeMeal('x')];

    const plan = generateRandomPlan(meals, SLOTS, WEEK_DATES, 1);
    for (const entry of plan) {
      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('slot');
      expect(entry).toHaveProperty('mealId');
      expect(typeof entry.date).toBe('string');
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(SLOTS).toContain(entry.slot);
      expect(entry.mealId).toBe('x');
    }
  });

  it('uses only provided slots (e.g. subset)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const meals = [makeMeal('a')];
    const subset: MealSlotType[] = ['breakfast', 'dinner'];

    const plan = generateRandomPlan(meals, subset, WEEK_DATES, 1);
    const usedSlots = new Set(plan.map((p) => p.slot));
    expect(usedSlots).toEqual(new Set(['breakfast', 'dinner']));
    expect(plan).toHaveLength(14);
  });
});
