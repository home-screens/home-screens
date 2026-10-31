import { describe, it, expect } from 'vitest';
import type { MealSettings } from '@/types/config';
import { DEFAULT_MEAL_SETTINGS, normalizeMealSettings } from '@/lib/meal-constants';
import {
  toggleMealSlot,
  setMealSlotDefaultTime,
  setMealWeekStart,
  setMealTimeFormat,
  resetMealSettings,
  setMealPlanSource,
} from '../meal-settings';

function settings(overrides: Partial<MealSettings> = {}): MealSettings {
  return {
    enabledSlots: ['breakfast', 'lunch', 'dinner'],
    weekStartDay: 'sunday',
    defaultSlotTimes: {},
    ...overrides,
  };
}

describe('toggleMealSlot', () => {
  it('turns a slot off and back on', () => {
    const off = toggleMealSlot(settings(), 'lunch');
    expect(off.enabledSlots).toEqual(['breakfast', 'dinner']);
    expect(toggleMealSlot(off, 'lunch').enabledSlots).toEqual(['breakfast', 'lunch', 'dinner']);
  });

  /* The phone draws the unsaved list as it stands: an appended slot put
   * Snack after Dinner until Save. */
  it('puts a slot turned back on in its place in the day', () => {
    const on = toggleMealSlot(settings({ enabledSlots: ['breakfast', 'lunch', 'dinner'] }), 'snack');
    expect(on.enabledSlots).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
    expect(toggleMealSlot(settings({ enabledSlots: ['dinner'] }), 'breakfast').enabledSlots).toEqual(['breakfast', 'dinner']);
  });

  /* Both surfaces carried this rule separately. A week with nothing to fill is
   * not a state either of them offers a way back out of. */
  it('refuses to turn off the last slot, returning the same object', () => {
    const one = settings({ enabledSlots: ['dinner'] });
    expect(toggleMealSlot(one, 'dinner')).toBe(one);
  });

  it('does not mutate the settings it was given', () => {
    const before = settings();
    toggleMealSlot(before, 'lunch');
    expect(before.enabledSlots).toEqual(['breakfast', 'lunch', 'dinner']);
  });
});

describe('setMealSlotDefaultTime', () => {
  it('sets a time', () => {
    expect(setMealSlotDefaultTime(settings(), 'dinner', '18:30').defaultSlotTimes)
      .toEqual({ dinner: '18:30' });
  });

  /* An empty string is not a valid HH:MM and would fail isValidTimeString on
   * the next read, so clearing removes the key instead of storing one. */
  it('removes the key when the time is cleared', () => {
    const withTime = settings({ defaultSlotTimes: { dinner: '18:30', lunch: '12:00' } });
    const cleared = setMealSlotDefaultTime(withTime, 'dinner', undefined);
    expect(cleared.defaultSlotTimes).toEqual({ lunch: '12:00' });
    expect('dinner' in cleared.defaultSlotTimes).toBe(false);
  });

  it('treats an empty string as a clear', () => {
    const withTime = settings({ defaultSlotTimes: { dinner: '18:30' } });
    expect(setMealSlotDefaultTime(withTime, 'dinner', '').defaultSlotTimes).toEqual({});
  });

  it('does not mutate the times it was given', () => {
    const before = settings({ defaultSlotTimes: { dinner: '18:30' } });
    setMealSlotDefaultTime(before, 'dinner', undefined);
    expect(before.defaultSlotTimes).toEqual({ dinner: '18:30' });
  });
});

describe('setMealWeekStart', () => {
  it('sets the day', () => {
    expect(setMealWeekStart(settings(), 'monday').weekStartDay).toBe('monday');
  });
});

describe('setMealTimeFormat', () => {
  it('sets an explicit format', () => {
    expect(setMealTimeFormat(settings(), '24h').timeFormat).toBe('24h');
  });

  /* "Follow the household setting" has to overwrite a stored override with a
   * present-but-undefined key, so it serializes out of the PUT body and the
   * override is gone server-side too. */
  it('carries an explicit undefined so a stored override is dropped', () => {
    const overridden = setMealTimeFormat(settings(), '12h');
    const following = setMealTimeFormat(overridden, undefined);
    expect('timeFormat' in following).toBe(true);
    expect(following.timeFormat).toBeUndefined();
    expect(JSON.parse(JSON.stringify(following))).not.toHaveProperty('timeFormat');
  });
});

describe('resetMealSettings', () => {
  it('returns the shipped defaults with no slot times', () => {
    const reset = resetMealSettings();
    expect(reset.enabledSlots).toEqual(DEFAULT_MEAL_SETTINGS.enabledSlots);
    expect(reset.weekStartDay).toBe(DEFAULT_MEAL_SETTINGS.weekStartDay);
    expect(reset.defaultSlotTimes).toEqual({});
  });

  /* DEFAULT_MEAL_SETTINGS is a module-level object: handing its array out would
   * let one surface's edit rewrite the defaults every other reader sees. */
  it('clones the collections rather than sharing the defaults', () => {
    const reset = resetMealSettings();
    expect(reset.enabledSlots).not.toBe(DEFAULT_MEAL_SETTINGS.enabledSlots);
    reset.enabledSlots.push('snack');
    expect(DEFAULT_MEAL_SETTINGS.enabledSlots).not.toContain('snack');
    expect(resetMealSettings().enabledSlots).not.toContain('snack');
  });
});

describe('setMealPlanSource', () => {
  const base = normalizeMealSettings({});

  it('switches the plan to Mealie and back', () => {
    const mealie = setMealPlanSource(base, 'mealie');
    expect(mealie.planSource).toBe('mealie');
    expect(setMealPlanSource(mealie, undefined).planSource).toBeUndefined();
  });

  it('is a no-op by identity when nothing changes', () => {
    expect(setMealPlanSource(base, undefined)).toBe(base);
  });

  it('survives a reset of the planning settings', () => {
    expect(resetMealSettings(setMealPlanSource(base, 'mealie')).planSource).toBe('mealie');
    expect(resetMealSettings().planSource).toBeUndefined();
  });

  it('is only ever mealie or nothing after a read', () => {
    expect(normalizeMealSettings({ planSource: 'mealie' }).planSource).toBe('mealie');
    expect(normalizeMealSettings({ planSource: 'tandoor' }).planSource).toBeUndefined();
  });
});
