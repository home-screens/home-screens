/**
 * The letters the wall's own keyboard offers, by the hub's language.
 *
 * A Pi kiosk has no on-screen keyboard, and the wall only ever types a few
 * letters into a search, so it draws its own: letters only, plus space,
 * delete and Done. No shift (Mealie's search and the local library's ignore
 * case) and no numbers. Each language gets the layout its family knows from
 * their own keyboards, with the letters it needs that English does not.
 */

export interface WallKeyboardLayout {
  /** Letter rows, top to bottom. Delete follows the last row. */
  rows: readonly string[];
}

const QWERTY = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const;

const LAYOUTS: Record<string, WallKeyboardLayout> = {
  en: { rows: QWERTY },
  nl: { rows: QWERTY },
  de: { rows: ['qwertzuiopü', 'asdfghjklöä', 'yxcvbnmß'] },
  fr: { rows: ['azertyuiop', 'qsdfghjklm', 'wxcvbnéèçà'] },
  es: { rows: ['qwertyuiop', 'asdfghjklñ', 'zxcvbnm'] },
  pt: { rows: ['qwertyuiop', 'asdfghjklç', 'zxcvbnm'] },
  da: { rows: ['qwertyuiopå', 'asdfghjklæø', 'zxcvbnm'] },
};

/** The layout for a BCP-47 locale ("de-DE"), by its language; English for anything else. */
export function wallKeyboardLayout(locale: string): WallKeyboardLayout {
  const language = locale.toLowerCase().split(/[-_]/)[0];
  return LAYOUTS[language] ?? LAYOUTS.en;
}

/**
 * How many key widths the widest row needs: the longest letter row, or the
 * last row with its delete key (about two keys wide). Every key is this
 * fraction of the keyboard's width, so rows line up like a real keyboard.
 */
export function wallKeyboardColumns(layout: WallKeyboardLayout): number {
  const rows = layout.rows;
  const last = rows[rows.length - 1] ?? '';
  return Math.max(...rows.slice(0, -1).map((r) => [...r].length), [...last].length + 2);
}

/** A key typed onto the words: letters as they are, one space at most between words, nothing before the first. */
export function typeKey(words: string, key: string): string {
  if (key === ' ') return words === '' || words.endsWith(' ') ? words : `${words} `;
  return `${words}${key}`.slice(0, 60);
}

/** Delete: the last letter (a whole letter, never half of one). */
export function deleteKey(words: string): string {
  return [...words].slice(0, -1).join('');
}
