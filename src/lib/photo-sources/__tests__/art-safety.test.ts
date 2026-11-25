import { describe, it, expect } from 'vitest';
import { TITLE_WORDS } from '../art-safety';

/**
 * TITLE_WORDS reads a painting's title, which is in English or, when Wikidata
 * has no English one, in the language the painting was named in.
 */
describe('TITLE_WORDS', () => {
  it('catches the words in English and in the languages paintings are named in', () => {
    for (const title of [
      'Bathers at Asnières', 'Venus and Adonis',
      'Landschaft mit badenden Frauen', 'Fontaine avec deux amours', 'Les bains Deligny', 'Vanneau huppé pendu par une patte',
      'Nymphes au bain', 'Baadsters in een bos', 'Bañistas en la playa', 'De kruisiging', 'Le Massacre des innocents',
    ]) expect(TITLE_WORDS.test(title), title).toBe(true);
  });

  it('matches whole words with their accents, which a plain word boundary misses', () => {
    for (const title of ['Danaë', 'Pietà', 'Vénus Médicis', 'Ève', 'La Toilette de Psyché', 'Die Hölle']) {
      expect(TITLE_WORDS.test(title), title).toBe(true);
    }
  });

  it('leaves alone words that only start like one, and places named like one', () => {
    for (const title of [
      'Le Bassin aux nymphéas, Harmonie rose', 'Porto Venere, Spezia, Italy', "L'Enclos des Chartreux, rue d'Enfer",
      'Nature morte au melon', 'Bad Ischl', 'Baden-Baden', 'View of Pest', 'Evening on the Seine', 'Le Nuage',
    ]) expect(TITLE_WORDS.test(title), title).toBe(false);
  });
});
