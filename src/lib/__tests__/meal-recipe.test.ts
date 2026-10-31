import { describe, expect, it } from 'vitest';
import type { PlannedMeal, SavedMeal } from '@/types/config';
import {
  batchWord,
  mealHasRecipe,
  mealieRecipe,
  nextRecipeMeal,
  pageRecipeSteps,
  recipePageOfStep,
  recipeStats,
  savedMealRecipe,
  splitStepLead,
} from '../meal-recipe';

const DAY = '2026-10-30';
const TOMORROW = '2026-10-31';
const at = (h: number, m = 0) => h * 60 + m;
const slots = ['breakfast', 'lunch', 'dinner'] as const;
const times = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' };

const tandoori: SavedMeal = { id: 'mealie:4b0c2a6e-6f1d-4a43-9d5e-2f6a1b9c3e70', name: 'Tandoori chicken', photoUrl: '/api/mealie/image/4b0c2a6e-6f1d-4a43-9d5e-2f6a1b9c3e70' };
const waffles: SavedMeal = { id: 'waffles', name: 'Waffles', ingredients: [{ name: 'Flour', amount: '2 cups' }] };
const toast: SavedMeal = { id: 'toast', name: 'Toast' };
const meals = [tandoori, waffles, toast];

describe('mealHasRecipe', () => {
  it('counts every Mealie recipe and a saved meal with an ingredient or a note', () => {
    expect(mealHasRecipe(tandoori)).toBe(true);
    expect(mealHasRecipe(waffles)).toBe(true);
    expect(mealHasRecipe({ id: 'x', name: 'Soup', notes: 'Use the big pot.' })).toBe(true);
  });

  it('turns down a typed meal, a bare saved meal and blank ingredient rows', () => {
    expect(mealHasRecipe(null)).toBe(false);
    expect(mealHasRecipe(toast)).toBe(false);
    expect(mealHasRecipe({ id: 'x', name: 'Soup', ingredients: [{ name: '  ' }], notes: ' ' })).toBe(false);
  });
});

describe('splitStepLead', () => {
  it('leads with a first line that ends in a colon', () => {
    expect(splitStepLead('Make the sauce:\nIn a bowl, combine the oil and soy sauce.')).toEqual({
      lead: 'Make the sauce:',
      text: 'In a bowl, combine the oil and soy sauce.',
    });
  });

  it('leaves a one-line step, a step whose first line is a sentence, and a long first line alone', () => {
    expect(splitStepLead('Heat the grill.')).toEqual({ text: 'Heat the grill.' });
    expect(splitStepLead('Heat the grill.\nThen oil the rack.')).toEqual({ text: 'Heat the grill.\nThen oil the rack.' });
    const long = `${'Whisk '.repeat(12)}together:\nThe rest.`;
    expect(splitStepLead(long)).toEqual({ text: long });
  });
});

describe('recipes', () => {
  it('reads a saved meal: ingredients with amounts, notes as paragraphs, no steps', () => {
    const meal: SavedMeal = {
      id: 'w', name: 'Waffles',
      ingredients: [{ name: 'Flour', amount: '2 cups' }, { name: ' ' }, { name: 'Maple syrup', amount: '' }],
      notes: 'Heat the iron.\n\nLeftovers freeze well.',
    };
    expect(savedMealRecipe(meal)).toEqual({
      ingredients: [{ text: 'Flour', amount: '2 cups' }, { text: 'Maple syrup' }],
      steps: [],
      notes: ['Heat the iron.', 'Leftovers freeze well.'],
    });
  });

  it('reads Mealie lines, keeping section headings and leading labelled steps', () => {
    expect(mealieRecipe({
      ingredients: [{ heading: 'For the sauce', text: '2 tablespoons soy sauce' }],
      steps: [{ text: 'Serve:\nSprinkle with cilantro.' }, { heading: 'Later', text: 'Wash up.' }],
    })).toEqual({
      ingredients: [{ heading: 'For the sauce', text: '2 tablespoons soy sauce' }],
      steps: [{ lead: 'Serve:', text: 'Sprinkle with cilantro.' }, { heading: 'Later', text: 'Wash up.' }],
      notes: [],
    });
  });

  it('lists prep, cook and serves when the meal has them', () => {
    expect(recipeStats({ id: 'x', name: 'x', prepTime: 5, cookTime: 30, servings: 2 })).toEqual([
      { kind: 'prep', minutes: 5 }, { kind: 'cook', minutes: 30 }, { kind: 'serves', count: 2 },
    ]);
    expect(recipeStats({ id: 'x', name: 'x', cookTime: 0 })).toEqual([]);
  });
});

