/**
 * Shape of a "Word of the Day" seed entry.
 *
 * `pos` values are keys into the `word-of-day.pos.*` translation
 * namespace — adding a fifth part of speech requires new labels in
 * every locale's modules.json (locked by i18n-coverage-gaps.test.ts).
 */
export type PartOfSpeech = 'adjective' | 'noun' | 'verb' | 'adverb';

export interface WordEntry {
  word: string;
  pos: PartOfSpeech;
  definition: string;
}
