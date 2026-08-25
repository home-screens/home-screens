const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

// Max Unicode code point — `String.fromCodePoint` throws RangeError above this.
const MAX_CODE_POINT = 0x10ffff;

function decodeNumericEntity(literal: string, code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > MAX_CODE_POINT) return literal;
  return String.fromCodePoint(code);
}

/**
 * Normalize an event description from an ICS or Google Calendar feed for display.
 *
 * ICS DESCRIPTION fields are nominally plain text but commonly contain inline
 * HTML (`<p>…</p>`, `<br>`, entity references). This converts block-level breaks
 * to real newlines, strips remaining tags, decodes common entities, and trims —
 * so callers can render with `whitespace-pre-line` and let CSS handle wrapping.
 *
 * Output is **plain text only**. Never feed it to `dangerouslySetInnerHTML` or a
 * Markdown renderer: tag-stripping happens before entity decoding, so
 * `&lt;script&gt;` would become a real `<script>` tag in HTML context.
 */
export function sanitizeEventDescription(raw?: string | null): string {
  if (!raw) return '';
  let out = raw
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6])>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (_, ref: string) => {
      if (ref.startsWith('#x') || ref.startsWith('#X')) {
        return decodeNumericEntity(_, parseInt(ref.slice(2), 16));
      }
      if (ref.startsWith('#')) {
        return decodeNumericEntity(_, parseInt(ref.slice(1), 10));
      }
      return ENTITY_MAP[ref.toLowerCase()] ?? _;
    });
  // Collapse runs of inline whitespace per line, then collapse 3+ blank lines to 2.
  out = out
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out;
}
