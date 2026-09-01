import { describe, it, expect } from 'vitest';
import type { AffirmationsCategory } from '@/types/config';
import type { AffirmationEntry as Entry } from '../affirmations-data';
import { EN_US_AFFIRMATIONS } from '../affirmations-content/en-US';

// ---------------------------------------------------------------------------
// Replicate pure helper functions from AffirmationsModule.tsx for testing.
// These are exact copies of the non-exported helpers.
// ---------------------------------------------------------------------------

function getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function getSeason(month: number, latitude: number): 'spring' | 'summer' | 'fall' | 'winter' {
  const southern = latitude < 0;
  if (month >= 2 && month <= 4) return southern ? 'fall' : 'spring';
  if (month >= 5 && month <= 7) return southern ? 'winter' : 'summer';
  if (month >= 8 && month <= 10) return southern ? 'spring' : 'fall';
  return southern ? 'summer' : 'winter';
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Replicate the scoring logic from useAffirmationRotation.
 * Returns the ordered index array (high-score-first, shuffled within tiers).
 */
function computeScoredOrder(
  entries: Entry[],
  timeAware: boolean,
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night',
  dayOfWeek: number,
  season: 'spring' | 'summer' | 'fall' | 'winter',
  weatherCondition: string | null = null,
): number[] {
  if (entries.length === 0) return [];

  const withScores = entries.map((entry, i) => {
    let score = 1;

    if (timeAware) {
      if (entry.time === timeOfDay) score += 3;
      else if (entry.time === 'anytime') score += 1;

      if (entry.days && entry.days.includes(dayOfWeek)) score += 4;
      else if (entry.days) score = 0;

      if (entry.season === season) score += 2;
      else if (entry.season && entry.season !== season) score = 0;

      // Weather affinity bonus — boosts matching entries, never hides non-matching
      if (weatherCondition && entry.weather === weatherCondition) score += 2;
    }

    return { index: i, score };
  });

  const valid = withScores.filter((s) => s.score > 0);
  const tiers = new Map<number, number[]>();
  for (const s of valid) {
    if (!tiers.has(s.score)) tiers.set(s.score, []);
    tiers.get(s.score)!.push(s.index);
  }
  const sortedTiers = [...tiers.entries()].sort((a, b) => b[0] - a[0]);
  const result: number[] = [];
  for (const [, indices] of sortedTiers) {
    result.push(...shuffle(indices));
  }
  return result;
}

/** Replicate the allEntries merge logic from the component. */
function mergeEntries(
  categories: AffirmationsCategory[],
  customEntries?: { text: string; attribution?: string }[],
): Entry[] {
  const categorySet = new Set(categories);
  const builtIn = EN_US_AFFIRMATIONS.filter((e) => categorySet.has(e.category));
  const custom: Entry[] = (customEntries ?? []).map((c) => ({
    text: c.text,
    attribution: c.attribution,
    category: 'affirmations' as AffirmationsCategory,
    time: 'anytime' as const,
  }));
  return [...builtIn, ...custom];
}

// ── getTimeOfDay ──────────────────────────────────────────────────────

describe('getTimeOfDay', () => {
  it('returns morning for hours 5-11', () => {
    expect(getTimeOfDay(5)).toBe('morning');
    expect(getTimeOfDay(8)).toBe('morning');
    expect(getTimeOfDay(11)).toBe('morning');
  });

  it('returns afternoon for hours 12-16', () => {
    expect(getTimeOfDay(12)).toBe('afternoon');
    expect(getTimeOfDay(14)).toBe('afternoon');
    expect(getTimeOfDay(16)).toBe('afternoon');
  });

  it('returns evening for hours 17-20', () => {
    expect(getTimeOfDay(17)).toBe('evening');
    expect(getTimeOfDay(19)).toBe('evening');
    expect(getTimeOfDay(20)).toBe('evening');
  });

  it('returns night for hours 21-4', () => {
    expect(getTimeOfDay(21)).toBe('night');
    expect(getTimeOfDay(23)).toBe('night');
    expect(getTimeOfDay(0)).toBe('night');
    expect(getTimeOfDay(3)).toBe('night');
    expect(getTimeOfDay(4)).toBe('night');
  });

  it('handles boundary hours correctly', () => {
    expect(getTimeOfDay(4)).toBe('night');
    expect(getTimeOfDay(5)).toBe('morning');
    expect(getTimeOfDay(11)).toBe('morning');
    expect(getTimeOfDay(12)).toBe('afternoon');
    expect(getTimeOfDay(16)).toBe('afternoon');
    expect(getTimeOfDay(17)).toBe('evening');
    expect(getTimeOfDay(20)).toBe('evening');
    expect(getTimeOfDay(21)).toBe('night');
  });
});

// ── getSeason ─────────────────────────────────────────────────────────

describe('getSeason', () => {
  it('returns correct seasons for northern hemisphere', () => {
    expect(getSeason(2, 40)).toBe('spring');   // March
    expect(getSeason(3, 40)).toBe('spring');   // April
    expect(getSeason(4, 40)).toBe('spring');   // May
    expect(getSeason(5, 40)).toBe('summer');   // June
    expect(getSeason(7, 40)).toBe('summer');   // August
    expect(getSeason(8, 40)).toBe('fall');     // September
    expect(getSeason(10, 40)).toBe('fall');    // November
    expect(getSeason(11, 40)).toBe('winter');  // December
    expect(getSeason(0, 40)).toBe('winter');   // January
    expect(getSeason(1, 40)).toBe('winter');   // February
  });

  it('flips seasons for southern hemisphere (negative latitude)', () => {
    expect(getSeason(2, -30)).toBe('fall');    // March in south
    expect(getSeason(5, -30)).toBe('winter');  // June in south
    expect(getSeason(8, -30)).toBe('spring');  // September in south
    expect(getSeason(11, -30)).toBe('summer'); // December in south
  });

  it('treats latitude 0 (equator) as northern hemisphere', () => {
    expect(getSeason(5, 0)).toBe('summer');
    expect(getSeason(11, 0)).toBe('winter');
  });

  it('handles boundary months correctly', () => {
    // month 2 = March (spring/fall), month 1 = February (winter/summer)
    expect(getSeason(1, 40)).toBe('winter');
    expect(getSeason(2, 40)).toBe('spring');
    expect(getSeason(4, 40)).toBe('spring');
    expect(getSeason(5, 40)).toBe('summer');
    expect(getSeason(7, 40)).toBe('summer');
    expect(getSeason(8, 40)).toBe('fall');
    expect(getSeason(10, 40)).toBe('fall');
    expect(getSeason(11, 40)).toBe('winter');
  });
});

// ── shuffle ───────────────────────────────────────────────────────────

describe('shuffle (Fisher-Yates)', () => {
  it('returns an array of the same length', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = shuffle(input);
    expect(result).toHaveLength(input.length);
  });

  it('contains exactly the same elements (no duplicates, no losses)', () => {
    const input = [10, 20, 30, 40, 50];
    const result = shuffle(input);
    expect(result.sort((a, b) => a - b)).toEqual(input.sort((a, b) => a - b));
  });

  it('does not mutate the original array', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input);
    expect(input).toEqual(copy);
  });

  it('returns a new array (not the same reference)', () => {
    const input = [1, 2, 3];
    const result = shuffle(input);
    expect(result).not.toBe(input);
  });

  it('handles empty array', () => {
    expect(shuffle([])).toEqual([]);
  });

  it('handles single-element array', () => {
    expect(shuffle([42])).toEqual([42]);
  });

  it('handles two-element array (produces a valid permutation)', () => {
    const input = [1, 2];
    const result = shuffle(input);
    expect(result).toHaveLength(2);
    expect(result.sort()).toEqual([1, 2]);
  });

  it('eventually produces a different order (not always identity)', () => {
    // With a large array, the probability of getting the identity permutation
    // after 20 tries is vanishingly small (~(1/10!)^20)
    const input = Array.from({ length: 10 }, (_, i) => i);
    let sawDifferent = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const result = shuffle(input);
      if (result.some((v, i) => v !== input[i])) {
        sawDifferent = true;
        break;
      }
    }
    expect(sawDifferent).toBe(true);
  });
});

