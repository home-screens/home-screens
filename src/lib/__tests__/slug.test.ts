import { describe, it, expect } from 'vitest';
import { dashSlug } from '../slug';

describe('dashSlug', () => {
  it('joins words with dashes and drops what is not a letter or digit', () => {
    expect(dashSlug('  Kitchen Wall! ')).toBe('kitchen-wall');
    expect(dashSlug('TV 2')).toBe('tv-2');
    expect(dashSlug('!!!')).toBe('');
  });

  it('keeps an accented word whole instead of splitting it at the accent', () => {
    expect(dashSlug('Küchen-Touchscreen')).toBe('kuchen-touchscreen');
    expect(dashSlug('Køkken')).toBe('kokken');
    expect(dashSlug('Entrée')).toBe('entree');
    expect(dashSlug('Salón')).toBe('salon');
    expect(dashSlug('Straße')).toBe('strasse');
    expect(dashSlug('Sovevære\u0301lse')).toBe('sovevaerelse');
  });
});
