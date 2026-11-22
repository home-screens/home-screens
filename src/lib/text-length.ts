/**
 * Counting typed text the way people count it. JavaScript's `length` counts
 * UTF-16 code units, so an emoji is two and a cap set with it cuts one in
 * half. Everything a family types against a cap (day notes, the wall's
 * keyboard, list items and event titles typed on the wall) counts with these,
 * on the screen and in the rule on the hub alike.
 */

/** One line of plain words: trimmed, every run of spaces and line breaks made one space. */
export function oneLineText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Characters as people count them: an emoji is one, not the two code units JavaScript sees. */
export function textLength(text: string): number {
  return Array.from(text).length;
}

/** `text` cut to `max` characters, counted the way `textLength` counts, never half a character. */
export function clampText(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join('');
}
