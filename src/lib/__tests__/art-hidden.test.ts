import { describe, it, expect } from 'vitest';
import { ART_HIDDEN_MAX, normalizeArtHidden, withArtHidden } from '../art-hidden';

describe('hidden paintings', () => {
  it('keeps only Wikidata ids, once each', () => {
    expect(normalizeArtHidden(['Q1', 'Q1', 'nope', 7, 'Q22'])).toEqual(['Q1', 'Q22']);
    expect(normalizeArtHidden('Q1')).toEqual([]);
    expect(normalizeArtHidden(undefined)).toEqual([]);
  });

  it('hides a painting once, shows it again, and leaves nothing behind when the list empties', () => {
    expect(withArtHidden(['Q1'], 'Q2', true)).toEqual(['Q1', 'Q2']);
    expect(withArtHidden(['Q1', 'Q2'], 'Q1', true)).toEqual(['Q2', 'Q1']);
    expect(withArtHidden(['Q1', 'Q2'], 'Q1', false)).toEqual(['Q2']);
    expect(withArtHidden(['Q1'], 'Q1', false)).toBeUndefined();
  });

  it('lets the oldest go when the list is full', () => {
    const full = Array.from({ length: ART_HIDDEN_MAX }, (_, i) => `Q${i + 1}`);
    const next = withArtHidden(full, 'Q999999', true)!;
    expect(next).toHaveLength(ART_HIDDEN_MAX);
    expect(next[0]).toBe('Q2');
    expect(next.at(-1)).toBe('Q999999');
  });
});
