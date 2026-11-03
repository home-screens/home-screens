import { describe, it, expect } from 'vitest';
import { memberInitials, memberInk, memberNameStem } from '@/lib/family-avatar';

describe('memberInitials', () => {
  it('takes one letter by default and up to max letters, one per word', () => {
    expect(memberInitials('Ella')).toBe('E');
    expect(memberInitials('owen lee')).toBe('O');
    expect(memberInitials('owen lee', { max: 2 })).toBe('OL');
    expect(memberInitials('Mary Ann Smith', { max: 2 })).toBe('MA');
    expect(memberInitials('  Ben ')).toBe('B');
    expect(memberInitials('élise')).toBe('É');
  });

  it('steps over an emoji or symbol in front of a name and takes the letter', () => {
    // A dot is there to tell five people apart, so a star in place of a letter
    // is the one thing it must not draw.
    expect(memberInitials('🌟 Mia')).toBe('M');
    expect(memberInitials('🌟Mia')).toBe('M');
    expect(memberInitials('* Ava')).toBe('A');
    expect(memberInitials('⭐ Mary Ann', { max: 2 })).toBe('MA');
    expect(memberInitials('Mia 🌟', { max: 2 })).toBe('M');
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
    expect(memberInitials('Ærø Bo', { max: 2 })).toBe('ÆB');
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
});
