import { describe, it, expect } from 'vitest';
import { getUniqueInitials, memberInitials, memberInk, memberNameStem } from '@/lib/family-avatar';

describe('memberInitials', () => {
  it('takes the first letter of the name, on every surface', () => {
    expect(memberInitials('Ella')).toBe('E');
    expect(memberInitials('owen lee')).toBe('O');
    expect(memberInitials('Mary Ann Smith')).toBe('M');
    expect(memberInitials('  Ben ')).toBe('B');
    expect(memberInitials('élise')).toBe('É');
  });

  it('steps over an emoji or symbol in front of a name and takes the letter', () => {
    // A dot is there to tell five people apart, so a star in place of a letter
    // is the one thing it must not draw.
    expect(memberInitials('🌟 Mia')).toBe('M');
    expect(memberInitials('🌟Mia')).toBe('M');
    expect(memberInitials('* Ava')).toBe('A');
    expect(memberInitials('⭐ Mary Ann')).toBe('M');
    expect(memberInitials('Mia 🌟')).toBe('M');
    expect(memberInitials('\u{1F984} Mia')).toBe('M');
  });

  it('never returns half a surrogate pair', () => {
    for (const name of ['🦄Mia', '🦄', '👨‍👩‍👧 Lee', '🏳️‍🌈']) {
      const out = memberInitials(name);
      expect(out.length).toBeGreaterThan(0);
      // A lone surrogate comes out of Array.from as a one-unit string in the surrogate range.
      expect(Array.from(out).every((c) => !(c.length === 1 && /[\uD800-\uDFFF]/.test(c)))).toBe(true);
    }
    expect(memberInitials('🦄Mia')).toBe('M');
    expect(memberInitials('👨‍👩‍👧 Lee')).toBe('L');
  });

  it('shows the first whole character of a name with no letter, and ? for an empty one', () => {
    expect(memberInitials('\u{1F984}')).toBe('\u{1F984}');
    expect(memberInitials('\u{1F984} \u{1F31F}')).toBe('\u{1F984}');
    expect(memberInitials('🏳️‍🌈')).toBe('🏳️‍🌈');
    expect(memberInitials('')).toBe('?');
    expect(memberInitials('   ')).toBe('?');
  });

  it('counts digits as letters and keeps letters that are not Latin', () => {
    expect(memberInitials('42')).toBe('4');
    expect(memberInitials('Åse')).toBe('Å');
    expect(memberInitials('Ærø Bo')).toBe('Æ');
    expect(memberInitials('Élise')).toBe('É');
  });
});

describe('memberNameStem', () => {
  it('starts at the first letter, in code points', () => {
    expect(memberNameStem('* Ava')).toEqual(['A', 'v', 'a']);
    expect(memberNameStem('🌟 Ava')).toEqual(['A', 'v', 'a']);
    expect(memberNameStem('A🦄b')).toEqual(['A', '🦄', 'b']);
    expect(memberNameStem('🦄')).toEqual(['🦄']);
    expect(memberNameStem('  ')).toEqual([]);
  });
});

describe('memberInk', () => {
  it('puts dark ink on the light member colours and white on the saturated ones', () => {
    expect(memberInk('#f59e0b')).toBe('#1b1b1f'); // amber
    expect(memberInk('#fbbf24')).toBe('#1b1b1f'); // the palette's yellow
    expect(memberInk('#4ade80')).toBe('#1b1b1f'); // the palette's mint
    expect(memberInk('#3b82f6')).toBe('#fff');    // blue
    expect(memberInk('#ef4444')).toBe('#fff');    // red
    expect(memberInk('#22c55e')).toBe('#fff');    // green
  });

  it('reads rgb() as well as hex and falls back to white', () => {
    expect(memberInk('rgb(245, 158, 11)')).toBe('#1b1b1f');
    expect(memberInk('var(--nope)')).toBe('#fff');
    expect(memberInk(undefined)).toBe('#fff');
  });

  it('gives a theme colour written as var() the ink its theme pairs with it', () => {
    // The phone draws a chart with no accent of its own in the theme's amber,
    // which is a var() and cannot be measured: white there was white on amber.
    expect(memberInk('var(--hs-warning-ink)')).toBe('var(--hs-on-warning-ink)');
    expect(memberInk('var(--hs-warning)')).toBe('var(--hs-on-warning)');
    expect(memberInk('var(--hs-meal)')).toBe('var(--hs-on-meal)');
    expect(memberInk('var(--hs-success)')).toBe('var(--hs-on-success)');
    expect(memberInk('var(--hs-danger)')).toBe('var(--hs-on-danger)');
  });

  it('reads the token through spaces and a fallback, and leaves other var() colours on white', () => {
    expect(memberInk(' var( --hs-warning-ink ) ')).toBe('var(--hs-on-warning-ink)');
    expect(memberInk('var(--hs-warning-ink, #f59e0b)')).toBe('var(--hs-on-warning-ink)');
    expect(memberInk('var(--hs-text-faint)')).toBe('#fff');
  });
});

