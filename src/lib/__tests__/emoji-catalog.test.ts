import { describe, expect, it } from 'vitest';
import { ALL_EMOJI, EMOJI_GROUPS, findEmoji, searchEmoji } from '@/lib/emoji-catalog';

describe('emoji catalog', () => {
  it('has no duplicate glyphs across groups', () => {
    const seen = new Map<string, string>();
    for (const group of EMOJI_GROUPS) {
      for (const entry of group.icons) {
        expect(seen.has(entry.e), `${entry.e} in both ${seen.get(entry.e)} and ${group.id}`).toBe(false);
        seen.set(entry.e, group.id);
      }
    }
  });

  it('gives every entry a searchable name', () => {
    for (const entry of ALL_EMOJI) {
      expect(entry.n.trim().length, `${entry.e} has no name`).toBeGreaterThan(0);
    }
  });

  it('never repeats a name token in the aliases', () => {
    // `kw` is documented as the aliases *not* already in `n`; a duplicate is
    // dead weight in the search loop.
    for (const entry of ALL_EMOJI) {
      for (const kw of entry.kw ?? []) {
        expect(entry.n.toLowerCase(), `${entry.e} repeats "${kw}"`).not.toContain(kw.toLowerCase());
      }
    }
  });
});

describe('searchEmoji', () => {
  it('returns the whole catalog for an empty query', () => {
    expect(searchEmoji('')).toBe(ALL_EMOJI);
    expect(searchEmoji('   ')).toBe(ALL_EMOJI);
  });

  it('finds by name', () => {
    expect(searchEmoji('soccer')[0].e).toBe('⚽');
  });

  it('finds by alias', () => {
    expect(searchEmoji('football').map((e) => e.e)).toContain('⚽');
    expect(searchEmoji('dentist').map((e) => e.e)).toContain('🦷');
  });

  it('ranks an exact name ahead of an alias match', () => {
    // 'cake' names 🎂; 🧁 only lists it under "bake sale".
    const results = searchEmoji('cake').map((e) => e.e);
    expect(results.indexOf('🎂')).toBeLessThan(results.indexOf('🧁'));
  });

  it('ranks a name prefix ahead of a mid-name match', () => {
    const results = searchEmoji('star').map((e) => e.e);
    expect(results[0]).toBe('⭐');
  });

  it('matches the glyph itself, so a stored value finds its own tile', () => {
    expect(searchEmoji('🎂')[0].e).toBe('🎂');
  });

  it('is empty for nonsense', () => {
    expect(searchEmoji('zzzzqqq')).toHaveLength(0);
  });
});

describe('findEmoji', () => {
  it('looks a stored glyph back up', () => {
    expect(findEmoji('⚽')?.n).toBe('soccer ball');
    expect(findEmoji('🫥')).toBeUndefined();
  });
});
