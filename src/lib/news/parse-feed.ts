import { XMLParser } from 'fast-xml-parser';
import { TARGET_IMAGE_WIDTH, upscaleImageUrl } from './image-upscale';
import { cleanText, htmlToText, httpUrl, normalizeWhitespace, stripTitleTags } from './sanitize';
import type { NewsItem, ParsedFeed } from './types';

/**
 * Parse an RSS 2.0, RSS 1.0 (RDF), Atom 1.0, or JSON Feed document into one
 * normalized `ParsedFeed`. Throws `FeedParseError` when the document is not a
 * feed at all; the route turns that into a per-feed `not-a-feed` result so one
 * broken source never blanks the module.
 *
 * Namespace prefixes are stripped before matching (`content:encoded` ->
 * `encoded`, `media:thumbnail` -> `thumbnail`, `dc:date` -> `date`) because
 * real feeds mix prefixes freely.
 */

export class FeedParseError extends Error {}

/** Elements that may legally repeat; always surfaced as arrays. */
const REPEATED = new Set(['item', 'entry', 'link', 'content', 'thumbnail', 'enclosure', 'category', 'group', 'author']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  processEntities: true,
  htmlEntities: false,
  isArray: (name) => REPEATED.has(name),
});

type Node = string | number | boolean | null | undefined | NodeObject | Node[];
interface NodeObject { [key: string]: Node }

/** Text content of a node, tolerant of every shape fast-xml-parser emits. */
function text(node: Node): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return text(node[0]);
  const t = node['#text'];
  return typeof t === 'string' ? t : typeof t === 'number' ? String(t) : '';
}

function attr(node: Node, name: string): string {
  if (node == null || typeof node !== 'object' || Array.isArray(node)) return '';
  const v = node[`@_${name}`];
  return typeof v === 'string' ? v : '';
}

function list(node: Node): Node[] {
  if (node == null) return [];
  return Array.isArray(node) ? node : [node];
}

