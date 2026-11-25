// Which of a painting's names the collection keeps as its title. Used by scripts/build-art-collection.mts.

/** What Wikidata says a painting is called, each keyed by language code ("fr", "en-gb", "mul"). */
export interface TitleSources {
  /** The painting's labels. */
  labels: Record<string, string>;
  /** The painting's own title statements (Wikidata's "title", P1476), which say which language it was named in. */
  ownTitles: Record<string, string>;
  /** The artist's languages, their first language first. */
  artistLanguages: string[];
}

/** The entry for `language`, or for a regional form of it ("en-gb" for "en") when there is no plain one. */
function inLanguage(names: Record<string, string>, language: string): string | undefined {
  if (names[language]) return names[language];
  const regional = Object.keys(names).filter((code) => code.startsWith(`${language}-`)).sort()[0];
  return regional ? names[regional] : undefined;
}

/**
 * The title a painting goes by, as it is written, never translated: English or "same in every language" (`mul`)
 * first, then the language the painting was named in, then the artist's language, then any label at all. In each
 * language a label comes before a title statement, as labels are the names Wikidata shows.
 *
 * Among the other labels a two-letter language comes first: the three-letter codes are mostly small or made-up
 * languages, and a bot has given thousands of paintings a Kotava label that reads "... (trutca ke <artist>)".
 */
export function paintingTitle({ labels, ownTitles, artistLanguages }: TitleSources): string | undefined {
  const own = Object.keys(ownTitles).sort();
  for (const language of ['en', 'mul', ...own, ...artistLanguages]) {
    const title = inLanguage(labels, language) ?? inLanguage(ownTitles, language);
    if (title) return title;
  }
  const minor = (code: string) => Number(code.split('-')[0].length > 2);
  const rest = Object.keys(labels).sort((a, b) => minor(a) - minor(b) || a.localeCompare(b));
  return rest.length > 0 ? labels[rest[0]] : undefined;
}
