import { pickPillTextColor } from '@/lib/calendar-color';

/**
 * A family member's dot, the way a person is drawn at a glance on every
 * surface: the letters inside it and the ink they are written in. The phone's
 * list rows, the wall's to-do and chore dots, the reward store chips, the
 * timetable cards, the calendar's name tags and the family editor all draw
 * their own markup around these two rules, so a name that works on one
 * surface works on all of them.
 */

/** A letter or digit with any combining marks that follow it, so "É" written as E plus an accent keeps the accent. */
const FIRST_LETTER = /[\p{L}\p{N}]\p{M}*/u;

/**
 * The first letter or digit in a word, so a name written with an emoji or a
 * symbol in front of it still gives up its letter. A dot is meant to read as
 * the person, and a household that writes "* Mia" wants the M: one star
 * among five dots tells nobody apart.
 */
function firstLetter(word: string): string {
  const match = word.match(FIRST_LETTER);
  return match ? match[0].toLocaleUpperCase() : '';
}

/** The first thing a reader sees as one character, so a flag or a skin-toned emoji is not cut in half. */
function firstGrapheme(text: string): string {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
    for (const segment of segments) return segment.segment;
  }
  return Array.from(text)[0] ?? '';
}

/**
 * The letters for a member's dot: the first letter of each word, up to `max`
 * of them (one by default, two for the calendar's name tags). "Ella" is E,
 * "Mary Ann" is M or MA, "🌟 Mia" is M. Letters are whole code points, never
 * the first UTF-16 unit, so an emoji in front of a name cannot leave half a
 * surrogate pair in the dot. A name with no letter at all, like "🦄", shows
 * its first whole character; an empty name shows "?".
 */
export function memberInitials(name: string, { max = 1 }: { max?: number } = {}): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const letters = trimmed.split(/\s+/).map(firstLetter).filter(Boolean);
  if (letters.length === 0) return firstGrapheme(trimmed).toLocaleUpperCase();
  return letters.slice(0, Math.max(1, max)).join('');
}

/**
 * The name from its first letter or digit on, as code points, for the
 * shortest-unique-prefix rule: "* Ava" and "Ava" both start "A", "Av", "Ava".
 * A name with no letter at all is its whole trimmed text.
 */
export function memberNameStem(name: string): string[] {
  const chars = Array.from(name.trim());
  const start = chars.findIndex((c) => FIRST_LETTER.test(c));
  return start < 0 ? chars : chars.slice(start);
}

/**
 * The ink for text drawn on a member's colour. The member palette is mostly
 * pastel, so the pick has to flip to dark on amber, mint and the pinks while
 * staying white on the saturated blue, red and green people expect; the YIQ
 * rule the calendar's pills use does exactly that, and it keeps a person's
 * dot and their calendar events agreeing. Anything unparseable gets white.
 */
export function memberInk(color: string | undefined): string {
  return pickPillTextColor(color);
}
