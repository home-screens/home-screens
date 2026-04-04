import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateRandomPlan } from '@/lib/meal-shuffle';
import type { SavedMeal, MealSlotType } from '@/types/config';

const SLOTS: MealSlotType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

function makeMeal(id: string, tags?: string[]): SavedMeal {
  return { id, name: `Meal ${id}`, tags };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateRandomPlan', () => {
  it('returns empty plan when no saved meals', () => {
    expect(generateRandomPlan([], SLOTS)).toEqual([]);
  });

  it('fills all slots when fillRate is 1', () => {
    // Force Math.random to always return 0 (< 1, so every slot fills)
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const meals = [makeMeal('a')];

    const plan = generateRandomPlan(meals, SLOTS, 1);
    // 7 days × 4 slots = 28
    expect(plan).toHaveLength(28);
  });

  it('fills no slots when fillRate is 0', () => {
    // random() returns 0.5, which is > 0 fillRate — all skipped
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const meals = [makeMeal('a')];

    const plan = generateRandomPlan(meals, SLOTS, 0);
    expect(plan).toHaveLength(0);
  });

  it('covers all 7 days', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const meals = [makeMeal('a')];

    const plan = generateRandomPlan(meals, SLOTS, 1);
    const days = new Set(plan.map((p) => p.day));
    expect(days.size).toBe(7);
    expect(days).toContain(0);
    expect(days).toContain(6);
  });

  it('only assigns eligible slots based on meal tags', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // This meal is tagged as breakfast-only
    const meals = [makeMeal('bf', ['Breakfast'])];

    const plan = generateRandomPlan(meals, SLOTS, 1);
    // Only breakfast slots should be filled
    for (const entry of plan) {
      expect(entry.slot).toBe('breakfast');
    }
    expect(plan).toHaveLength(7); // one breakfast per day
  });

  it('assigns untagged meals to any slot', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const meals = [makeMeal('generic', ['Healthy'])]; // non-slot tags

    const plan = generateRandomPlan(meals, SLOTS, 1);
    const usedSlots = new Set(plan.map((p) => p.slot));
    expect(usedSlots.size).toBe(4);
  });

  it('handles meals with multiple slot tags', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const meals = [makeMeal('combo', ['Breakfast', 'Snack'])];

    const plan = generateRandomPlan(meals, SLOTS, 1);
    const usedSlots = new Set(plan.map((p) => p.slot));
    expect(usedSlots).toContain('breakfast');
    expect(usedSlots).toContain('snack');
    expect(usedSlots).not.toContain('lunch');
    expect(usedSlots).not.toContain('dinner');
  });

  it('returns valid PlannedMeal entries', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const meals = [makeMeal('x')];

    const plan = generateRandomPlan(meals, SLOTS, 1);
    for (const entry of plan) {
      expect(entry).toHaveProperty('day');
      expect(entry).toHaveProperty('slot');
      expect(entry).toHaveProperty('mealId');
      expect(entry.day).toBeGreaterThanOrEqual(0);
      expect(entry.day).toBeLessThan(7);
      expect(SLOTS).toContain(entry.slot);
      expect(entry.mealId).toBe('x');
    }
  });

  it('uses only provided slots (e.g. subset)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const meals = [makeMeal('a')];
    const subset: MealSlotType[] = ['breakfast', 'dinner'];

    const plan = generateRandomPlan(meals, subset, 1);
    const usedSlots = new Set(plan.map((p) => p.slot));
    expect(usedSlots).toEqual(new Set(['breakfast', 'dinner']));
    expect(plan).toHaveLength(14); // 7 days × 2 slots
  });
});