// ── Category filtering (mergeEntries) ─────────────────────────────────

describe('mergeEntries (category filtering)', () => {
  it('includes only entries matching the selected categories', () => {
    const entries = mergeEntries(['gratitude']);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.category === 'gratitude')).toBe(true);
  });

  it('returns entries from multiple categories', () => {
    const entries = mergeEntries(['affirmations', 'compliments']);
    const categories = new Set(entries.map((e) => e.category));
    expect(categories.has('affirmations')).toBe(true);
    expect(categories.has('compliments')).toBe(true);
    expect(categories.has('motivational')).toBe(false);
  });

  it('returns empty array when no categories match', () => {
    // Cast to satisfy TypeScript — testing the runtime behavior
    const entries = mergeEntries([] as AffirmationsCategory[]);
    expect(entries).toHaveLength(0);
  });

  it('always includes custom entries regardless of category filter', () => {
    const customEntries = [
      { text: 'My custom affirmation' },
      { text: 'Another one', attribution: 'Me' },
    ];
    const entries = mergeEntries(['gratitude'], customEntries);

    // Custom entries should appear even though we only selected "gratitude"
    const customTexts = entries.filter((e) => e.text === 'My custom affirmation' || e.text === 'Another one');
    expect(customTexts).toHaveLength(2);
  });

  it('assigns custom entries the "affirmations" category and "anytime" time', () => {
    const entries = mergeEntries([], [{ text: 'Custom one' }]);
    expect(entries).toHaveLength(1);
    expect(entries[0].category).toBe('affirmations');
    expect(entries[0].time).toBe('anytime');
  });

  it('preserves attribution on custom entries', () => {
    const entries = mergeEntries([], [{ text: 'Quote', attribution: 'Author' }]);
    expect(entries[0].attribution).toBe('Author');
  });
});