describe('getUniqueInitials', () => {
  it('uses single characters when all first letters are unique', () => {
    const members = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
    ];
    const result = getUniqueInitials(members);
    expect(result.get('1')).toBe('A');
    expect(result.get('2')).toBe('B');
    expect(result.get('3')).toBe('C');
  });

  it('extends to 2 characters to resolve collisions', () => {
    const members = [
      { id: '1', name: 'Sam' },
      { id: '2', name: 'Sarah' },
      { id: '3', name: 'Bob' },
    ];
    const result = getUniqueInitials(members);
    // B is unique → single char
    expect(result.get('3')).toBe('B');
    // Sam vs Sarah → 'Sa' vs 'Sa' → still collide → extend to 3: 'Sam' vs 'Sar'
    expect(result.get('1')).toBe('Sam');
    expect(result.get('2')).toBe('Sar');
  });

  it('handles single member', () => {
    const result = getUniqueInitials([{ id: '1', name: 'Zoe' }]);
    expect(result.get('1')).toBe('Z');
  });

  it('handles empty list', () => {
    const result = getUniqueInitials([]);
    expect(result.size).toBe(0);
  });

  it('extends to 2 chars only where needed', () => {
    const members = [
      { id: '1', name: 'Dan' },
      { id: '2', name: 'Dave' },
      { id: '3', name: 'Emily' },
    ];
    const result = getUniqueInitials(members);
    expect(result.get('3')).toBe('E'); // unique at 1
    // Dan vs Dave: 'Da' vs 'Da' → collide at 2, resolved at 3
    expect(result.get('1')).toBe('Dan');
    expect(result.get('2')).toBe('Dav');
  });

  it('steps over an emoji or symbol in front of a name, for the letter and the extension', () => {
    const members = [
      { id: '1', name: '* Ava' },
      { id: '2', name: '🌟 Avery' },
      { id: '3', name: '🦄' },
    ];
    const result = getUniqueInitials(members);
    expect(result.get('1')).toBe('Ava');
    expect(result.get('2')).toBe('Ave');
    expect(result.get('3')).toBe('🦄');
  });

  it('caps at 3 characters for unresolvable collisions', () => {
    const members = [
      { id: '1', name: 'AAAAAA' },
      { id: '2', name: 'AAAAAB' },
    ];
    const result = getUniqueInitials(members);
    // Both are "AAA" at 3 chars, so the rest are cut to 3
    expect(result.get('1')).toBe('AAA');
    expect(result.get('2')).toBe('AAA');
  });

  it('tells apart people who share a first word by the first letter of each word', () => {
    const tags = (names: string[]) => {
      const found = getUniqueInitials(names.map((name) => ({ id: name, name })));
      return names.map((name) => found.get(name));
    };
    expect(tags(['Mary Ann', 'Mary Beth'])).toEqual(['MA', 'MB']);
    expect(tags(['Anna Lena', 'Anna Maria', 'Ben'])).toEqual(['AL', 'AM', 'B']);
    expect(tags(['Hans Peter', 'Hans Jürgen'])).toEqual(['HP', 'HJ']);
    expect(tags(['⭐ Mary Ann', 'Mary Beth'])).toEqual(['MA', 'MB']);
    // Three words when two are not enough.
    expect(tags(['Mary Ann Lee', 'Mary Ann Poe'])).toEqual(['MAL', 'MAP']);
  });

  it('keeps the name prefix for one-word names, and where the word letters would clash too', () => {
    const tags = (names: string[]) => {
      const found = getUniqueInitials(names.map((name) => ({ id: name, name })));
      return names.map((name) => found.get(name));
    };
    expect(tags(['Sam', 'Sarah', 'Sophie'])).toEqual(['Sam', 'Sar', 'So']);
    // A one-word name tied with two-word ones keeps its prefix; the others move off it.
    expect(tags(['Mary', 'Mary Ann', 'Mary Beth'])).toEqual(['Mar', 'MA', 'MB']);
    // Word letters that are the same again fall back to the shared prefix.
    expect(tags(['Mary Ann', 'Mary Anders'])).toEqual(['Mar', 'Mar']);
    // A second word is not read while the first one already tells them apart.
    expect(tags(['Mary Ann', 'Mia Beth'])).toEqual(['Ma', 'Mi']);
  });
});
