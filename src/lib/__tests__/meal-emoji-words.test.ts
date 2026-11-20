import { describe, expect, it } from 'vitest';
import { FOOD_EMOJIS } from '../meal-constants';
import { FOOD_EMOJI_WORDS, searchFoodEmojis } from '../meal-emoji-words';

describe('finding a food emoji by typing', () => {
  it('lists every emoji while nothing is typed', () => {
    expect(searchFoodEmojis('')).toEqual([...FOOD_EMOJIS]);
    expect(searchFoodEmojis('   ')).toEqual([...FOOD_EMOJIS]);
  });

  it('has words for every emoji in the grid, and for no other', () => {
    expect(Object.keys(FOOD_EMOJI_WORDS).sort()).toEqual([...FOOD_EMOJIS].sort());
  });

  it('understands the word in each language Home Screens ships', () => {
    for (const word of ['cheese', 'Käse', 'fromage', 'queso', 'kaas', 'queijo', 'ost']) {
      expect(searchFoodEmojis(word), word).toContain('🧀');
    }
    expect(searchFoodEmojis('Nudeln')).toEqual(expect.arrayContaining(['🍝', '🍜']));
    expect(searchFoodEmojis('pannenkoeken')).toEqual(['🥞']);
  });

  it('matches part of a word, whatever its case, in the grid\'s order', () => {
    expect(searchFoodEmojis('PIZZ')).toEqual(['🍕']);
    expect(searchFoodEmojis('dessert')).toEqual(['🍰', '🧁', '🍪', '🍩', '🍫', '🥧']);
  });

  it('finds nothing for words no emoji has', () => {
    expect(searchFoodEmojis('zzzz')).toEqual([]);
  });
});
