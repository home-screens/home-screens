import { XMLParser } from 'fast-xml-parser';
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

/** media:thumbnail -> media:content(image) -> enclosure(image) -> itunes:image -> media:group. */
function mediaImage(node: Node): string | null {
  for (const thumb of list(child(node, 'thumbnail'))) {
    const url = httpUrl(attr(thumb, 'url'));
    if (url) return url;
  }
  for (const content of list(child(node, 'content'))) {
    const type = attr(content, 'type');
    const medium = attr(content, 'medium');
    if (type.startsWith('image/') || medium === 'image') {
      const url = httpUrl(attr(content, 'url'));
      if (url) return url;
    }
  }
  for (const enc of list(child(node, 'enclosure'))) {
    if (attr(enc, 'type').startsWith('image/')) {
      const url = httpUrl(attr(enc, 'url'));
      if (url) return url;
    }
  }
  const itunes = child(node, 'image');
  if (itunes) {
    const url = httpUrl(attr(itunes, 'href') || attr(itunes, 'url') || text(child(itunes, 'url')));
    if (url) return url;
  }
  for (const group of list(child(node, 'group'))) {
    const url = mediaImage(group);
    if (url) return url;
  }
  return null;
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

export function parseFeed(raw: string): ParsedFeed {
  const trimmed = raw.replace(/^﻿/, '').trim();
  if (!trimmed) throw new FeedParseError('Empty response');

  if (trimmed.startsWith('{')) {
    const feed = parseJsonFeed(trimmed);
    return { ...feed, items: feed.items.filter(nonEmpty) };
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

  return { ...feed, items: feed.items.filter(nonEmpty) };
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
