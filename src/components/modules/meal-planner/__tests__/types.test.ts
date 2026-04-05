import { describe, it, expect } from 'vitest';
import { getOrderedDays, resolveMeal, getActiveSlot } from '@/lib/meal-constants';
import { getNextMealSlot } from '../types';
import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';

// ── Helpers ──────────────────────────────────────────────────────────

function meal(id: string, name: string): SavedMeal {
  return { id, name };
}

function planned(date: string, slot: MealSlotType, mealId: string): PlannedMeal {
  return { date, slot, mealId };
}

const ALL_SLOTS: MealSlotType[] = ['breakfast', 'lunch', 'snack', 'dinner'];
const STANDARD_SLOTS: MealSlotType[] = ['breakfast', 'lunch', 'dinner'];

// ── getOrderedDays ───────────────────────────────────────────────────

describe('getOrderedDays', () => {
  it('returns Sun–Sat for sunday start', () => {
    expect(getOrderedDays('sunday')).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('returns Mon–Sun for monday start', () => {
    expect(getOrderedDays('monday')).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

// ── resolveMeal ──────────────────────────────────────────────────────

describe('resolveMeal', () => {
  const savedMeals = [meal('a', 'Oatmeal'), meal('b', 'Pasta')];

  it('returns null when plan is undefined', () => {
    expect(resolveMeal('2026-04-01', 'breakfast', undefined, savedMeals)).toBeNull();
  });

  it('returns null when savedMeals is undefined', () => {
    expect(resolveMeal('2026-04-01', 'breakfast', [planned('2026-04-01', 'breakfast', 'a')], undefined)).toBeNull();
  });

  it('returns null when no planned entry matches day/slot', () => {
    expect(resolveMeal('2026-04-02', 'lunch', [planned('2026-04-01', 'breakfast', 'a')], savedMeals)).toBeNull();
  });

  it('returns null when mealId references nonexistent saved meal', () => {
    expect(resolveMeal('2026-04-01', 'breakfast', [planned('2026-04-01', 'breakfast', 'missing')], savedMeals)).toBeNull();
  });

  it('returns the saved meal when plan entry matches', () => {
    const result = resolveMeal('2026-04-01', 'breakfast', [planned('2026-04-01', 'breakfast', 'a')], savedMeals);
    expect(result).toEqual(savedMeals[0]);
  });

  it('returns correct meal from multiple plan entries', () => {
    const plan = [planned('2026-04-01', 'breakfast', 'a'), planned('2026-04-01', 'dinner', 'b')];
    expect(resolveMeal('2026-04-01', 'dinner', plan, savedMeals)).toEqual(savedMeals[1]);
  });

  it('returns null for empty arrays', () => {
    expect(resolveMeal('2026-04-04', 'breakfast', [], [])).toBeNull();
  });
});

// ── getActiveSlot ────────────────────────────────────────────────────

describe('getActiveSlot', () => {
  it('returns null before 5am', () => {
    expect(getActiveSlot(0, ALL_SLOTS)).toBeNull();
    expect(getActiveSlot(4, ALL_SLOTS)).toBeNull();
  });

  it('returns breakfast from 5am to 9am', () => {
    expect(getActiveSlot(5, ALL_SLOTS)).toBe('breakfast');
    expect(getActiveSlot(7, ALL_SLOTS)).toBe('breakfast');
    expect(getActiveSlot(9, ALL_SLOTS)).toBe('breakfast');
  });

  it('returns lunch from 10am to 1pm', () => {
    expect(getActiveSlot(10, ALL_SLOTS)).toBe('lunch');
    expect(getActiveSlot(12, ALL_SLOTS)).toBe('lunch');
    expect(getActiveSlot(13, ALL_SLOTS)).toBe('lunch');
  });

  it('returns snack from 2pm to 4pm', () => {
    expect(getActiveSlot(14, ALL_SLOTS)).toBe('snack');
    expect(getActiveSlot(16, ALL_SLOTS)).toBe('snack');
  });

  it('returns dinner from 5pm to 8pm', () => {
    expect(getActiveSlot(17, ALL_SLOTS)).toBe('dinner');
    expect(getActiveSlot(19, ALL_SLOTS)).toBe('dinner');
    expect(getActiveSlot(20, ALL_SLOTS)).toBe('dinner');
  });

  it('returns null after 9pm', () => {
    expect(getActiveSlot(21, ALL_SLOTS)).toBeNull();
    expect(getActiveSlot(23, ALL_SLOTS)).toBeNull();
  });

  it('skips disabled slots', () => {
    expect(getActiveSlot(15, STANDARD_SLOTS)).toBeNull(); // snack disabled, hour 15 is in snack window
    expect(getActiveSlot(10, ['dinner'])).toBeNull();      // only dinner enabled, hour 10 not in window
  });

  it('handles solo dinner slot correctly — not active at 5am', () => {
    expect(getActiveSlot(5, ['dinner'])).toBeNull();
    expect(getActiveSlot(17, ['dinner'])).toBe('dinner');
    expect(getActiveSlot(20, ['dinner'])).toBe('dinner');
    expect(getActiveSlot(21, ['dinner'])).toBeNull();
  });

  it('handles solo snack slot', () => {
    expect(getActiveSlot(13, ['snack'])).toBeNull();
    expect(getActiveSlot(14, ['snack'])).toBe('snack');
    expect(getActiveSlot(16, ['snack'])).toBe('snack');
    expect(getActiveSlot(17, ['snack'])).toBeNull();
  });

  it('returns null for empty slots array', () => {
    expect(getActiveSlot(12, [])).toBeNull();
  });
});

// ── getNextMealSlot ──────────────────────────────────────────────────

describe('getNextMealSlot', () => {
  it('returns current slot as "Now" when inside a window', () => {
    const result = getNextMealSlot(7, ALL_SLOTS);
    expect(result).toEqual({ slot: 'breakfast', dayOffset: 0, label: 'Now' });
  });

  it('returns next upcoming slot as "Coming Up" between windows', () => {
    // At 4am, before any window starts
    const result = getNextMealSlot(4, ALL_SLOTS);
    expect(result).toEqual({ slot: 'breakfast', dayOffset: 0, label: 'Coming Up' });
  });

  it('wraps to tomorrow when all windows have passed', () => {
    const result = getNextMealSlot(22, ALL_SLOTS);
    expect(result).toEqual({ slot: 'breakfast', dayOffset: 1, label: 'Tomorrow' });
  });

  it('returns "Now" at exact window start boundary', () => {
    expect(getNextMealSlot(10, ALL_SLOTS).label).toBe('Now');
    expect(getNextMealSlot(10, ALL_SLOTS).slot).toBe('lunch');
  });

  it('agrees with getActiveSlot at boundary hours', () => {
    for (const hour of [5, 10, 14, 17]) {
      const active = getActiveSlot(hour, ALL_SLOTS);
      const next = getNextMealSlot(hour, ALL_SLOTS);
      // When a slot is active, getNextMealSlot should show it as "Now"
      expect(next.slot).toBe(active);
      expect(next.label).toBe('Now');
    }
  });

  it('skips disabled slots', () => {
    // At 15:00, snack disabled — next is dinner "Coming Up"
    const result = getNextMealSlot(15, STANDARD_SLOTS);
    expect(result).toEqual({ slot: 'dinner', dayOffset: 0, label: 'Coming Up' });
  });

  it('handles solo dinner correctly', () => {
    expect(getNextMealSlot(5, ['dinner'])).toEqual({ slot: 'dinner', dayOffset: 0, label: 'Coming Up' });
    expect(getNextMealSlot(18, ['dinner'])).toEqual({ slot: 'dinner', dayOffset: 0, label: 'Now' });
    expect(getNextMealSlot(22, ['dinner'])).toEqual({ slot: 'dinner', dayOffset: 1, label: 'Tomorrow' });
  });

  it('returns fallback for empty slots', () => {
    const result = getNextMealSlot(12, []);
    expect(result).toEqual({ slot: 'breakfast', dayOffset: 0, label: 'Next' });
  });
});
