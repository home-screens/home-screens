/** Letters that do not come apart into a plain letter and an accent mark. */
const PLAIN_LETTERS: Record<string, string> = { ß: 'ss', æ: 'ae', ø: 'o', œ: 'oe', đ: 'd', ł: 'l' };

/**
 * A name as a lower-case, dash-separated slug: "Kitchen Wall!" reads
 * "kitchen-wall". Used for a display's id suggested from its name and for
 * the file name of an exported layout. An accented letter becomes its plain
 * one ("Küche" reads "kuche", "Køkken" reads "kokken"), never a dash in the
 * middle of the word. Empty when the name holds no letter or digit, which
 * each caller handles itself.
 */
export function dashSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ßæøœđł]/g, (letter) => PLAIN_LETTERS[letter])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
