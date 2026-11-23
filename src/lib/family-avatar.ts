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
 * The letter for a member's dot: the first letter of the name, on every
 * surface. "Ella" is E, "Mary Ann" is M, "🌟 Mia" is M. Letters are whole
 * code points, never the first UTF-16 unit, so an emoji in front of a name
 * cannot leave half a surrogate pair in the dot. A name with no letter at
 * all, like "🦄", shows its first whole character; an empty name shows "?".
 *
 * Where the dot stands alone, with no name beside it (a column of chore
 * dots, an event's name tag, a note's bubble), draw `getUniqueInitials`
 * over the roster instead, so two people never share a letter.
 */
export function memberInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const letter = trimmed.split(/\s+/).map(firstLetter).find(Boolean);
  return letter ?? firstGrapheme(trimmed).toLocaleUpperCase();
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
 * The shortest unique initials for each member of a roster: the one letter
 * every member dot shows when it is unique, extended to two or three
 * characters only where two names collide ("Sam" and "Sarah" become "Sam"
 * and "Sar"). The extension grows from the name's first letter on, so
 * "* Ava" and "🌟 Ava" extend like "Ava" and a symbol never takes a slot.
 *
 * People still tied after three characters share a first word ("Mary Ann"
 * and "Mary Beth"), so those are told apart by the first letter of each
 * word instead ("MA" and "MB"). Whoever that does not separate keeps the
 * shared three characters.
 */
export function getUniqueInitials(memberList: readonly { id: string; name: string }[]): Map<string, string> {
  const result = new Map<string, string>();
  const prefixOf = (name: string, len: number) =>
    memberInitials(name) + memberNameStem(name).slice(1, len).join('');
  let remaining = [...memberList];

  for (let len = 1; len <= 3 && remaining.length > 0; len++) {
    const groups = new Map<string, typeof remaining>();
    for (const m of remaining) {
      const prefix = prefixOf(m.name, len);
      const group = groups.get(prefix) ?? [];
      group.push(m);
      groups.set(prefix, group);
    }

    const next: typeof remaining = [];
    for (const [prefix, group] of groups) {
      if (group.length === 1) {
        result.set(group[0].id, prefix);
      } else {
        next.push(...group);
      }
    }
    remaining = next;
  }
  const byWords = remaining.map((m) => wordInitials(m.name));
  const taken = new Set(result.values());
  remaining.forEach((m, i) => {
    const letters = byWords[i];
    const unique = letters !== null && !taken.has(letters) && byWords.indexOf(letters) === byWords.lastIndexOf(letters);
    result.set(m.id, unique ? letters : prefixOf(m.name, 3));
  });
  return result;
}

/** The first letter of each of a name's first three words, or null for a name with one word. */
function wordInitials(name: string): string | null {
  const letters = name.trim().split(/\s+/).map(firstLetter).filter(Boolean);
  return letters.length > 1 ? letters.slice(0, 3).join('') : null;
}

/**
 * Theme colours that can stand in for a person's or a chart's colour (the
 * phone draws a chart with no accent of its own in the theme's amber), each
 * with the ink that reads on it in both themes. A `var()` cannot be measured
 * where the ink is picked, so the pair is named here.
 */
const THEME_COLOR_INK: Record<string, string> = {
  '--hs-warning': 'var(--hs-on-warning)',
  '--hs-warning-ink': 'var(--hs-on-warning-ink)',
  '--hs-meal': 'var(--hs-on-meal)',
  '--hs-success': 'var(--hs-on-success)',
  '--hs-danger': 'var(--hs-on-danger)',
};

const CSS_VAR = /^var\(\s*(--[\w-]+)\s*[,)]/;

/**
 * The ink for text drawn on a member's colour. The member palette is mostly
 * pastel, so the pick has to flip to dark on amber, mint and the pinks while
 * staying white on the saturated blue, red and green people expect; the YIQ
 * rule the calendar's pills use does exactly that, and it keeps a person's
 * dot and their calendar events agreeing. A theme colour written as `var()`
 * (`var(--hs-warning-ink)`) gets its theme's own ink; anything else that
 * cannot be read gets white.
 */
export function memberInk(color: string | undefined): string {
  const token = color?.trim().match(CSS_VAR)?.[1];
  if (token && THEME_COLOR_INK[token]) return THEME_COLOR_INK[token];
  return pickPillTextColor(color);
}
