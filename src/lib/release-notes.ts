/**
 * Minimal Markdown parser for GitHub release notes.
 *
 * Release bodies are authored by hand and stick to a small subset — setext-free
 * `##` headings, `-` bullets, long paragraphs, and the occasional link, bold
 * run, or inline code span. Rather than pull a full Markdown dependency in for
 * one settings panel, this turns that subset into a block tree the renderer can
 * walk as React elements (no `dangerouslySetInnerHTML`, so nothing in a release
 * body can inject markup).
 *
 * Anything unrecognised falls through as plain text, which is the right failure
 * mode for a changelog: the words still read, only the styling is lost.
 */

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; value: string }
  | { type: 'em'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; value: string; href: string };

export type ReleaseNoteBlock =
  | { type: 'heading'; level: number; content: InlineNode[] }
  | { type: 'paragraph'; content: InlineNode[] }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] }
  | { type: 'code'; value: string };

// `code` first so backticked text is never re-scanned for emphasis; the bare-URL
// branch is last so an explicit [label](url) wins over the URL inside it.
const INLINE_PATTERN =
  /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|(https?:\/\/[^\s<>()[\]]+)/g;

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*+]\s+(.*)$/;
const ORDERED = /^\d+[.)]\s+(.*)$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;

/** Only http(s) survives — anything else renders as plain text, not a link. */
function safeHref(href: string): string | null {
  return /^https?:\/\//i.test(href) ? href : null;
}

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;
  INLINE_PATTERN.lastIndex = 0;

  for (let m = INLINE_PATTERN.exec(text); m; m = INLINE_PATTERN.exec(text)) {
    const [match, code, linkText, linkHref, strongStar, strongUnderscore, em, bareUrl] = m;
    if (m.index > last) nodes.push({ type: 'text', value: text.slice(last, m.index) });
    last = m.index + match.length;

    if (code !== undefined) {
      nodes.push({ type: 'code', value: code });
    } else if (linkText !== undefined) {
      const href = safeHref(linkHref);
      nodes.push(href ? { type: 'link', value: linkText, href } : { type: 'text', value: linkText });
    } else if (strongStar !== undefined || strongUnderscore !== undefined) {
      nodes.push({ type: 'strong', value: strongStar ?? strongUnderscore });
    } else if (em !== undefined) {
      nodes.push({ type: 'em', value: em });
    } else if (bareUrl !== undefined) {
      nodes.push({ type: 'link', value: bareUrl, href: bareUrl });
    }
  }

  if (last < text.length) nodes.push({ type: 'text', value: text.slice(last) });
  return nodes;
}

export function parseReleaseNotes(markdown: string): ReleaseNoteBlock[] {
  const blocks: ReleaseNoteBlock[] = [];
  const lines = (markdown ?? '').replace(/\r\n?/g, '\n').split('\n');

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', content: parseInline(paragraph.join(' ').trim()) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({
      type: 'list',
      ordered: list.ordered,
      items: list.items.map((item) => parseInline(item.trim())),
    });
    list = null;
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (line.startsWith('```')) {
      flushAll();
      const fenced: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith('```'); i++) fenced.push(lines[i]);
      blocks.push({ type: 'code', value: fenced.join('\n') });
      continue;
    }

    if (line === '') {
      flushAll();
      continue;
    }

    if (RULE.test(line)) {
      flushAll();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushAll();
      blocks.push({
        type: 'heading',
        level: Math.min(heading[1].length, 6),
        content: parseInline(heading[2].trim()),
      });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push((bullet ? bullet[1] : ordered![1]).trim());
      continue;
    }

    // A non-blank line under a list item is that item's continuation; wrapped
    // release notes lean on this constantly.
    if (list && list.items.length > 0 && /^\s/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line}`;
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushAll();
  return blocks;
}
