import { decodeHTML } from 'entities';

/**
 * Feed content is untrusted HTML from arbitrary origins. Nothing from a feed
 * is ever rendered as markup: descriptions and titles are reduced to plain
 * text here, on the server, before they reach any display.
 */

export interface SanitizedHtml {
  text: string;
  /** First usable <img src> in the markup, if any (thumbnail fallback). */
  firstImage: string | null;
}

/** Collapse runs of whitespace (feeds love stray newlines and nbsp). */
export function normalizeWhitespace(s: string): string {
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

export function httpUrl(s: string | null | undefined): string | null {
  if (!s) return null;
  const v = s.trim();
  return /^https?:\/\//i.test(v) ? v : null;
}

const FIRST_IMG_RE = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const BLOCK_TAG_RE = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|blockquote|section|article|figure|figcaption|table)\b[^>]*>/gi;
const TAG_RE = /<[^>]*>/g;
const SCRIPT_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;

/**
 * HTML fragment -> plain text plus the first image URL. Block-level tags
 * become spaces so "Headline</p><p>Body" does not fuse into one word.
 * Entities are decoded after tags are stripped, so a literal `&lt;b&gt;` in
 * the source text stays visible instead of being eaten as markup.
 */
export function htmlToText(html: string): SanitizedHtml {
  if (!html) return { text: '', firstImage: null };
  const img = FIRST_IMG_RE.exec(html);
  const firstImage = httpUrl(decodeHTML(img?.[1] ?? img?.[2] ?? img?.[3] ?? ''));
  const stripped = html
    .replace(COMMENT_RE, ' ')
    .replace(SCRIPT_STYLE_RE, ' ')
    .replace(BLOCK_TAG_RE, ' ')
    .replace(TAG_RE, '');
  return { text: normalizeWhitespace(decodeHTML(stripped)), firstImage };
}

/**
 * Titles are usually entity-encoded text rather than markup, but plenty of
 * feeds double-encode them or wrap them in <b>. Same path as descriptions.
 */
export function cleanText(raw: string): string {
  if (!raw) return '';
  if (!/[<&]/.test(raw)) return normalizeWhitespace(raw);
  return htmlToText(raw).text;
}

/**
 * Drop the decorations feeds bolt onto headlines: leading bracket tags
 * (`[VIDEO]`, `(Photos)`) and a trailing ` - Publisher` / ` | Publisher`
 * that repeats a name we already show as the story source.
 */
export function stripTitleTags(title: string, knownSuffixes: Array<string | undefined>): string {
  let t = title.trim();
  // Leading [TAG] / (TAG) markers, possibly several.
  let guard = 0;
  while (guard++ < 4) {
    const m = /^(?:\[[^\]]{1,24}\]|\([^)]{1,24}\))\s*[:\-–—]?\s*/.exec(t);
    if (!m || m[0].length === 0) break;
    t = t.slice(m[0].length);
  }
  for (const suffix of knownSuffixes) {
    const s = suffix?.trim();
    if (!s) continue;
    const lower = t.toLowerCase();
    for (const sep of [' - ', ' | ', ' – ', ' — ']) {
      const tail = `${sep}${s}`.toLowerCase();
      if (lower.length > tail.length && lower.endsWith(tail)) {
        t = t.slice(0, t.length - tail.length).trim();
        break;
      }
    }
  }
  return t;
}
