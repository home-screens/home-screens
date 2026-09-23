import { describe, it, expect } from 'vitest';
import {
  collectCustomIconIds,
  customIconValue,
  formatIconBytes,
  iconNameFromFileName,
  iconShapeWarning,
  libraryBytes,
  isCustomIconValue,
  normalizeIconName,
  parseCustomIconValue,
} from '@/lib/custom-icons';
import { customIconUseCount, customIconUseRows, missingCustomIconIds, scanCustomIconUsage } from '@/lib/custom-icon-usage';
import { parseIconValue } from '@/lib/icon-value';
import { replaceIconReferences } from '@/lib/custom-icon-removal';
import { validateRoutines } from '@/lib/timer-logic';

const ID = 'abcdefgh2345';
const OTHER = 'zzzzzzzz7777';

describe('custom icon values', () => {
  it('round-trips an id through the stored value', () => {
    expect(customIconValue(ID)).toBe(`custom:${ID}`);
    expect(parseCustomIconValue(customIconValue(ID))).toBe(ID);
    expect(parseCustomIconValue(`  custom:${ID} `)).toBe(ID);
    expect(isCustomIconValue(`custom:${ID}`)).toBe(true);
  });

  it('fits the 32-character cap on a family member emoji', () => {
    expect(customIconValue(ID).length).toBeLessThanOrEqual(32);
  });

  it('treats anything malformed as text, not a picture', () => {
    for (const value of ['custom:', 'custom:short', 'custom:ABCDEFGH2345', 'custom:abcdefgh23456', 'custom:../etc/pas', '🍝', undefined, null]) {
      expect(parseCustomIconValue(value)).toBeNull();
    }
    expect(parseIconValue('custom:nope')).toEqual({ type: 'text', text: 'custom:nope' });
  });

  it('is a third kind of icon beside emoji and Font Awesome', () => {
    expect(parseIconValue(`custom:${ID}`)).toEqual({ type: 'custom', id: ID });
    expect(parseIconValue('fa:solid:star')).toMatchObject({ type: 'fa' });
    expect(parseIconValue('🌮')).toEqual({ type: 'text', text: '🌮' });
  });
});

describe('icon names', () => {
  it('collapses whitespace, trims and caps the length', () => {
    expect(normalizeIconName('  Taco   Tuesday ')).toBe('Taco Tuesday');
    expect(normalizeIconName('x'.repeat(50))).toHaveLength(32);
    expect(normalizeIconName('   ')).toBeNull();
    expect(normalizeIconName(42)).toBeNull();
  });

  it('makes a readable default from a file name', () => {
    expect(iconNameFromFileName('grandmas-lasagna_final.PNG')).toBe('grandmas lasagna final');
    expect(iconNameFromFileName('.png')).toBe('Icon');
  });
});

describe('formatIconBytes', () => {
  it('shows megabytes with one decimal and small files in kilobytes', () => {
    expect(formatIconBytes(2.34 * 1024 * 1024, 'en-US')).toBe('2.3 MB');
    expect(formatIconBytes(60 * 1024 * 1024, 'en-US')).toBe('60 MB');
    expect(formatIconBytes(23 * 1024, 'en-US')).toBe('23 KB');
    expect(formatIconBytes(10, 'en-US')).toBe('1 KB');
    expect(formatIconBytes(0, 'en-US')).toBe('0 KB');
  });

  it('counts a picture shared by several icons once', () => {
    expect(libraryBytes([{ hash: 'a', bytes: 100 }, { hash: 'a', bytes: 100 }, { hash: 'b', bytes: 5 }])).toBe(105);
  });
});

describe('iconShapeWarning', () => {
  it('names pictures that will look poor in an emoji-sized square', () => {
    expect(iconShapeWarning({ width: 512, height: 77 })).toBe('wide');
    expect(iconShapeWarning({ width: 60, height: 300 })).toBe('tall');
    expect(iconShapeWarning({ width: 16, height: 16 })).toBe('tiny');
    expect(iconShapeWarning({ width: 512, height: 384 })).toBeNull();
    expect(iconShapeWarning({})).toBeNull();
  });
});

