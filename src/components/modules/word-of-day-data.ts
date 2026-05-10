/**
 * Per-locale "Word of the Day" seed data.
 *
 * The seed list is content (not UI chrome), so it lives alongside the
 * module rather than in the translation dictionaries — keeping
 * `src/translations/*.json` to plain user-facing strings.
 *
 * `getWordsForLocale(tag)` returns the closest-match list, walking the
 * locale fallback chain so e.g. `de-AT` reuses the `de-DE` table.
 * Unconfigured locales fall back to en-US.
 */

import { resolveLocaleChain } from '@/i18n/fallback';

export type PartOfSpeech = 'adjective' | 'noun' | 'verb' | 'adverb';

export interface WordEntry {
  word: string;
  pos: PartOfSpeech;
  definition: string;
}

const EN_US_WORDS: WordEntry[] = [
  { word: 'Ephemeral', pos: 'adjective', definition: 'Lasting for a very short time' },
  { word: 'Serendipity', pos: 'noun', definition: 'The occurrence of events by chance in a happy way' },
  { word: 'Eloquent', pos: 'adjective', definition: 'Fluent or persuasive in speaking or writing' },
  { word: 'Resilient', pos: 'adjective', definition: 'Able to recover quickly from difficulties' },
  { word: 'Ubiquitous', pos: 'adjective', definition: 'Present, appearing, or found everywhere' },
  { word: 'Sanguine', pos: 'adjective', definition: 'Optimistic or positive, especially in a difficult situation' },
  { word: 'Mellifluous', pos: 'adjective', definition: 'Sweet or musical; pleasant to hear' },
  { word: 'Perspicacious', pos: 'adjective', definition: 'Having a ready insight into things; shrewd' },
  { word: 'Ineffable', pos: 'adjective', definition: 'Too great or extreme to be expressed in words' },
  { word: 'Luminous', pos: 'adjective', definition: 'Full of or shedding light; bright or shining' },
  { word: 'Petrichor', pos: 'noun', definition: 'The pleasant smell of earth after rain' },
  { word: 'Quintessential', pos: 'adjective', definition: 'Representing the most perfect example of a quality' },
  { word: 'Ethereal', pos: 'adjective', definition: 'Extremely delicate and light, seeming heavenly' },
  { word: 'Wanderlust', pos: 'noun', definition: 'A strong desire to travel and explore the world' },
  { word: 'Halcyon', pos: 'adjective', definition: 'Denoting a period of time that was idyllically happy and peaceful' },
  { word: 'Sonorous', pos: 'adjective', definition: 'Imposingly deep and full in sound' },
  { word: 'Verdant', pos: 'adjective', definition: 'Green with grass or other rich vegetation' },
  { word: 'Ebullient', pos: 'adjective', definition: 'Cheerful and full of energy' },
  { word: 'Sublime', pos: 'adjective', definition: 'Of outstanding spiritual or intellectual worth' },
  { word: 'Incandescent', pos: 'adjective', definition: 'Emitting light as a result of being heated; passionate' },
  { word: 'Gossamer', pos: 'noun', definition: 'Something very light, thin, and insubstantial' },
  { word: 'Aplomb', pos: 'noun', definition: 'Self-confidence or assurance, especially in a demanding situation' },
  { word: 'Zenith', pos: 'noun', definition: 'The highest point reached; the peak or culmination' },
  { word: 'Euphoria', pos: 'noun', definition: 'A feeling of intense excitement and happiness' },
  { word: 'Cascade', pos: 'noun', definition: 'A small waterfall, or a succession of stages' },
  { word: 'Resplendent', pos: 'adjective', definition: 'Impressive and attractive; brilliant' },
  { word: 'Labyrinthine', pos: 'adjective', definition: 'Like a labyrinth; irregular and twisting' },
  { word: 'Cerulean', pos: 'adjective', definition: 'Deep sky blue in color' },
  { word: 'Transcendent', pos: 'adjective', definition: 'Beyond or above the range of normal experience' },
  { word: 'Iridescent', pos: 'adjective', definition: 'Showing luminous colors that change when seen from different angles' },
];