// ── Scoring / ordering logic ──────────────────────────────────────────

describe('computeScoredOrder (scoring & rotation)', () => {
  const makeEntry = (overrides: Partial<Entry> = {}): Entry => ({
    text: 'test',
    category: 'affirmations',
    time: 'anytime',
    ...overrides,
  });

  it('returns empty array for empty entries', () => {
    const result = computeScoredOrder([], true, 'morning', 1, 'spring');
    expect(result).toEqual([]);
  });

  it('includes all entries when timeAware is false (all get base score 1)', () => {
    const entries = [
      makeEntry({ time: 'morning', season: 'winter', days: [6] }),
      makeEntry({ time: 'evening' }),
      makeEntry({ time: 'anytime' }),
    ];

    // timeAware=false means no scoring bonuses, all get score=1, none get score=0
    const result = computeScoredOrder(entries, false, 'afternoon', 2, 'summer');
    expect(result).toHaveLength(3);
    expect(result.sort()).toEqual([0, 1, 2]);
  });

  it('gives higher scores to entries matching the time of day', () => {
    const entries = [
      makeEntry({ text: 'morning entry', time: 'morning' }),
      makeEntry({ text: 'anytime entry', time: 'anytime' }),
      makeEntry({ text: 'evening entry', time: 'evening' }),
    ];

    // Run scoring many times and check that morning entry (index 0)
    // always appears before evening entry (index 2) since it scores higher
    // morning entry: base(1) + time-match(3) = 4
    // anytime entry: base(1) + anytime(1) = 2
    // evening entry: base(1) + no-bonus(0) = 1
    for (let i = 0; i < 10; i++) {
      const result = computeScoredOrder(entries, true, 'morning', 0, 'spring');
      const morningPos = result.indexOf(0);
      const anytimePos = result.indexOf(1);
      const eveningPos = result.indexOf(2);
      expect(morningPos).toBeLessThan(anytimePos);
      expect(anytimePos).toBeLessThan(eveningPos);
    }
  });

  it('excludes entries with wrong day-of-week (score=0)', () => {
    const entries = [
      makeEntry({ text: 'Monday only', days: [1] }),  // Monday
      makeEntry({ text: 'Always', time: 'anytime' }),
    ];

    // Current day is Tuesday (2), so "Monday only" should be filtered out
    const result = computeScoredOrder(entries, true, 'morning', 2, 'spring');
    expect(result).not.toContain(0); // Monday-only entry excluded
    expect(result).toContain(1);     // "Always" entry included
  });

  it('includes entries matching the current day-of-week with bonus', () => {
    const entries = [
      makeEntry({ text: 'Monday only', days: [1] }),
      makeEntry({ text: 'Always', time: 'anytime' }),
    ];

    // Current day is Monday (1)
    const result = computeScoredOrder(entries, true, 'morning', 1, 'spring');
    expect(result).toContain(0);
    expect(result).toContain(1);
    // Monday-only gets: base(1) + anytime(1) + day-match(4) = 6
    // Always gets:      base(1) + anytime(1) = 2
    // So index 0 should come first
    expect(result.indexOf(0)).toBeLessThan(result.indexOf(1));
  });

  it('excludes entries with wrong season (score=0)', () => {
    const entries = [
      makeEntry({ text: 'Winter', season: 'winter' }),
      makeEntry({ text: 'No season' }),
    ];

    // Current season is summer — winter entry should be excluded
    const result = computeScoredOrder(entries, true, 'morning', 0, 'summer');
    expect(result).not.toContain(0);
    expect(result).toContain(1);
  });

  it('gives season bonus to matching entries', () => {
    const entries = [
      makeEntry({ text: 'Summer', season: 'summer', time: 'anytime' }),
      makeEntry({ text: 'No season', time: 'anytime' }),
    ];

    // Summer entry: base(1) + anytime(1) + season(2) = 4
    // No season:    base(1) + anytime(1) = 2
    for (let i = 0; i < 10; i++) {
      const result = computeScoredOrder(entries, true, 'morning', 0, 'summer');
      expect(result.indexOf(0)).toBeLessThan(result.indexOf(1));
    }
  });

  it('returns empty when all entries get score 0 (all filtered out)', () => {
    const entries = [
      makeEntry({ days: [1], season: 'winter' }),  // wrong day OR wrong season
      makeEntry({ days: [3], season: 'fall' }),     // wrong day AND wrong season
    ];

    // Day is Tuesday (2), season is summer — both entries should get score=0
    const result = computeScoredOrder(entries, true, 'morning', 2, 'summer');
    expect(result).toHaveLength(0);
  });

  it('gives weather bonus to entries matching the current condition', () => {
    const entries = [
      makeEntry({ text: 'rainy', time: 'anytime', weather: 'rain' }),
      makeEntry({ text: 'no weather', time: 'anytime' }),
    ];

    // rainy: base(1) + anytime(1) + weather(2) = 4
    // no weather: base(1) + anytime(1) = 2
    for (let i = 0; i < 10; i++) {
      const result = computeScoredOrder(entries, true, 'morning', 0, 'spring', 'rain');
      expect(result.indexOf(0)).toBeLessThan(result.indexOf(1));
    }
  });

  it('does not boost entries with non-matching weather', () => {
    const entries = [
      makeEntry({ text: 'rainy', time: 'anytime', weather: 'rain' }),
      makeEntry({ text: 'no weather', time: 'anytime' }),
    ];

    // When condition is 'clear', rainy entry gets no bonus:
    // rainy: base(1) + anytime(1) = 2
    // no weather: base(1) + anytime(1) = 2
    // Both same tier — order is shuffled, both present
    const result = computeScoredOrder(entries, true, 'morning', 0, 'spring', 'clear');
    expect(result).toHaveLength(2);
    expect(result.sort()).toEqual([0, 1]);
  });

  it('null weatherCondition behaves identically to no bonus', () => {
    const entries = [
      makeEntry({ text: 'rainy', time: 'anytime', weather: 'rain' }),
      makeEntry({ text: 'no weather', time: 'anytime' }),
    ];

    // Both entries same tier when weatherCondition is null
    const result = computeScoredOrder(entries, true, 'morning', 0, 'spring', null);
    expect(result).toHaveLength(2);
    expect(result.sort()).toEqual([0, 1]);
  });

  it('produces valid permutation indices (no out-of-bounds)', () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      makeEntry({ text: `entry-${i}` }),
    );

    const result = computeScoredOrder(entries, true, 'afternoon', 3, 'fall');
    for (const idx of result) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(entries.length);
    }
    // No duplicates
    expect(new Set(result).size).toBe(result.length);
  });
});

// ── Rotation index wrapping ───────────────────────────────────────────

describe('rotation index wrapping', () => {
  it('wraps correctly with modulo on valid order', () => {
    const orderLength = 5;
    // Simulate what the component does: (prev + 1) % len
    const indices: number[] = [];
    let index = 0;
    for (let tick = 0; tick < 12; tick++) {
      indices.push(index % orderLength);
      index = (index + 1) % orderLength;
    }
    expect(indices).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1]);
  });

  it('safeIndex handles index exceeding order length', () => {
    // Replicate: const safeIndex = index % order.length
    const order = [3, 1, 4, 0, 2];
    const bigIndex = 7;
    const safeIndex = bigIndex % order.length;
    expect(safeIndex).toBe(2); // 7 % 5 = 2
    expect(order[safeIndex]).toBe(4);
  });

  it('does not crash on single-element order', () => {
    const order = [0];
    for (let i = 0; i < 5; i++) {
      const safeIndex = i % order.length;
      expect(safeIndex).toBe(0);
      expect(order[safeIndex]).toBe(0);
    }
  });
});

// Seed-list integrity and locale parity live in affirmations-data.test.ts,
// which runs the checks over every shipped locale.
