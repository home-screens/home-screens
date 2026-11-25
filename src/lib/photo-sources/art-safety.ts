import type { ArtGenre } from '@/types/config';

/**
 * What keeps the `art` source fit for a family room. Paintings are only ever
 * chosen by a subject where bare skin is not expected, and then anything
 * Wikidata tags otherwise is left out. The tags are added by volunteers and
 * miss a lot, so they are a first sieve and never the whole answer: the
 * collection the wall shows (`art-collection.json`) is also looked at by a
 * person, picture by picture (`scripts/build-art-collection.mts`).
 */

/** Wikidata's ids for the subjects paintings are gathered by. `famous` is not one of them: those are chosen by how well known they are. */
export const SAFE_GENRES: Readonly<Record<Exclude<ArtGenre, 'famous'>, string>> = {
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

/**
 * Words in a title that mean bare skin or a violent scene. Over-careful on purpose: there are plenty of paintings.
 * A painting with no English title keeps the one it was named with, so the words are here in French, German,
 * Dutch, Spanish and Italian too. Each is matched as a whole word with its accents: `\b` would end "Danaë" at the ë.
 * Left out because they name places: "venere" (Porto Venere), "enfer" (rue d'Enfer), "bad", "baden", "pest".
 */
export const TITLE_WORDS = new RegExp(`(?<![\\p{L}\\p{N}_])(${[
  'nudes?', 'naked', 'nudity', 'nu', 'nue', 'nus', 'akt', 'nackt\\w*', 'naakt\\w*', 'desnud[oa]s?', 'nud[oa]',
  'bath', 'bathers?', 'bathing', 'baigneuses?', 'baigneurs?', 'baignade', 'bains?', 'badend\\w*', 'baders?', 'baadsters?',
  'bagnanti', 'ba[ñn]istas', 'toilette', 'odalisques?', 'harem',
  'v[eé]nus', 'aphrodite', 'cupids?', 'amours', 'eros', 'putti', 'putto', 'nymphs?', 'nymph(es|en)', 'ninf[ae]s?', 'nimfen',
  'satyrs?', 'satyres?', 'satiri?', 'fauns?', 'faunes?', 'bacchus', 'bacchan\\w*',
  'diana', 'diane', 'l[eé]da', 'dana[eëé]', 'susanna', 'suzanne', 'bathsheba', 'bethsab[eé]e', 'andromeda', 'androm[eè]de',
  'galatea', 'galat[eé]e', 'psych[eé]', 'europa', '[eè]ve', 'paradise', 'paradis', 'paradies', 'paradijs',
  'temptation', 'tentation', 'versuchung', 'verleiding',
  'massacres?', 'gemetzel', 'strage', 'matanza', 'martyr\\w*', 'martirio', 'marter\\w*',
  'crucifi\\w*', 'crocifiss\\w*', 'kreuzigung', 'kruisiging', 'ex[eé]cution', 'hinrichtung', 'terechtstelling', 'fusilamientos?',
  'behead\\w*', 'd[eé]capit\\w*', 'enthaupt\\w*', 'onthoofd\\w*', 'flaying', 'rape', 'viol', 'raub', 'abduction',
  'enl[eè]vement', 'entf[üu]hrung', 'slaughter\\w*',
  'torture', 'corpses?', 'cadavres?', 'cad[aá]ver(es)?', 'cadaveri', 'leichen?', 'lijken?', 'hanged', 'pendus?',
  'plague', 'peste', 'hell', 'h[öo]lle', 'inferno', 'infierno',
  'lamentation', 'd[eé]ploration', 'beweinung', 'bewening', 'compianto', 'piet[aà]', 'dead christ', 'christ mort',
].join('|')})(?![\\p{L}\\p{N}_])`, 'iu');