const DE_DE_WORDS: WordEntry[] = [
  { word: 'Vergänglich', pos: 'adjective', definition: 'Von sehr kurzer Dauer; flüchtig' },
  { word: 'Glücksfall', pos: 'noun', definition: 'Ein unerwartet glückliches Zusammentreffen von Umständen' },
  { word: 'Beredt', pos: 'adjective', definition: 'Sprachgewandt und überzeugend im Reden oder Schreiben' },
  { word: 'Widerstandsfähig', pos: 'adjective', definition: 'In der Lage, sich rasch von Schwierigkeiten zu erholen' },
  { word: 'Allgegenwärtig', pos: 'adjective', definition: 'Überall vorhanden oder anzutreffen' },
  { word: 'Zuversichtlich', pos: 'adjective', definition: 'Optimistisch, besonders in einer schwierigen Lage' },
  { word: 'Wohlklingend', pos: 'adjective', definition: 'Süß oder melodisch; angenehm zu hören' },
  { word: 'Scharfsinnig', pos: 'adjective', definition: 'Mit raschem, sicherem Verständnis ausgestattet' },
  { word: 'Unaussprechlich', pos: 'adjective', definition: 'Zu groß oder intensiv, um in Worte gefasst zu werden' },
  { word: 'Leuchtend', pos: 'adjective', definition: 'Voller Licht; hell strahlend' },
  { word: 'Petrichor', pos: 'noun', definition: 'Der angenehme Geruch der Erde nach einem Regen' },
  { word: 'Quintessenziell', pos: 'adjective', definition: 'Das vollkommenste Beispiel einer Eigenschaft darstellend' },
  { word: 'Ätherisch', pos: 'adjective', definition: 'Außerordentlich zart und leicht; himmlisch wirkend' },
  { word: 'Fernweh', pos: 'noun', definition: 'Die starke Sehnsucht zu reisen und die Welt zu entdecken' },
  { word: 'Friedvoll', pos: 'adjective', definition: 'Eine Zeit bezeichnend, die idyllisch glücklich und ruhig war' },
  { word: 'Klangvoll', pos: 'adjective', definition: 'Eindrucksvoll tief und voll im Klang' },
  { word: 'Grünend', pos: 'adjective', definition: 'Grün durch Gras oder üppige Vegetation' },
  { word: 'Überschwänglich', pos: 'adjective', definition: 'Heiter und voller Energie' },
  { word: 'Erhaben', pos: 'adjective', definition: 'Von herausragendem geistigem oder intellektuellem Wert' },
  { word: 'Glühend', pos: 'adjective', definition: 'Durch Hitze leuchtend; leidenschaftlich' },
  { word: 'Hauchdünn', pos: 'noun', definition: 'Etwas sehr Leichtes, Dünnes und Substanzloses' },
  { word: 'Selbstsicherheit', pos: 'noun', definition: 'Sicheres Auftreten, besonders in einer fordernden Lage' },
  { word: 'Zenit', pos: 'noun', definition: 'Der höchste erreichte Punkt; der Höhepunkt' },
  { word: 'Euphorie', pos: 'noun', definition: 'Ein Gefühl intensiver Begeisterung und Freude' },
  { word: 'Kaskade', pos: 'noun', definition: 'Ein kleiner Wasserfall oder eine Abfolge von Stufen' },
  { word: 'Prachtvoll', pos: 'adjective', definition: 'Eindrucksvoll und anziehend; glanzvoll' },
  { word: 'Labyrinthisch', pos: 'adjective', definition: 'Wie ein Labyrinth; unregelmäßig und verwinkelt' },
  { word: 'Himmelblau', pos: 'adjective', definition: 'Tiefes Blau wie der Himmel' },
  { word: 'Transzendent', pos: 'adjective', definition: 'Jenseits oder oberhalb der gewöhnlichen Erfahrung' },
  { word: 'Schillernd', pos: 'adjective', definition: 'Mit leuchtenden Farben, die je nach Blickwinkel wechseln' },
];

const WORDS_BY_LOCALE: Record<string, WordEntry[]> = {
  'en-US': EN_US_WORDS,
  'de-DE': DE_DE_WORDS,
};

/**
 * Resolve the seed list for `locale`, walking the same fallback chain as
 * the rest of the i18n runtime (so `de-AT` picks up `de-DE`, etc.). Locales
 * with no seed list fall through to en-US.
 */
export function getWordsForLocale(locale: string): WordEntry[] {
  for (const tag of resolveLocaleChain(locale)) {
    const words = WORDS_BY_LOCALE[tag];
    if (words) return words;
  }
  return EN_US_WORDS;
}
