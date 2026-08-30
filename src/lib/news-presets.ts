/**
 * Curated news feeds, grouped by locale and section. Every URL here is
 * checked by `scripts/verify-news-presets.ts` (fetch + parse, at least one
 * story) before a release; a preset that goes dark gets removed, not left to
 * fail silently on displays.
 *
 * Labels are publisher names and stay untranslated; section names are
 * translated in the editor (`configSections.news.category.*`).
 */

export type NewsCategory =
  | 'top' | 'world' | 'business' | 'technology' | 'science' | 'sports' | 'health' | 'entertainment';

export const NEWS_CATEGORIES: NewsCategory[] = [
  'top', 'world', 'business', 'technology', 'science', 'sports', 'health', 'entertainment',
];

export interface NewsPreset {
  id: string;
  /** Publisher name, e.g. "BBC News". */
  publisher: string;
  category: NewsCategory;
  /** BCP-47 locale the feed is written for. */
  locale: string;
  url: string;
}

const preset = (locale: string, publisher: string, category: NewsCategory, id: string, url: string): NewsPreset =>
  ({ id, publisher, category, locale, url });

export const NEWS_PRESETS: NewsPreset[] = [
  // ── en-US ─────────────────────────────────────────────────────────────
  preset('en-US', 'BBC News', 'top', 'bbc-top', 'https://feeds.bbci.co.uk/news/rss.xml'),
  preset('en-US', 'BBC News', 'world', 'bbc-world', 'https://feeds.bbci.co.uk/news/world/rss.xml'),
  preset('en-US', 'BBC News', 'business', 'bbc-business', 'https://feeds.bbci.co.uk/news/business/rss.xml'),
  preset('en-US', 'BBC News', 'technology', 'bbc-technology', 'https://feeds.bbci.co.uk/news/technology/rss.xml'),
  preset('en-US', 'BBC News', 'science', 'bbc-science', 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml'),
  preset('en-US', 'BBC News', 'health', 'bbc-health', 'https://feeds.bbci.co.uk/news/health/rss.xml'),
  preset('en-US', 'BBC News', 'entertainment', 'bbc-entertainment', 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'),
  preset('en-US', 'BBC Sport', 'sports', 'bbc-sport', 'https://feeds.bbci.co.uk/sport/rss.xml'),
  preset('en-US', 'NPR', 'top', 'npr-top', 'https://feeds.npr.org/1001/rss.xml'),
  preset('en-US', 'NPR', 'world', 'npr-world', 'https://feeds.npr.org/1004/rss.xml'),
  preset('en-US', 'NPR', 'business', 'npr-business', 'https://feeds.npr.org/1006/rss.xml'),
  preset('en-US', 'NPR', 'technology', 'npr-technology', 'https://feeds.npr.org/1019/rss.xml'),
  preset('en-US', 'NPR', 'science', 'npr-science', 'https://feeds.npr.org/1007/rss.xml'),
  preset('en-US', 'NPR', 'health', 'npr-health', 'https://feeds.npr.org/1128/rss.xml'),
  preset('en-US', 'ABC News', 'top', 'abc-top', 'https://feeds.abcnews.com/abcnews/topstories'),
  preset('en-US', 'ABC News', 'world', 'abc-world', 'https://feeds.abcnews.com/abcnews/internationalheadlines'),
  preset('en-US', 'ABC News', 'technology', 'abc-technology', 'https://feeds.abcnews.com/abcnews/technologyheadlines'),
  preset('en-US', 'ABC News', 'sports', 'abc-sports', 'https://feeds.abcnews.com/abcnews/sportsheadlines'),
  preset('en-US', 'CBS News', 'top', 'cbs-top', 'https://www.cbsnews.com/latest/rss/main'),
  preset('en-US', 'CBS News', 'world', 'cbs-world', 'https://www.cbsnews.com/latest/rss/world'),
  preset('en-US', 'CBS News', 'technology', 'cbs-technology', 'https://www.cbsnews.com/latest/rss/technology'),
  preset('en-US', 'CBS News', 'science', 'cbs-science', 'https://www.cbsnews.com/latest/rss/science'),
  preset('en-US', 'CBS News', 'health', 'cbs-health', 'https://www.cbsnews.com/latest/rss/health'),
  preset('en-US', 'CBS News', 'entertainment', 'cbs-entertainment', 'https://www.cbsnews.com/latest/rss/entertainment'),
  preset('en-US', 'The New York Times', 'top', 'nyt-top', 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml'),
  preset('en-US', 'The New York Times', 'world', 'nyt-world', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'),
  preset('en-US', 'The New York Times', 'business', 'nyt-business', 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml'),
  preset('en-US', 'The New York Times', 'technology', 'nyt-technology', 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml'),
  preset('en-US', 'The New York Times', 'science', 'nyt-science', 'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml'),
  preset('en-US', 'The New York Times', 'health', 'nyt-health', 'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml'),
  preset('en-US', 'The Guardian', 'top', 'guardian-us', 'https://www.theguardian.com/us-news/rss'),
  preset('en-US', 'The Guardian', 'world', 'guardian-world', 'https://www.theguardian.com/world/rss'),
  preset('en-US', 'The Guardian', 'science', 'guardian-science', 'https://www.theguardian.com/science/rss'),
  preset('en-US', 'The Guardian', 'sports', 'guardian-sport', 'https://www.theguardian.com/sport/rss'),
  preset('en-US', 'Associated Press', 'top', 'ap-top', 'https://news.google.com/rss/search?q=source:%22Associated%20Press%22&hl=en-US&gl=US&ceid=US:en'),
  preset('en-US', 'Reuters', 'top', 'reuters-top', 'https://news.google.com/rss/search?q=source:reuters&hl=en-US&gl=US&ceid=US:en'),
  preset('en-US', 'Google News', 'top', 'google-top', 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en'),
  preset('en-US', 'ESPN', 'sports', 'espn-top', 'https://www.espn.com/espn/rss/news'),
  preset('en-US', 'Ars Technica', 'technology', 'ars-technica', 'https://feeds.arstechnica.com/arstechnica/index'),
  preset('en-US', 'The Verge', 'technology', 'the-verge', 'https://www.theverge.com/rss/index.xml'),
  preset('en-US', 'Wired', 'technology', 'wired', 'https://www.wired.com/feed/rss'),
  preset('en-US', 'MarketWatch', 'business', 'marketwatch', 'https://feeds.content.dowjones.io/public/rss/mw_topstories'),
  preset('en-US', 'CNBC', 'business', 'cnbc-top', 'https://www.cnbc.com/id/100003114/device/rss/rss.html'),
  preset('en-US', 'Science Daily', 'science', 'science-daily', 'https://www.sciencedaily.com/rss/all.xml'),
  preset('en-US', 'Variety', 'entertainment', 'variety', 'https://variety.com/feed/'),

  // ── de-DE ─────────────────────────────────────────────────────────────
  preset('de-DE', 'tagesschau', 'top', 'tagesschau-top', 'https://www.tagesschau.de/index~rss2.xml'),
  preset('de-DE', 'tagesschau', 'world', 'tagesschau-ausland', 'https://www.tagesschau.de/ausland/index~rss2.xml'),
  preset('de-DE', 'tagesschau', 'business', 'tagesschau-wirtschaft', 'https://www.tagesschau.de/wirtschaft/index~rss2.xml'),
  preset('de-DE', 'DER SPIEGEL', 'top', 'spiegel-top', 'https://www.spiegel.de/schlagzeilen/index.rss'),
  preset('de-DE', 'DER SPIEGEL', 'world', 'spiegel-ausland', 'https://www.spiegel.de/ausland/index.rss'),
  preset('de-DE', 'DER SPIEGEL', 'science', 'spiegel-wissenschaft', 'https://www.spiegel.de/wissenschaft/index.rss'),
  preset('de-DE', 'DER SPIEGEL', 'sports', 'spiegel-sport', 'https://www.spiegel.de/sport/index.rss'),
  preset('de-DE', 'ZEIT ONLINE', 'top', 'zeit-top', 'https://newsfeed.zeit.de/index'),
  preset('de-DE', 'FAZ', 'top', 'faz-top', 'https://www.faz.net/rss/aktuell/'),
  preset('de-DE', 'heise online', 'technology', 'heise', 'https://www.heise.de/rss/heise-atom.xml'),
  preset('de-DE', 'Sportschau', 'sports', 'sportschau', 'https://www.sportschau.de/index~rss2.xml'),

  // ── fr-FR ─────────────────────────────────────────────────────────────
  preset('fr-FR', 'Le Monde', 'top', 'lemonde-top', 'https://www.lemonde.fr/rss/une.xml'),
  preset('fr-FR', 'Le Monde', 'world', 'lemonde-international', 'https://www.lemonde.fr/international/rss_full.xml'),
  preset('fr-FR', 'Le Monde', 'business', 'lemonde-economie', 'https://www.lemonde.fr/economie/rss_full.xml'),
  preset('fr-FR', 'Le Monde', 'science', 'lemonde-sciences', 'https://www.lemonde.fr/sciences/rss_full.xml'),
  preset('fr-FR', 'Le Monde', 'sports', 'lemonde-sport', 'https://www.lemonde.fr/sport/rss_full.xml'),
  preset('fr-FR', 'France 24', 'top', 'france24-top', 'https://www.france24.com/fr/rss'),
  preset('fr-FR', 'franceinfo', 'top', 'franceinfo-top', 'https://www.francetvinfo.fr/titres.rss'),
  preset('fr-FR', '20 Minutes', 'top', '20minutes-top', 'https://www.20minutes.fr/feeds/rss-une.xml'),
  preset('fr-FR', "L'Équipe", 'sports', 'lequipe', 'https://dwh.lequipe.fr/api/edito/rss?path=/'),

  // ── es-ES ─────────────────────────────────────────────────────────────
  preset('es-ES', 'El País', 'top', 'elpais-top', 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada'),
  preset('es-ES', 'El País', 'world', 'elpais-internacional', 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada'),
  preset('es-ES', 'El Mundo', 'top', 'elmundo-top', 'https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml'),
  preset('es-ES', 'ABC', 'top', 'abc-es-top', 'https://www.abc.es/rss/2.0/portada/'),
  preset('es-ES', 'RTVE', 'top', 'rtve-top', 'https://api2.rtve.es/rss/temas_noticias.xml'),
  preset('es-ES', 'Marca', 'sports', 'marca', 'https://e00-marca.uecdn.es/rss/portada.xml'),
  preset('es-ES', 'Xataka', 'technology', 'xataka', 'https://www.xataka.com/feedburner.xml'),

  // ── nl-NL ─────────────────────────────────────────────────────────────
  preset('nl-NL', 'NOS', 'top', 'nos-top', 'https://feeds.nos.nl/nosnieuwsalgemeen'),
  preset('nl-NL', 'NOS', 'world', 'nos-buitenland', 'https://feeds.nos.nl/nosnieuwsbuitenland'),
  preset('nl-NL', 'NOS', 'business', 'nos-economie', 'https://feeds.nos.nl/nosnieuwseconomie'),
  preset('nl-NL', 'NOS', 'technology', 'nos-tech', 'https://feeds.nos.nl/nosnieuwstech'),
  preset('nl-NL', 'NOS', 'sports', 'nos-sport', 'https://feeds.nos.nl/nossportalgemeen'),
  preset('nl-NL', 'NU.nl', 'top', 'nu-top', 'https://www.nu.nl/rss/Algemeen'),
  preset('nl-NL', 'NU.nl', 'business', 'nu-economie', 'https://www.nu.nl/rss/Economie'),
  preset('nl-NL', 'NU.nl', 'sports', 'nu-sport', 'https://www.nu.nl/rss/Sport'),
  preset('nl-NL', 'Tweakers', 'technology', 'tweakers', 'https://feeds.feedburner.com/tweakers/mixed'),

  // ── pt-BR ─────────────────────────────────────────────────────────────
  preset('pt-BR', 'g1', 'top', 'g1-top', 'https://g1.globo.com/rss/g1/'),
  preset('pt-BR', 'g1', 'world', 'g1-mundo', 'https://g1.globo.com/rss/g1/mundo/'),
  preset('pt-BR', 'g1', 'business', 'g1-economia', 'https://g1.globo.com/rss/g1/economia/'),
  preset('pt-BR', 'g1', 'technology', 'g1-tecnologia', 'https://g1.globo.com/rss/g1/tecnologia/'),
  preset('pt-BR', 'g1', 'science', 'g1-ciencia', 'https://g1.globo.com/rss/g1/ciencia-e-saude/'),
  preset('pt-BR', 'ge', 'sports', 'ge-top', 'https://ge.globo.com/rss/ge/'),
  preset('pt-BR', 'Folha de S.Paulo', 'top', 'folha-top', 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml'),
  preset('pt-BR', 'UOL', 'top', 'uol-top', 'https://rss.uol.com.br/feed/noticias.xml'),
  preset('pt-BR', 'BBC News Brasil', 'top', 'bbc-brasil', 'https://feeds.bbci.co.uk/portuguese/rss.xml'),
  preset('pt-BR', 'Olhar Digital', 'technology', 'olhar-digital', 'https://olhardigital.com.br/feed/'),

  // ── da-DK ─────────────────────────────────────────────────────────────
  preset('da-DK', 'DR', 'top', 'dr-top', 'https://www.dr.dk/nyheder/service/feeds/allenyheder'),
  preset('da-DK', 'DR', 'world', 'dr-udland', 'https://www.dr.dk/nyheder/service/feeds/udland'),
  preset('da-DK', 'DR', 'business', 'dr-penge', 'https://www.dr.dk/nyheder/service/feeds/penge'),
  preset('da-DK', 'DR', 'science', 'dr-viden', 'https://www.dr.dk/nyheder/service/feeds/viden'),
  preset('da-DK', 'DR', 'sports', 'dr-sport', 'https://www.dr.dk/nyheder/service/feeds/sporten'),
  preset('da-DK', 'Politiken', 'top', 'politiken-top', 'https://politiken.dk/rss/senestenyt.rss'),
  preset('da-DK', 'Ingeniøren', 'technology', 'ingenioren', 'https://ing.dk/rss/nyheder'),
];

/** The preset a fresh module starts with for a locale (its language's first "top" feed, else BBC). */
export function defaultPresetForLocale(locale: string | undefined): NewsPreset {
  const lang = (locale ?? 'en-US').split(/[-_]/)[0]?.toLowerCase();
  return NEWS_PRESETS.find((p) => p.category === 'top' && p.locale.toLowerCase().startsWith(`${lang}-`))
    ?? NEWS_PRESETS[0];
}

export function findPresetByUrl(url: string): NewsPreset | undefined {
  return NEWS_PRESETS.find((p) => p.url === url);
}

/** Presets for a locale, falling back to en-US when the locale has none. */
export function presetsForLocale(locale: string | undefined): NewsPreset[] {
  const lang = (locale ?? 'en-US').split(/[-_]/)[0]?.toLowerCase();
  const own = NEWS_PRESETS.filter((p) => p.locale.toLowerCase().startsWith(`${lang}-`));
  return own.length > 0 ? own : NEWS_PRESETS.filter((p) => p.locale === 'en-US');
}
