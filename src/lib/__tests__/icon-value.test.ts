import { describe, expect, it } from 'vitest';
import { faIconValue, iconValueFaClass, isFaIconValue, parseIconValue } from '@/lib/icon-value';

describe('parseIconValue', () => {
  it('treats an empty or whitespace value as no icon', () => {
    expect(parseIconValue(undefined)).toBeNull();
    expect(parseIconValue(null)).toBeNull();
    expect(parseIconValue('')).toBeNull();
    expect(parseIconValue('   ')).toBeNull();
  });

  it('reads a plain emoji as text, trimmed', () => {
    expect(parseIconValue('⚽')).toEqual({ type: 'text', text: '⚽' });
    expect(parseIconValue('  ⭐ ')).toEqual({ type: 'text', text: '⭐' });
  });

  it('reads short text the same way, so pre-picker configs keep working', () => {
    expect(parseIconValue('PE')).toEqual({ type: 'text', text: 'PE' });
  });

  it('reads a Font Awesome token', () => {
    expect(parseIconValue('fa:solid:futbol')).toEqual({ type: 'fa', name: 'futbol', kind: 'solid' });
    expect(parseIconValue('fa:brands:youtube')).toEqual({ type: 'fa', name: 'youtube', kind: 'brands' });
    expect(parseIconValue('fa:regular:star')).toEqual({ type: 'fa', name: 'star', kind: 'regular' });
  });

  it('falls back to text for a malformed token rather than blanking the icon', () => {
    // A hand-edited config should show the user what they typed.
    expect(parseIconValue('fa:futbol')).toEqual({ type: 'text', text: 'fa:futbol' });
    expect(parseIconValue('fa:light:futbol')).toEqual({ type: 'text', text: 'fa:light:futbol' });
    expect(parseIconValue('fa:solid:')).toEqual({ type: 'text', text: 'fa:solid:' });
    expect(parseIconValue('fa::futbol')).toEqual({ type: 'text', text: 'fa::futbol' });
  });

  it('round-trips a value built by faIconValue', () => {
    expect(parseIconValue(faIconValue('cake-candles', 'solid'))).toEqual({
      type: 'fa',
      name: 'cake-candles',
      kind: 'solid',
    });
  });
});

describe('isFaIconValue', () => {
  it('separates tokens from glyphs', () => {
    expect(isFaIconValue('fa:solid:star')).toBe(true);
    expect(isFaIconValue('⭐')).toBe(false);
    expect(isFaIconValue(undefined)).toBe(false);
  });
});

describe('iconValueFaClass', () => {
  it('builds the render class for a token', () => {
    expect(iconValueFaClass('fa:solid:futbol')).toBe('fa fa-solid fa-futbol');
    expect(iconValueFaClass('fa:brands:youtube')).toBe('fa fa-brands fa-youtube');
  });

  it('is null for text, which renders as itself', () => {
    expect(iconValueFaClass('⚽')).toBeNull();
    expect(iconValueFaClass('')).toBeNull();
  });
});