function child(obj: Node, ...names: string[]): Node {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  for (const n of names) {
    const v = obj[n];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function parseDate(s: string): number | null {
  const v = s.trim();
  if (!v) return null;
  let t = new Date(v).getTime(); // RFC 822 and ISO 8601 both parse natively
  if (Number.isNaN(t)) {
    // "Mon, 07 Jul 2026 09:00:00 UT" and similar zone spellings
    t = new Date(v.replace(/\s(UT|Z)$/i, ' UTC')).getTime();
  }
  return Number.isNaN(t) ? null : t;
}

function categories(node: Node): string[] | undefined {
  const out: string[] = [];
  for (const c of list(node)) {
    const v = cleanText(text(c) || attr(c, 'term') || attr(c, 'label'));
    if (v) out.push(v);
  }
  return out.length > 0 ? out.slice(0, 8) : undefined;
}

interface ImageCandidate {
  url: string;
  /** Declared `width` attribute, when the feed states one. */
  width: number | null;
  /** `media:thumbnail` is by definition the small copy; the rest are full-size. */
  isThumbnail: boolean;
}

/** An image file extension, ignoring any query string (`/x.jpg?w=644`). */
function looksLikeImageUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|avif|bmp)(\?|#|$)/i.test(url);
}

function declaredWidth(node: Node): number | null {
  const n = Number.parseInt(attr(node, 'width'), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Every image a feed item offers: media:thumbnail, media:content, enclosure, itunes:image, media:group. */
function imageCandidates(node: Node): ImageCandidate[] {
  const out: ImageCandidate[] = [];
  const add = (url: string | null, width: number | null, isThumbnail: boolean) => {
    if (url) out.push({ url, width, isThumbnail });
  };

  for (const thumb of list(child(node, 'thumbnail'))) {
    add(httpUrl(attr(thumb, 'url')), declaredWidth(thumb), true);
  }
  for (const content of list(child(node, 'content'))) {
    const type = attr(content, 'type');
    const medium = attr(content, 'medium');
    // `type` and `medium` are both optional in Media RSS: Le Monde ships
    // `<media:content width height url>` and nothing else. Fall back to the
    // file extension so those are not dropped, while a video — which does
    // declare its type or medium — still is.
    const untyped = type === '' && medium === '' && looksLikeImageUrl(attr(content, 'url'));
    // An empty `<media:content/>` carries no url and simply drops out here.
    if (type.startsWith('image/') || medium === 'image' || untyped) {
      add(httpUrl(attr(content, 'url')), declaredWidth(content), false);
    }
  }
  for (const enc of list(child(node, 'enclosure'))) {
    if (attr(enc, 'type').startsWith('image/')) {
      add(httpUrl(attr(enc, 'url')), declaredWidth(enc), false);
    }
  }
  const itunes = child(node, 'image');
  if (itunes) {
    add(httpUrl(attr(itunes, 'href') || attr(itunes, 'url') || text(child(itunes, 'url'))), null, false);
  }
  for (const group of list(child(node, 'group'))) {
    out.push(...imageCandidates(group));
  }
  return out;
}

/**
 * The best picture a feed item offers, not merely the first one listed.
 *
 * Feeds routinely advertise several sizes and the small one comes first:
 * ABC News lists seven thumbnails from 144px to 1600px, El Mundo pairs a
 * 150px thumbnail with a 3072px `media:content`. Taking whatever came first
 * meant a 1080-wide hero rendering a 150px image.
 *
 * Candidates fall into four tiers, best first:
 *   1. declares a width that clears the target  -> the smallest such
 *   2. full-size tag with no declared width      -> the first
 *   3. declares a width below the target         -> the largest such
 *   4. a thumbnail with no declared width        -> the first
 *
 * A missing width does not disqualify a candidate: most feeds state no size
 * at all, and a `media:content` without one is still the full-size copy. A
 * thumbnail is only taken when nothing better is on offer.
 */
function bestImage(candidates: ImageCandidate[]): string | null {
  const clearsTarget = candidates.filter((c) => c.width !== null && c.width >= TARGET_IMAGE_WIDTH);
  if (clearsTarget.length > 0) {
    return clearsTarget.reduce((best, c) => (c.width! < best.width! ? c : best)).url;
  }

  const unsizedFullSize = candidates.find((c) => c.width === null && !c.isThumbnail);
  if (unsizedFullSize) return unsizedFullSize.url;

  const sized = candidates.filter((c) => c.width !== null);
  if (sized.length > 0) {
    return sized.reduce((best, c) => (c.width! > best.width! ? c : best)).url;
  }

  return candidates[0]?.url ?? null;
}

function mediaImage(node: Node): string | null {
  return bestImage(imageCandidates(node));
}

// ─── RSS 2.0 + RSS 1.0 (RDF) ────────────────────────────────────────────────

function rssItem(item: Node, feedTitle: string): NewsItem {
  // Google News aggregator feeds carry the real publisher per story.
  const publisher = cleanText(text(child(item, 'source'))) || undefined;
  const rawTitle = cleanText(text(child(item, 'title')));
  const title = stripTitleTags(rawTitle, [publisher, feedTitle]);
  // <link> can be plain text, or an atom:link object with href, or several.
  let link: string | null = null;
  for (const l of list(child(item, 'link'))) {
    link = httpUrl(text(l)) ?? httpUrl(attr(l, 'href'));
    if (link) break;
  }
  const guid = text(child(item, 'guid'));
  const rawBody = text(child(item, 'description')) || text(child(item, 'encoded')) || text(child(item, 'summary'));
  const body = htmlToText(rawBody);
  return {
    id: guid || link || title,
    title,
    link,
    description: body.text,
    timestamp: parseDate(text(child(item, 'pubDate', 'pubdate', 'date', 'published', 'updated'))),
    imageUrl: mediaImage(item) ?? body.firstImage,
    publisher,
    categories: categories(child(item, 'category')),
  };
}

function parseRss(rss: Node, format: 'rss' | 'rdf'): ParsedFeed {
  const channel = child(rss, 'channel');
  const title = cleanText(text(child(channel, 'title')));
  // RSS 2.0 nests <item> in <channel>; RDF puts them next to it.
  const items = [...list(child(channel, 'item')), ...list(child(rss, 'item'))]
    .map((item) => rssItem(item, title));
  return { title, format, items };
}

// ─── Atom 1.0 ───────────────────────────────────────────────────────────────

function atomLink(entry: Node): string | null {
  const links = list(child(entry, 'link'));
  const alternate = links.find((l) => {
    const rel = attr(l, 'rel');
    return rel === '' || rel === 'alternate';
  });
  return httpUrl(attr(alternate ?? links[0], 'href')) ?? httpUrl(text(alternate ?? links[0]));
}

function atomImage(entry: Node): string | null {
  const media = mediaImage(entry);
  if (media) return media;
  for (const l of list(child(entry, 'link'))) {
    if (attr(l, 'rel') === 'enclosure' && attr(l, 'type').startsWith('image/')) {
      const url = httpUrl(attr(l, 'href'));
      if (url) return url;
    }
  }
  return null;
}

function parseAtom(feed: Node): ParsedFeed {
  const title = cleanText(text(child(feed, 'title')));
  const items = list(child(feed, 'entry')).map((entry): NewsItem => {
    const rawTitle = cleanText(text(child(entry, 'title')));
    const link = atomLink(entry);
    const id = text(child(entry, 'id')) || link || rawTitle;
    const body = htmlToText(text(child(entry, 'summary')) || text(child(entry, 'content')));
    return {
      id,
      title: stripTitleTags(rawTitle, [title]),
      link,
      description: body.text,
      timestamp: parseDate(text(child(entry, 'published', 'updated', 'date'))),
      imageUrl: atomImage(entry) ?? body.firstImage,
      categories: categories(child(entry, 'category')),
    };
  });
  return { title, format: 'atom', items };
}

// ─── JSON Feed 1.x ──────────────────────────────────────────────────────────

interface JsonFeedItem {
  id?: string | number;
  url?: string;
  external_url?: string;
  title?: string;
  content_text?: string;
  content_html?: string;
  summary?: string;
  image?: string;
  banner_image?: string;
  date_published?: string;
  date_modified?: string;
  tags?: string[];
}

function parseJsonFeed(raw: string): ParsedFeed {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FeedParseError('Invalid JSON');
  }
  const feed = parsed as { version?: string; title?: string; items?: JsonFeedItem[] };
  if (typeof feed.version !== 'string' || !feed.version.includes('jsonfeed.org')) {
    throw new FeedParseError('Not a JSON Feed document');
  }
  const title = cleanText(feed.title ?? '');
  const items = (Array.isArray(feed.items) ? feed.items : []).map((item): NewsItem => {
    const link = httpUrl(item.url) ?? httpUrl(item.external_url);
    // Only content_html is markup; title / summary / content_text are plain
    // text by spec, so they must not go through the HTML stripper.
    const html = item.content_html ? htmlToText(item.content_html) : null;
    const description = normalizeWhitespace(item.summary || item.content_text || '') || html?.text || '';
    const rawTitle = normalizeWhitespace(item.title ?? '') || description.slice(0, 120);
    const id = item.id === undefined || item.id === null ? '' : String(item.id);
    return {
      id: id || link || rawTitle,
      title: stripTitleTags(rawTitle, [title]),
      link,
      description,
      timestamp: parseDate(item.date_published ?? item.date_modified ?? ''),
      imageUrl: httpUrl(item.image) ?? httpUrl(item.banner_image) ?? html?.firstImage ?? null,
      categories: Array.isArray(item.tags) && item.tags.length > 0
        ? item.tags.filter((t): t is string => typeof t === 'string').slice(0, 8)
        : undefined,
    };
  });
  return { title, format: 'json', items };
}

// ─── Entry point ────────────────────────────────────────────────────────────

/** Items with neither a title nor a body have nothing to show. */
function nonEmpty(item: NewsItem): boolean {
  return item.title.length > 0 || item.description.length > 0;
}

/**
 * Ask the publisher's CDN for a bigger copy where we know how, keeping the
 * advertised URL as the fallback. Applied once here so every feed format and
 * every consumer (route cache included) sees the same pair.
 */
function withUpscaledImage(item: NewsItem): NewsItem {
  const bigger = upscaleImageUrl(item.imageUrl);
  return bigger ? { ...item, imageUrl: bigger, imageUrlOriginal: item.imageUrl } : item;
}

export function parseFeed(raw: string): ParsedFeed {
  const trimmed = raw.replace(/^﻿/, '').trim();
  if (!trimmed) throw new FeedParseError('Empty response');

  if (trimmed.startsWith('{')) {
    const feed = parseJsonFeed(trimmed);
    return { ...feed, items: feed.items.filter(nonEmpty).map(withUpscaledImage) };
  }

  let doc: NodeObject;
  try {
    doc = parser.parse(trimmed) as NodeObject;
  } catch {
    throw new FeedParseError('Invalid XML');
  }
  if (!doc || typeof doc !== 'object') throw new FeedParseError('Invalid XML');

  let feed: ParsedFeed;
  if (doc.rss !== undefined) feed = parseRss(doc.rss, 'rss');
  else if (doc.RDF !== undefined) feed = parseRss(doc.RDF, 'rdf');
  else if (doc.feed !== undefined) feed = parseAtom(doc.feed);
  else if (doc.channel !== undefined) feed = parseRss(doc, 'rss'); // bare <channel> root
  else throw new FeedParseError(`Unrecognized feed format <${Object.keys(doc)[0] ?? '?'}>`);

  return { ...feed, items: feed.items.filter(nonEmpty).map(withUpscaledImage) };
}

/**
 * Decode a fetched feed body honouring its declared charset: the HTTP
 * Content-Type first, then the XML prolog, then UTF-8. Latin-1 feeds are
 * still common in Europe and would otherwise render accented letters as
 * replacement characters.
 */
export function decodeFeedBody(bytes: ArrayBuffer, contentType: string | null): string {
  const headerCharset = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType ?? '')?.[1];
  const prologCharset = (() => {
    const head = new TextDecoder('latin1').decode(bytes.slice(0, 200));
    return /<\?xml[^>]*encoding\s*=\s*["']([\w-]+)["']/i.exec(head)?.[1];
  })();
  for (const charset of [headerCharset, prologCharset]) {
    if (!charset || /^utf-?8$/i.test(charset)) continue;
    try {
      return new TextDecoder(charset, { fatal: false }).decode(bytes);
    } catch {
      // Unknown label: fall through to UTF-8.
    }
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}
