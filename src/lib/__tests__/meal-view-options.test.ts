import { describe, expect, it } from 'vitest';
import { MEAL_PLANNER_VIEWS_WITHOUT_TITLE, mealViewOptions } from '../meal-view-options';

describe('which switches a meal planner view reads', () => {
  it('offers nothing but the title on a grocery list, small or full-screen', () => {
    for (const type of ['meal-planner', 'fullscreen-meal-planner'] as const) {
      const reads = type === 'meal-planner' ? mealViewOptions(type, 'grocery') : mealViewOptions(type, 'grocery');
      expect(reads).toEqual({ pictures: false, cookingTime: false, tags: false, ratings: false, difficulty: false, title: true, tapAction: false });
    }
  });

  it('never offers difficulty on the small module', () => {
    for (const view of ['week', 'today', 'next-meal', 'compact', 'list', 'grocery', 'recipes'] as const) {
      expect(mealViewOptions('meal-planner', view).difficulty).toBe(false);
    }
  });

  it('leaves minutes and tags off the small week grid and Compact, which have no room for them', () => {
    expect(mealViewOptions('meal-planner', 'week')).toMatchObject({ pictures: true, cookingTime: false, tags: false, ratings: true, tapAction: true });
    expect(mealViewOptions('meal-planner', 'compact')).toMatchObject({ pictures: true, cookingTime: false, tags: false });
    expect(mealViewOptions('meal-planner', 'list')).toMatchObject({ cookingTime: true, tags: true });
  });

  it('offers no tap action where a tap always opens the card or there is no planned meal', () => {
    expect(mealViewOptions('meal-planner', 'recipes').tapAction).toBe(false);
    expect(mealViewOptions('fullscreen-meal-planner', 'recipes').tapAction).toBe(false);
    expect(mealViewOptions('fullscreen-meal-planner', 'recipe').tapAction).toBe(false);
    expect(mealViewOptions('fullscreen-meal-planner', 'menu-board').tapAction).toBe(true);
  });

  it('offers tags only where the full-screen view draws them', () => {
    expect(mealViewOptions('fullscreen-meal-planner', 'today').tags).toBe(true);
    expect(mealViewOptions('fullscreen-meal-planner', 'next-meal').tags).toBe(true);
    expect(mealViewOptions('fullscreen-meal-planner', 'week').tags).toBe(false);
    expect(mealViewOptions('fullscreen-meal-planner', 'menu-board').tags).toBe(false);
  });

  it('offers the title where the view has one', () => {
    expect(mealViewOptions('fullscreen-meal-planner', 'recipes').title).toBe(true);
    expect(mealViewOptions('fullscreen-meal-planner', 'recipe').title).toBe(false);
    expect(mealViewOptions('fullscreen-meal-planner', 'next-meal').title).toBe(false);
    expect([...MEAL_PLANNER_VIEWS_WITHOUT_TITLE].sort()).toEqual(['compact', 'list', 'next-meal', 'recipes', 'week']);
  });

  it('reads nothing for a view it does not know', () => {
    expect(Object.values(mealViewOptions('meal-planner', 'nope' as never)).some(Boolean)).toBe(false);
  });
});
