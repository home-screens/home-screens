/**
 * The keys and typing rules of the wall's own keyboard. A Pi kiosk has no
 * on-screen keyboard of its own, so the wall draws one (`WallKeyboard`).
 *
 * Two kinds:
 * - `search`: letters, space, delete and the action key. No Shift and no
 *   numbers, since the recipe search ignores case and only ever looks for a
 *   few letters.
 * - `text`: what a family types as words someone will read (a list item, an
 *   event title). Shift, which lights up by itself at the start and after the
 *   end of a sentence, and a second page of digits and the few marks such a
 *   line needs.
 *
 * Each language gets the letter layout its family knows from their own
 * keyboards, with the letters it needs that English does not.
 */
import { textLength } from './text-length';

export type WallKeyboardKind = 'search' | 'text';

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

/**
 * The `text` keyboard's second page: digits, then the marks a list item or a
 * title needs ("Batteries (AA)", "Dentist @ 3:30", "Mom's birthday!").
 * Delete follows the last row, like the letters.
 */
export const WALL_KEYBOARD_NUMBER_ROWS: readonly string[] = ['1234567890', "-/:()&@'", '.,!?'];

/** The recipe search's cap: more than any recipe name anyone types on a wall. */
export const WALL_SEARCH_MAX_LENGTH = 60;

/** The layout for a BCP-47 locale ("de-DE"), by its language; English for anything else. */
export function wallKeyboardLayout(locale: string): WallKeyboardLayout {
  const language = locale.toLowerCase().split(/[-_]/)[0];
  return LAYOUTS[language] ?? LAYOUTS.en;
}

/**
 * How many key widths the widest row needs, so every key is that fraction of
 * the keyboard's width and rows line up like a real keyboard. The last letter
 * row carries delete (about two keys wide) on a `search` keyboard, and Shift
 * and delete (one and a half keys each) on a `text` one.
 */
export function wallKeyboardColumns(layout: WallKeyboardLayout, kind: WallKeyboardKind = 'search'): number {
  const rows = layout.rows;
  const last = rows[rows.length - 1] ?? '';
  const around = kind === 'text' ? 3 : 2;
  return Math.max(...rows.slice(0, -1).map((r) => [...r].length), [...last].length + around);
}

/**
 * A key typed onto the words: one space at most between words and none
 * before the first; nothing once the words are at `maxLength` characters
 * (counted the way people count them, so an emoji is one).
 */
export function typeKey(words: string, key: string, maxLength = WALL_SEARCH_MAX_LENGTH): string {
  if (key === ' ' && (words === '' || words.endsWith(' '))) return words;
  if (textLength(words) + textLength(key) > maxLength) return words;
  return `${words}${key}`;
}

/** Delete: the last character (a whole one, never half of an emoji). */
export function deleteKey(words: string): string {
  return [...words].slice(0, -1).join('');
}

/** The next letter starts a sentence: nothing typed yet, or after ". ", "! " or "? ". */
export function startsSentence(words: string): boolean {
  return words.trim() === '' || /[.!?]\s+$/.test(words);
}

/**
 * A letter as Shift makes it. A language whose capital is more than one
 * letter (German ß is "SS") keeps the letter as it is, since one key types
 * one character.
 */
export function shiftLetter(letter: string, locale: string): string {
  const upper = letter.toLocaleUpperCase(locale);
  return textLength(upper) === 1 ? upper : letter;
}
