import { describe, it, expect } from 'vitest';
import { paintingTitle, type TitleSources } from '../generate/art-collection-title';

/**
 * paintingTitle: which name the paintings collection keeps for a painting.
 * English first, then the painting's own language, then the artist's, then
 * any label, always as written and never translated.
 */
const sources = (over: Partial<TitleSources>): TitleSources => ({ labels: {}, ownTitles: {}, artistLanguages: [], ...over });

describe('paintingTitle', () => {
  it('takes the English label, then the label that is the same in every language', () => {
    expect(paintingTitle(sources({ labels: { fr: 'La Mer', en: 'The Sea', mul: 'Mer' }, ownTitles: { fr: 'La Mer' }, artistLanguages: ['fr'] }))).toBe('The Sea');
    expect(paintingTitle(sources({ labels: { fr: 'La Mer', mul: 'Mer' }, ownTitles: { fr: 'La Mer' }, artistLanguages: ['fr'] }))).toBe('Mer');
  });

  it('takes an English title statement when there is no English label', () => {
    expect(paintingTitle(sources({ labels: { nl: 'De Zee' }, ownTitles: { en: 'The Sea', nl: 'De Zee' } }))).toBe('The Sea');
  });

  it('counts a regional English as English', () => {
    expect(paintingTitle(sources({ labels: { fr: 'La Mer', 'en-gb': 'The Sea' } }))).toBe('The Sea');
  });

  it('with no English, keeps the label in the language the painting was named in, as written', () => {
    // Dufy, Q129263000: French only.
    expect(paintingTitle(sources({ labels: { fr: "Paysage de l'Estaque" }, ownTitles: { fr: "Paysage de l'Estaque" }, artistLanguages: ['fr'] }))).toBe("Paysage de l'Estaque");
    // A Swiss painter's painting named in German, by an artist whose first language is French.
    expect(paintingTitle(sources({ labels: { fr: 'Le Lac', de: 'Der See' }, ownTitles: { de: 'Der See' }, artistLanguages: ['fr'] }))).toBe('Der See');
  });

  it('prefers the label to the longer title statement in the same language', () => {
    // Chardin, Q29863225.
    expect(paintingTitle(sources({
      labels: { fr: 'Le Panier de raisins', ja: 'ブドウの籠' },
      ownTitles: { fr: "Panier de raisins, gobelet d'argent et bouteille" },
      artistLanguages: ['fr'],
    }))).toBe('Le Panier de raisins');
  });

  it('falls back to the title statement itself when no label is in its language', () => {
    expect(paintingTitle(sources({ labels: { ja: 'ブドウの籠' }, ownTitles: { fr: 'Le Panier de raisins' }, artistLanguages: ['fr'] }))).toBe('Le Panier de raisins');
  });

  it('with no title statement, takes the label in the artist\'s language, their first language first', () => {
    // Vallotton, Q49023984: a French label and a Kotava one.
    expect(paintingTitle(sources({
      labels: { avk: 'Terca is fentugalaf toeem (trutca ke Vallotton)', fr: "Chrysanthèmes et feuillage d'automne" },
      artistLanguages: ['fr'],
    }))).toBe("Chrysanthèmes et feuillage d'automne");
    expect(paintingTitle(sources({ labels: { de: 'Der See', fr: 'Le Lac' }, artistLanguages: ['fr', 'de'] }))).toBe('Le Lac');
  });

  it('finds the artist\'s language under a regional code', () => {
    expect(paintingTitle(sources({ labels: { 'pt-br': 'O Mar', es: 'El Mar' }, artistLanguages: ['pt'] }))).toBe('O Mar');
  });

  it('otherwise takes any label, a two-letter language before a made-up or minor one', () => {
    expect(paintingTitle(sources({ labels: { avk: 'Terca (trutca ke Vallotton)', nl: 'De Zee', de: 'Die See' }, artistLanguages: ['fr'] }))).toBe('Die See');
    expect(paintingTitle(sources({ labels: { avk: 'Terca (trutca ke Vallotton)', 'pt-br': 'O Mar' } }))).toBe('O Mar');
    expect(paintingTitle(sources({ labels: { avk: 'Terca (trutca ke Vallotton)' } }))).toBe('Terca (trutca ke Vallotton)');
  });

  it('has no title when Wikidata has no name for the painting at all', () => {
    expect(paintingTitle(sources({ artistLanguages: ['fr'] }))).toBeUndefined();
  });
});
