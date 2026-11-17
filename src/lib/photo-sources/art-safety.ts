import type { ArtGenre } from '@/types/config';

/**
 * What keeps the `art` source fit for a family room. Paintings are only ever
 * chosen by a subject where bare skin is not expected, and then anything
 * Wikidata tags otherwise is left out. The tags are added by volunteers and
 * miss a lot, so they are a first sieve and never the whole answer: the
 * collection the wall shows (`art-collection.json`) is also looked at by a
 * person, picture by picture (`scripts/build-art-collection.mts`).
 */

/** Wikidata's ids for the subjects the source offers. */
export const SAFE_GENRES: Readonly<Record<ArtGenre, string>> = {
  'landscape': 'Q191163',
  'seascape': 'Q158607',
  'cityscape': 'Q1935974',
  'still-life': 'Q170571',
};

/** A painting that also carries one of these genres is left out: mythological, religious, history, allegory, nude, erotic art. */
export const UNSAFE_GENRES: readonly string[] = ['Q3374376', 'Q2864737', 'Q742333', 'Q2839016', 'Q40446', 'Q1168168'];

/**
 * Genre or "depicts" values that mean bare skin: nude, nudity, erotic art,
 * naked woman, clothed male and naked female, breast, nipple, areola,
 * buttocks, mons pubis, intergluteal cleft, navel, bathing, Venus, Aphrodite,
 * putto, Cupid, Eros.
 */
export const NUDE_TAGS: readonly string[] = [
  'Q40446', 'Q10791', 'Q1168168', 'Q22808839', 'Q5135552', 'Q9103', 'Q188641', 'Q843533', 'Q42165', 'Q11722446',
  'Q2044369', 'Q43801', 'Q327651', 'Q47652', 'Q35500', 'Q284865', 'Q5011', 'Q121973',
];

/** Words in a title that mean bare skin or a violent scene. Over-careful on purpose: there are plenty of paintings. */
export const TITLE_WORDS = new RegExp(`\\b(${[
  'nudes?', 'naked', 'nudity', 'nu', 'nue', 'nus', 'akt', 'nackt\\w*', 'naakt\\w*', 'desnud[oa]s?', 'nud[oa]',
  'bath', 'bathers?', 'bathing', 'baigneuses?', 'badende', 'toilette', 'odalisques?', 'harem',
  'venus', 'aphrodite', 'cupids?', 'eros', 'putti', 'putto', 'nymphs?', 'satyrs?', 'fauns?', 'bacchus', 'bacchan\\w*',
  'diana', 'leda', 'dana[eë]', 'susanna', 'bathsheba', 'andromeda', 'galatea', 'psyche', 'europa', 'eve', 'paradise', 'temptation',
  'massacre', 'martyr\\w*', 'crucifi\\w*', 'execution', 'behead\\w*', 'flaying', 'rape', 'abduction', 'slaughter\\w*',
  'torture', 'corpses?', 'hanged', 'plague', 'hell', 'lamentation', 'piet[aà]', 'dead christ',
].join('|')})\\b`, 'i');
