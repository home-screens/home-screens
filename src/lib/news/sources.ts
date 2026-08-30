/**
 * Virtual news sources. A `NewsFeedSource.url` is either a real feed URL or
 * one of these shorthands, resolved on the server (`/api/news`) so displays
 * and the editor never need to know how a Google News query is spelled:
 *
 *   local                 stories near the household location
 *   topic:<keywords>      a keyword search feed
 *   youtube:<channelId>   a YouTube channel's uploads (Atom)
 *   reddit:<subreddit>    a subreddit's newest posts (Atom)
 *
 * Pure functions, shared by the server route and the editor.
 */

export const LOCAL_SOURCE = 'local';

export type NewsSourceKind = 'feed' | 'local' | 'topic' | 'youtube' | 'reddit';

export interface ResolvedSource {
  kind: NewsSourceKind;
  /** The real URL to fetch, or null when it cannot be built. */
  url: string | null;
  /** For `topic:` the keywords; for `youtube:` / `reddit:` the id. */
  argument?: string;
}

export function sourceKind(url: string): NewsSourceKind {
  const v = url.trim();
  if (v === LOCAL_SOURCE) return 'local';
  if (/^topic:/i.test(v)) return 'topic';
  if (/^youtube:/i.test(v)) return 'youtube';
  if (/^reddit:/i.test(v)) return 'reddit';
  return 'feed';
}

export function isVirtualSource(url: string): boolean {
  return sourceKind(url) !== 'feed';
}

/** Google News wants a language, a country, and a combined edition key. */
export function googleNewsEdition(locale: string | undefined): { hl: string; gl: string; ceid: string } {
  const tag = (locale ?? 'en-US').trim();
  const lang = tag.split(/[-_]/)[0]?.toLowerCase() ?? 'en';
  switch (lang) {
    case 'de': return { hl: 'de', gl: 'DE', ceid: 'DE:de' };
    case 'fr': return { hl: 'fr', gl: 'FR', ceid: 'FR:fr' };
    case 'es': return { hl: 'es', gl: 'ES', ceid: 'ES:es' };
    case 'nl': return { hl: 'nl', gl: 'NL', ceid: 'NL:nl' };
    case 'pt': return { hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' };
    case 'da': return { hl: 'da', gl: 'DK', ceid: 'DK:da' };
    default: return { hl: 'en-US', gl: 'US', ceid: 'US:en' };
  }
}

export function googleNewsSearchUrl(query: string, locale: string | undefined): string {
  const { hl, gl, ceid } = googleNewsEdition(locale);
  const q = encodeURIComponent(query.trim());
  return `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
}

export function youtubeChannelFeedUrl(channelId: string): string | null {
  const id = channelId.trim();
  if (!/^UC[\w-]{20,24}$/.test(id)) return null;
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;
}

export function subredditFeedUrl(subreddit: string): string | null {
  const name = subreddit.trim().replace(/^\/?r\//i, '').replace(/\/+$/, '');
  if (!/^[A-Za-z0-9_]{2,21}$/.test(name)) return null;
  return `https://www.reddit.com/r/${name}/new/.rss`;
}

/**
 * Pull a YouTube channel id out of whatever the user pasted: a bare id, a
 * `/channel/UC...` URL, or a feed URL that already carries `channel_id=`.
 * Handles (`@name`) cannot be resolved without scraping and return null.
 */
export function extractYoutubeChannelId(input: string): string | null {
  const v = input.trim();
  if (/^UC[\w-]{20,24}$/.test(v)) return v;
  const m = /(?:channel\/|channel_id=)(UC[\w-]{20,24})/.exec(v);
  return m?.[1] ?? null;
}

export interface ResolveContext {
  locale?: string;
  locationName?: string;
}

export function resolveSource(url: string, ctx: ResolveContext): ResolvedSource {
  const v = url.trim();
  switch (sourceKind(v)) {
    case 'local': {
      const place = ctx.locationName?.trim();
      return { kind: 'local', url: place ? googleNewsSearchUrl(place, ctx.locale) : null, argument: place };
    }
    case 'topic': {
      const words = v.replace(/^topic:/i, '').trim();
      return { kind: 'topic', url: words ? googleNewsSearchUrl(words, ctx.locale) : null, argument: words };
    }
    case 'youtube': {
      const id = v.replace(/^youtube:/i, '').trim();
      return { kind: 'youtube', url: youtubeChannelFeedUrl(id), argument: id };
    }
    case 'reddit': {
      const sub = v.replace(/^reddit:/i, '').trim();
      return { kind: 'reddit', url: subredditFeedUrl(sub), argument: sub };
    }
    default:
      return { kind: 'feed', url: v || null };
  }
}
