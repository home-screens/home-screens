import { describe, it, expect } from 'vitest';
import { getDifficultyColor, getNextMeal, countPlanned } from '../meal-planner-utils';
import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';
import { toISODate } from '@/lib/meal-constants';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeMeal(id: string, name: string): SavedMeal {
  return { id, name, ingredients: [], tags: [], prepTime: 30 };
}

function makePlan(date: string, slot: MealSlotType, mealId: string): PlannedMeal {
  return { date, slot, mealId };
}

const allSlots: MealSlotType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

const meals = [
  makeMeal('m1', 'Pancakes'),
  makeMeal('m2', 'Sandwich'),
  makeMeal('m3', 'Cookies'),
  makeMeal('m4', 'Pasta'),
];

// ---------------------------------------------------------------------------
// getDifficultyColor
// ---------------------------------------------------------------------------
describe('getDifficultyColor', () => {
  it('returns green for easy', () => {
    expect(getDifficultyColor('easy')).toBe('#10b981');
  });

  it('returns amber for medium', () => {
    expect(getDifficultyColor('medium')).toBe('#f59e0b');
  });

  it('returns red for hard', () => {
    expect(getDifficultyColor('hard')).toBe('#ef4444');
  });

  it('returns undefined for unknown difficulty', () => {
    expect(getDifficultyColor('expert')).toBeUndefined();
    expect(getDifficultyColor(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getNextMeal — "now" context (currently in a slot window)
// ---------------------------------------------------------------------------
describe('getNextMeal', () => {
  describe('currently in a slot window', () => {
    it('returns "now" when hour falls within breakfast window (5-10)', () => {
      // Wed Apr 1 2026, 7am
      const now = new Date(2026, 3, 1, 7, 0);
      const todayISO = toISODate(now);
      const plan = [makePlan(todayISO, 'breakfast', 'm1')];
      const result = getNextMeal(now, plan, meals, allSlots);
      expect(result).not.toBeNull();
      expect(result!.context).toBe('now');
      expect(result!.slot).toBe('breakfast');
      expect(result!.meal.name).toBe('Pancakes');
    });

    it('returns "now" when in dinner window (17-21)', () => {
      const today = new Date(2026, 3, 1, 18, 0); // Wed 6pm
      const todayISO = toISODate(today);
      const plan = [makePlan(todayISO, 'dinner', 'm4')];
      const result = getNextMeal(today, plan, meals, allSlots);
      expect(result).not.toBeNull();
      expect(result!.context).toBe('now');
      expect(result!.slot).toBe('dinner');
      expect(result!.meal.name).toBe('Pasta');
    });
  });

  describe('upcoming slot today', () => {
    it('returns "upcoming" for the next slot when not currently in one', () => {
      const today = new Date(2026, 3, 1, 4, 0); // 4am, before any slot
      const todayISO = toISODate(today);
      const plan = [makePlan(todayISO, 'breakfast', 'm1')];
      const result = getNextMeal(today, plan, meals, allSlots);
      expect(result).not.toBeNull();
      expect(result!.context).toBe('upcoming');
      expect(result!.slot).toBe('breakfast');
    });

    it('skips slots without planned meals', () => {
      const today = new Date(2026, 3, 1, 4, 0); // 4am
      const todayISO = toISODate(today);
      const plan = [makePlan(todayISO, 'dinner', 'm4')];
      const result = getNextMeal(today, plan, meals, allSlots);
      expect(result).not.toBeNull();
      expect(result!.context).toBe('upcoming');
      expect(result!.slot).toBe('dinner');
    });
  });

  describe('tomorrow fallback', () => {
    it('returns "tomorrow" when no more slots today', () => {
      const today = new Date(2026, 3, 1, 22, 0); // 10pm, past all slots
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const tomorrowISO = toISODate(tomorrow);
      const plan = [makePlan(tomorrowISO, 'breakfast', 'm1')];
      const result = getNextMeal(today, plan, meals, allSlots);
      expect(result).not.toBeNull();
      expect(result!.context).toBe('tomorrow');
      expect(result!.slot).toBe('breakfast');
      expect(result!.date).toBe(tomorrowISO);
    });

    it('wraps Saturday → Sunday', () => {
      const sat = new Date(2026, 3, 4, 22, 0);
      expect(sat.getDay()).toBe(6); // Saturday
      const sun = new Date(sat);
      sun.setDate(sat.getDate() + 1);
      const sunISO = toISODate(sun);
      const plan = [makePlan(sunISO, 'breakfast', 'm1')];
      const result = getNextMeal(sat, plan, meals, allSlots);
      expect(result).not.toBeNull();
      expect(result!.context).toBe('tomorrow');
      expect(result!.date).toBe(sunISO);
    });
  });

  describe('edge cases', () => {
    it('returns null when no slots are enabled', () => {
      const now = new Date(2026, 3, 1, 12, 0);
      const todayISO = toISODate(now);
      const plan = [makePlan(todayISO, 'lunch', 'm2')];
      const result = getNextMeal(now, plan, meals, []);
      expect(result).toBeNull();
    });

    it('returns null when no meals are planned for today or tomorrow', () => {
      const now = new Date(2026, 3, 1, 12, 0);
      const result = getNextMeal(now, [], meals, allSlots);
      expect(result).toBeNull();
    });

    it('returns null when planned mealId does not match any saved meal', () => {
      const now = new Date(2026, 3, 1, 7, 0);
      const todayISO = toISODate(now);
      const plan = [makePlan(todayISO, 'breakfast', 'nonexistent')];
      const result = getNextMeal(now, plan, meals, allSlots);
      expect(result).toBeNull();
    });

    it('respects slot filtering — only checks enabled slots', () => {
      const now = new Date(2026, 3, 1, 7, 0); // 7am
      const todayISO = toISODate(now);
      const plan = [
        makePlan(todayISO, 'breakfast', 'm1'),
        makePlan(todayISO, 'lunch', 'm2'),
      ];
      const result = getNextMeal(now, plan, meals, ['lunch']);
      expect(result).not.toBeNull();
      expect(result!.slot).toBe('lunch');
      expect(result!.context).toBe('upcoming');
    });

    it('handles plans with empty mealId', () => {
      const now = new Date(2026, 3, 1, 7, 0);
      const todayISO = toISODate(now);
      const plan: PlannedMeal[] = [{ date: todayISO, slot: 'breakfast', mealId: '' }];
      const result = getNextMeal(now, plan, meals, allSlots);
      expect(result).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// countPlanned
// ---------------------------------------------------------------------------
describe('countPlanned', () => {
  it('counts meals with mealId as filled', () => {
    const plan: PlannedMeal[] = [
      makePlan('2026-04-04', 'breakfast', 'm1'),
      makePlan('2026-04-04', 'lunch', 'm2'),
      { date: '2026-04-04', slot: 'dinner' }, // no mealId
    ];
    const result = countPlanned(plan, 28);
    expect(result.filled).toBe(2);
    expect(result.total).toBe(28);
    expect(result.pct).toBe(Math.round((2 / 28) * 100));
  });

  it('returns 0% for empty plan', () => {
    const result = countPlanned([], 28);
    expect(result.filled).toBe(0);
    expect(result.pct).toBe(0);
  });

  it('returns 0% when totalSlots is 0 (avoids division by zero)', () => {
    const result = countPlanned([], 0);
    expect(result.pct).toBe(0);
  });

  it('calculates 100% when all slots are filled', () => {
    const plan = [makePlan('2026-04-04', 'breakfast', 'm1'), makePlan('2026-04-04', 'lunch', 'm2')];
    const result = countPlanned(plan, 2);
    expect(result.pct).toBe(100);
  });
});
