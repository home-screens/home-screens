import { describe, expect, it } from 'vitest';
import { clampText, oneLineText, textLength } from '../text-length';

describe('oneLineText', () => {
  it('makes one tidy line', () => {
    expect(oneLineText('  Picture   day\n bring\tboots  ')).toBe('Picture day bring boots');
  });
});

describe('textLength', () => {
  it('counts characters as people see them: an emoji is one', () => {
    expect(textLength('Costume party \u{1F383}')).toBe(15);
    expect('Costume party \u{1F383}'.length).toBe(16);
    expect(textLength('')).toBe(0);
  });
});

describe('clampText', () => {
  it('cuts to the cap by that count, never through an emoji', () => {
    const long = '\u{1F383}'.repeat(85);
    expect(textLength(clampText(long, 80))).toBe(80);
    expect(clampText(long, 80).endsWith('\u{1F383}')).toBe(true);
  });

  it('leaves text within the cap untouched', () => {
    expect(clampText('short', 80)).toBe('short');
    expect(clampText('crème', 5)).toBe('crème');
  });
});
