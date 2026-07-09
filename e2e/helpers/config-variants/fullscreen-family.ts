import { expect } from '@playwright/test';
import type { ConfigVariant } from './types';
import { has } from './shared';

/** Local YYYY-MM-DD (matches how the meal planner keys plan entries). */
const mealISO = (offsetDays = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * A tagged meal with difficulty, planned into every default slot today — so
 * the today/menu-board views always have a hero/course meal regardless of the
 * wall-clock hour, and tags/difficulty markers can render. (The shared
 * seedMeals fixture carries neither tags nor difficulty.)
 */
const TAGGED_MEALS = {
  savedMeals: [{ id: 'meal-t', name: 'Tagged Feast', emoji: '🍲', prepTime: 15, tags: ['E2E-TAG'], difficulty: 'easy' }],
  plan: [
    { slot: 'breakfast', mealId: 'meal-t', date: mealISO(0) },
    { slot: 'lunch', mealId: 'meal-t', date: mealISO(0) },
    { slot: 'dinner', mealId: 'meal-t', date: mealISO(0) },
  ],
};

/** Phase-1 batch rows — see .claude/plans/2026-07-09-e2e-100-percent-coverage.md. */
export const FULLSCREEN_FAMILY_VARIANTS: ConfigVariant[] = [
  // ===== fullscreen-chore-chart (seed: chores → member "Avery", daily "Feed the
  // dog" with timeOfDay "anytime"; default view 'chores') =====
  {
    // StarChart renders a 7-column day grid; its first day header follows weekStartDay.
    type: 'fullscreen-chore-chart', name: 'week-start-sunday', kind: 'local-data', seed: 'chores',
    config: { view: 'chores', weekStartDay: 'sunday' },
    expect: async (mod) => {
      await has('Feed the dog')(mod);
      await expect(mod.locator('[style*="repeat(7"] > div').nth(1)).toContainText('Sun');
    },
  },
  {
    // showPoints gates the footer "Weekly tickets:" total.
    type: 'fullscreen-chore-chart', name: 'hide-points', kind: 'local-data', seed: 'chores',
    config: { view: 'chores', showPoints: false },
    expect: async (mod) => { await has('Feed the dog')(mod); await expect(mod).not.toContainText('Weekly tickets'); },
  },
  {
    // showStreaks gates the footer "Best streak:" line.
    type: 'fullscreen-chore-chart', name: 'hide-streaks', kind: 'local-data', seed: 'chores',
    config: { view: 'chores', showStreaks: false },
    expect: async (mod) => { await has('Feed the dog')(mod); await expect(mod).not.toContainText('Best streak'); },
  },
  {
    // The seeded chore is an "anytime" chore; its time-of-day band header ("Anytime")
    // is dropped when showTimeOfDay is off (groups merge into one headerless list).
    type: 'fullscreen-chore-chart', name: 'hide-time-of-day', kind: 'local-data', seed: 'chores',
    config: { view: 'chores', showTimeOfDay: false },
    expect: async (mod) => { await has('Feed the dog')(mod); await expect(mod).not.toContainText('Anytime'); },
  },
  {
    // darkMode:false migrates to the light 'linen' theme (colorScheme light vs the dark default).
    type: 'fullscreen-chore-chart', name: 'light-mode', kind: 'local-data', seed: 'chores',
    config: { view: 'chores', darkMode: false },
    expect: async (mod) => { await expect(mod.locator('.fcc-root')).toHaveCSS('color-scheme', 'light'); },
  },
  {
    // accentColor is published as the --fcc-accent custom property on the root.
    type: 'fullscreen-chore-chart', name: 'accent-color', kind: 'local-data', seed: 'chores',
    config: { view: 'chores', accentColor: '#ff0000' },
    expect: async (mod) => { await expect(mod.locator('.fcc-root')).toHaveAttribute('style', /--fcc-accent:\s*#ff0000/i); },
  },

  // ===== fullscreen-meal-planner (seed: meals → "Spaghetti Night" 🍝 25 min,
  // planned for today's dinner; default view 'week') =====
  {
    // accentColor is published as the --fmp-accent custom property on the root.
    type: 'fullscreen-meal-planner', name: 'accent-color', kind: 'local-data', seed: 'meals',
    config: { view: 'week', accentColor: '#ff0000' },
    expect: async (mod) => { await expect(mod.locator('.fmp-root')).toHaveAttribute('style', /--fmp-accent:\s*#ff0000/i); },
  },
  {
    // showPrepTime gates the "25 min" line under today's dinner card.
    type: 'fullscreen-meal-planner', name: 'hide-prep-time', kind: 'local-data', seed: 'meals',
    config: { view: 'week', showPrepTime: false },
    expect: async (mod) => { await has('Spaghetti Night')(mod); await expect(mod).not.toContainText('25 min'); },
  },
  {
    // showEmoji gates the meal emoji glyph next to the meal name.
    type: 'fullscreen-meal-planner', name: 'hide-emoji', kind: 'local-data', seed: 'meals',
    config: { view: 'week', showEmoji: false },
    expect: async (mod) => { await has('Spaghetti Night')(mod); await expect(mod).not.toContainText('🍝'); },
  },

  {
    // showTags renders the hero meal's tag chips in the today view.
    type: 'fullscreen-meal-planner', name: 'show-tags-on', kind: 'local-data', seed: 'meals', seedData: TAGGED_MEALS,
    config: { view: 'today', showTags: true },
    expect: async (mod) => { await has('Tagged Feast')(mod); await has('E2E-TAG')(mod); },
  },
  {
    type: 'fullscreen-meal-planner', name: 'show-tags-off', kind: 'local-data', seed: 'meals', seedData: TAGGED_MEALS,
    config: { view: 'today', showTags: false },
    expect: async (mod) => { await has('Tagged Feast')(mod); await expect(mod).not.toContainText('E2E-TAG'); },
  },
  {
    // showDifficulty (default false) surfaces the raw difficulty label on the
    // menu-board course meta line.
    type: 'fullscreen-meal-planner', name: 'show-difficulty', kind: 'local-data', seed: 'meals', seedData: TAGGED_MEALS,
    config: { view: 'menu-board', showDifficulty: true },
    expect: async (mod) => { await has('Tagged Feast')(mod); await has('easy')(mod); },
  },

  // ===== meal-planner (seed: meals; default view 'week') =====
  {
    // showTags renders tag chips on the today view's meal entries.
    type: 'meal-planner', name: 'show-tags-on', kind: 'local-data', seed: 'meals', seedData: TAGGED_MEALS,
    config: { view: 'today', showTags: true },
    expect: async (mod) => { await has('Tagged Feast')(mod); await has('E2E-TAG')(mod); },
  },
  {
    type: 'meal-planner', name: 'show-tags-off', kind: 'local-data', seed: 'meals', seedData: TAGGED_MEALS,
    config: { view: 'today', showTags: false },
    expect: async (mod) => { await has('Tagged Feast')(mod); await expect(mod).not.toContainText('E2E-TAG'); },
  },
  {
    // The current-day label in the week grid is tinted with accentColor; the seeded
    // plan puts a meal on today so that row (and its tinted label) is present.
    type: 'meal-planner', name: 'accent-color', kind: 'local-data', seed: 'meals',
    config: { view: 'week', accentColor: '#ff0000' },
    expect: async (mod) => {
      await has('Spaghetti Night')(mod);
      const colors = await mod.locator('.font-medium.pl-1.truncate').evaluateAll(
        (els) => els.map((el) => getComputedStyle(el).color),
      );
      expect(colors.some((c) => /^rgba?\(255,0,0/.test(c.replace(/\s/g, '')))).toBe(true);
    },
  },
];