describe('nextRecipeMeal', () => {
  const plan: PlannedMeal[] = [
    { date: DAY, slot: 'breakfast', mealId: 'waffles' },
    { date: DAY, slot: 'lunch', customText: 'Eating out' },
    { date: DAY, slot: 'dinner', mealId: 'mealie:4b0c2a6e-6f1d-4a43-9d5e-2f6a1b9c3e70' },
    { date: TOMORROW, slot: 'breakfast', mealId: 'toast' },
    { date: TOMORROW, slot: 'dinner', mealId: 'waffles' },
  ];

  it('passes over a typed lunch to tonight\'s recipe', () => {
    const lead = nextRecipeMeal(DAY, at(11, 50), plan, meals, slots, times);
    expect(lead).toMatchObject({ kind: 'meal', next: { slot: 'dinner', date: DAY, meal: { id: 'mealie:4b0c2a6e-6f1d-4a43-9d5e-2f6a1b9c3e70' } } });
  });

  it('moves to tomorrow once today is over, passing over a meal with no recipe', () => {
    expect(nextRecipeMeal(DAY, at(21), plan, meals, slots, times))
      .toMatchObject({ kind: 'meal', next: { slot: 'dinner', date: TOMORROW } });
  });

  it('says there is none today while today still has a meal to come without one', () => {
    const typed: PlannedMeal[] = [
      { date: DAY, slot: 'dinner', customText: 'Pizza night' },
      { date: TOMORROW, slot: 'dinner', mealId: 'waffles' },
    ];
    expect(nextRecipeMeal(DAY, at(16), typed, meals, slots, times)).toEqual({ kind: 'none', day: 'today' });
  });

  it('never reaches past tomorrow', () => {
    const later: PlannedMeal[] = [{ date: '2026-11-02', slot: 'dinner', mealId: 'waffles' }];
    expect(nextRecipeMeal(DAY, at(21), later, meals, slots, times)).toEqual({ kind: 'none', day: 'tomorrow' });
    expect(nextRecipeMeal(DAY, at(9), [], meals, slots, times)).toEqual({ kind: 'none', day: 'today' });
  });
});

describe('pageRecipeSteps', () => {
  it('keeps every step on one page when it fits', () => {
    expect(pageRecipeSteps([100, 100, 100], 400, 900, 10)).toEqual([[0, 1, 2]]);
  });

  it('fills the first page, then the later ones, with whole steps', () => {
    expect(pageRecipeSteps([150, 150, 200, 300, 300, 100], 320, 700, 20)).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it('starts the steps on page two when the ingredients fill page one', () => {
    expect(pageRecipeSteps([200, 100], 120, 900, 10)).toEqual([[], [0, 1]]);
  });

  it('gives a step taller than a page a page of its own', () => {
    expect(pageRecipeSteps([100, 1200, 100], 300, 800, 10)).toEqual([[0], [1], [2]]);
  });

  it('answers one empty page for a recipe with no steps', () => {
    expect(pageRecipeSteps([], 300, 800, 10)).toEqual([[]]);
  });

  it('finds the page a step is on', () => {
    const pages = [[0, 1], [2, 3], [4]];
    expect(recipePageOfStep(pages, 3)).toBe(1);
    expect(recipePageOfStep(pages, 9)).toBe(0);
  });
});

describe('batches', () => {
  const chili: SavedMeal = { id: 'x', name: 'Chili', prepTime: 15, cookTime: 60, servings: 4 };

  it('serves as many times as many for a double batch, and says which batch it is', () => {
    expect(recipeStats(chili, 2)).toEqual([
      { kind: 'prep', minutes: 15 }, { kind: 'cook', minutes: 60 }, { kind: 'serves', count: 8 }, { kind: 'batch', scale: 2 },
    ]);
    expect(recipeStats(chili, 1.5).find((s) => s.kind === 'serves')).toEqual({ kind: 'serves', count: 6 });
    expect(recipeStats(chili).some((s) => s.kind === 'batch')).toBe(false);
  });

  it('names the usual batches and writes any other as a multiple', () => {
    expect(batchWord(2)).toEqual({ key: 'batchDouble' });
    expect(batchWord(3)).toEqual({ key: 'batchTriple' });
    expect(batchWord(0.5)).toEqual({ key: 'batchHalf' });
    expect(batchWord(1.5)).toEqual({ key: 'batchTimes', scale: '1.5' });
  });
});