describe('replaceIconReferences', () => {
  const value = `custom:${ID}`;
  it('swaps every exact match for the replacement and leaves the rest', () => {
    const doc = { savedMeals: [{ emoji: value }, { emoji: '🍲', name: value + 'x' }], list: [value, 'keep'] };
    expect(replaceIconReferences(doc, value, '🍽️')).toEqual({
      savedMeals: [{ emoji: '🍽️' }, { emoji: '🍲', name: value + 'x' }],
      list: ['🍽️', 'keep'],
    });
  });

  it('drops the field, or the array entry, when there is no replacement', () => {
    expect(replaceIconReferences({ members: [{ name: 'Leo', emoji: value }], tags: [value, 'a'] }, value, undefined))
      .toEqual({ members: [{ name: 'Leo' }], tags: ['a'] });
  });

  it('hands back the same object when nothing matched, so the caller can skip the write', () => {
    const doc = { a: { b: ['c'] } };
    expect(replaceIconReferences(doc, value, 'x')).toBe(doc);
  });
});

describe('usage', () => {
  const sources = {
    meals: { savedMeals: [{ name: "Dad's chili", emoji: `custom:${ID}` }, { name: 'Cobb', emoji: '🥗' }, { name: 'Chili cook-off', emoji: `custom:${ID}` }] },
    chores: { chores: [{ name: 'Stir the pot', emoji: `custom:${ID}` }, { name: 'Walk Biscuit', emoji: `custom:${OTHER}` }] },
    rewards: { rewards: [{ name: 'Bake', emoji: 'lucide:cake' }] },
    family: { members: [{ name: 'Leo', emoji: `custom:${OTHER}` }] },
    routines: { routines: [{ name: 'Bedtime', icon: '🌙', steps: [{ label: 'Teeth', icon: `custom:${ID}` }] }] },
    config: { screens: [{ modules: [{ config: { icon: `custom:${ID}` } }, { config: { rules: [{ icon: `custom:${ID}` }] } }] }] },
  };

  it('finds every place an icon is used, by kind', () => {
    const usage = scanCustomIconUsage(sources);
    expect(usage.get(ID)).toEqual({
      meals: ["Dad's chili", 'Chili cook-off'],
      chores: ['Stir the pot'],
      rewards: [],
      people: [],
      routines: ['Bedtime'],
      screens: 2,
    });
    expect(customIconUseCount(usage.get(ID))).toBe(6);
    expect(customIconUseRows(usage.get(OTHER))).toEqual([
      { name: 'Walk Biscuit', kind: 'chore' },
      { name: 'Leo', kind: 'person' },
    ]);
    expect(customIconUseCount(undefined)).toBe(0);
  });

  it('names restored references the library does not hold', () => {
    const ids = collectCustomIconIds(sources);
    expect([...ids].sort()).toEqual([ID, OTHER].sort());
    expect(missingCustomIconIds([sources.meals, sources.family], new Set([ID]))).toEqual([OTHER]);
    expect(missingCustomIconIds([sources.meals], new Set([ID]))).toEqual([]);
  });
});

describe('routines accept a household picture as an icon', () => {
  const routine = (icon: string) => [{
    id: 'r1', name: 'Bedtime', icon, view: 'ring',
    steps: [{ id: 's1', label: 'Teeth', icon, durationSec: 60 }],
  }];

  it('accepts a custom icon value, which is longer than the 16-character emoji cap', () => {
    expect(validateRoutines(routine(`custom:${ID}`))).toBeNull();
  });

  it('still refuses long free text', () => {
    expect(validateRoutines(routine('x'.repeat(20)))).toMatch(/icon/);
  });
});
