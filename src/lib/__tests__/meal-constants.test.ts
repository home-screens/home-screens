import { describe, it, expect } from 'vitest';
import {
  getOrderedDays,
  resolveMeal,
  getActiveSlot,
  formatTagLabel,
  capitalize,
  normalizeTag,
  SLOT_ORDER,
  SLOT_WINDOWS,
  SLOT_META,
} from '@/lib/meal-constants';
import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';

// ── getOrderedDays ──

describe('getOrderedDays', () => {
  it('returns Sunday-first order for sunday start', () => {
    expect(getOrderedDays('sunday')).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('returns Monday-first order for monday start', () => {
    expect(getOrderedDays('monday')).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('always returns exactly 7 days', () => {
    expect(getOrderedDays('sunday')).toHaveLength(7);
    expect(getOrderedDays('monday')).toHaveLength(7);
  });
});

// ── resolveMeal ──

describe('resolveMeal', () => {
  const meals: SavedMeal[] = [
    { id: 'pasta', name: 'Pasta' },
    { id: 'salad', name: 'Salad' },
  ];

  it('returns null when plan is undefined', () => {
    expect(resolveMeal(0, 'dinner', undefined, meals)).toBeNull();
  });

  it('returns null when savedMeals is undefined', () => {
    const plan: PlannedMeal[] = [{ day: 0, slot: 'dinner', mealId: 'pasta' }];
    expect(resolveMeal(0, 'dinner', plan, undefined)).toBeNull();
  });

  it('returns null when no plan entry matches day/slot', () => {
    const plan: PlannedMeal[] = [{ day: 1, slot: 'lunch', mealId: 'pasta' }];
    expect(resolveMeal(0, 'dinner', plan, meals)).toBeNull();
  });

  it('returns null when mealId is empty', () => {
    const plan: PlannedMeal[] = [{ day: 0, slot: 'dinner', mealId: '' }];
    expect(resolveMeal(0, 'dinner', plan, meals)).toBeNull();
  });

  it('returns null when mealId references a non-existent meal', () => {
    const plan: PlannedMeal[] = [{ day: 0, slot: 'dinner', mealId: 'deleted' }];
    expect(resolveMeal(0, 'dinner', plan, meals)).toBeNull();
  });

  it('resolves a valid planned meal', () => {
    const plan: PlannedMeal[] = [{ day: 2, slot: 'lunch', mealId: 'salad' }];
    const result = resolveMeal(2, 'lunch', plan, meals);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('salad');
    expect(result!.name).toBe('Salad');
  });

  it('resolves the correct meal when multiple entries exist', () => {
    const plan: PlannedMeal[] = [
      { day: 0, slot: 'breakfast', mealId: 'pasta' },
      { day: 0, slot: 'dinner', mealId: 'salad' },
    ];
    expect(resolveMeal(0, 'breakfast', plan, meals)!.id).toBe('pasta');
    expect(resolveMeal(0, 'dinner', plan, meals)!.id).toBe('salad');
  });
});

// ── getActiveSlot ──

describe('getActiveSlot', () => {
  const allSlots: MealSlotType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

  it('returns breakfast during morning hours', () => {
    expect(getActiveSlot(5, allSlots)).toBe('breakfast');
    expect(getActiveSlot(9, allSlots)).toBe('breakfast');
  });

  it('returns lunch during midday hours', () => {
    expect(getActiveSlot(10, allSlots)).toBe('lunch');
    expect(getActiveSlot(13, allSlots)).toBe('lunch');
  });

  it('returns snack during afternoon hours', () => {
    expect(getActiveSlot(14, allSlots)).toBe('snack');
    expect(getActiveSlot(16, allSlots)).toBe('snack');
  });

  it('returns dinner during evening hours', () => {
    expect(getActiveSlot(17, allSlots)).toBe('dinner');
    expect(getActiveSlot(20, allSlots)).toBe('dinner');
  });

  it('returns null outside all slot windows', () => {
    expect(getActiveSlot(0, allSlots)).toBeNull();
    expect(getActiveSlot(4, allSlots)).toBeNull();
    expect(getActiveSlot(21, allSlots)).toBeNull();
    expect(getActiveSlot(23, allSlots)).toBeNull();
  });

  it('returns null when no slots are enabled', () => {
    expect(getActiveSlot(12, [])).toBeNull();
  });

  it('skips disabled slots and returns null if no match', () => {
    // Only breakfast enabled; hour 12 is lunch time
    expect(getActiveSlot(12, ['breakfast'])).toBeNull();
  });

  it('skips disabled slots and returns match when available', () => {
    expect(getActiveSlot(12, ['lunch', 'dinner'])).toBe('lunch');
  });

  it('boundary: slot window start is inclusive', () => {
    expect(getActiveSlot(10, allSlots)).toBe('lunch');   // lunch starts at 10
    expect(getActiveSlot(17, allSlots)).toBe('dinner');  // dinner starts at 17
  });

  it('boundary: slot window end is exclusive', () => {
    expect(getActiveSlot(10, allSlots)).not.toBe('breakfast'); // breakfast ends at 10
    expect(getActiveSlot(14, allSlots)).not.toBe('lunch');     // lunch ends at 14
  });
});

// ── formatTagLabel ──

describe('formatTagLabel', () => {
  it('capitalizes a single word', () => {
    expect(formatTagLabel('quick')).toBe('Quick');
  });

  it('capitalizes each segment of a hyphenated tag', () => {
    expect(formatTagLabel('kid-friendly')).toBe('Kid-Friendly');
  });

  it('handles multi-hyphen tags', () => {
    expect(formatTagLabel('gluten-free')).toBe('Gluten-Free');
    expect(formatTagLabel('batch-cook')).toBe('Batch-Cook');
  });

  it('handles already-capitalized input', () => {
    expect(formatTagLabel('Quick')).toBe('Quick');
  });
});

// ── capitalize ──

describe('capitalize', () => {
  it('capitalizes the first letter', () => {
    expect(capitalize('produce')).toBe('Produce');
  });

  it('leaves already-capitalized strings unchanged', () => {
    expect(capitalize('Produce')).toBe('Produce');
  });

  it('handles single character', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('handles empty string', () => {
    expect(capitalize('')).toBe('');
  });
});

// ── normalizeTag ──

describe('normalizeTag', () => {
  it('lowercases and converts spaces to hyphens', () => {
    expect(normalizeTag('Batch Cook')).toBe('batch-cook');
  });

  it('passes through already-canonical tags', () => {
    expect(normalizeTag('kid-friendly')).toBe('kid-friendly');
  });

  it('handles mixed case', () => {
    expect(normalizeTag('Kid-Friendly')).toBe('kid-friendly');
  });

  it('collapses multiple spaces into one hyphen', () => {
    expect(normalizeTag('Batch  Cook')).toBe('batch-cook');
  });
});

// ── Constants sanity checks ──

describe('SLOT_ORDER', () => {
  it('contains exactly 4 slots in chronological order', () => {
    expect(SLOT_ORDER).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
  });
});

describe('SLOT_WINDOWS', () => {
  it('windows are non-overlapping and in order', () => {
    const ordered = SLOT_ORDER.map((s) => SLOT_WINDOWS[s]);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].start).toBeGreaterThanOrEqual(ordered[i - 1].end);
    }
  });
});

describe('SLOT_META', () => {
  it('has entries for all slots in SLOT_ORDER', () => {
    for (const slot of SLOT_ORDER) {
      expect(SLOT_META[slot]).toBeDefined();
      expect(SLOT_META[slot].label).toBeTruthy();
      expect(SLOT_META[slot].color).toBeTruthy();
    }
  });
});
