import { describe, expect, it } from 'vitest';
import { WALL_KEYBOARD_NUMBER_ROWS, deleteKey, shiftLetter, startsSentence, typeKey, wallKeyboardColumns, wallKeyboardLayout } from '../wall-keyboard';
import { LOCALES } from '@/i18n';

describe('wallKeyboardLayout', () => {
  it('gives each shipped language its own keys', () => {
    expect(wallKeyboardLayout('en-US').rows[0]).toBe('qwertyuiop');
    expect(wallKeyboardLayout('de-DE').rows.join('')).toContain('ß');
    expect(wallKeyboardLayout('fr-FR').rows[0]).toBe('azertyuiop');
    expect(wallKeyboardLayout('es-ES').rows.join('')).toContain('ñ');
    expect(wallKeyboardLayout('pt-BR').rows.join('')).toContain('ç');
    expect(wallKeyboardLayout('da-DK').rows.join('')).toMatch(/[æøå]{2}/);
    expect(wallKeyboardLayout('nl-NL').rows[0]).toBe('qwertyuiop');
  });

  it('falls back to English for a language without its own', () => {
    expect(wallKeyboardLayout('ja-JP')).toEqual(wallKeyboardLayout('en-US'));
  });

  it('has every shipped locale covered with letters only', () => {
    for (const tag of Object.keys(LOCALES)) {
      const letters = wallKeyboardLayout(tag).rows.join('');
      expect(letters).toMatch(/^\p{Ll}+$/u);
      expect(new Set(letters).size).toBe([...letters].length);
    }
  });
});

describe('wallKeyboardColumns', () => {
  it('fits the widest row, counting delete on the last', () => {
    expect(wallKeyboardColumns(wallKeyboardLayout('en-US'))).toBe(10);
    expect(wallKeyboardColumns(wallKeyboardLayout('de-DE'))).toBe(11);
    expect(wallKeyboardColumns(wallKeyboardLayout('fr-FR'))).toBe(12);
  });

  it('makes room for Shift and delete either side of the last row on a text keyboard', () => {
    expect(wallKeyboardColumns(wallKeyboardLayout('en-US'), 'text')).toBe(10);
    expect(wallKeyboardColumns(wallKeyboardLayout('de-DE'), 'text')).toBe(11);
    expect(wallKeyboardColumns(wallKeyboardLayout('fr-FR'), 'text')).toBe(13);
  });

  it('fits the 123 page inside the letters, so a key keeps its size between pages', () => {
    for (const tag of Object.keys(LOCALES)) {
      const columns = wallKeyboardColumns(wallKeyboardLayout(tag), 'text');
      expect(Math.max(...WALL_KEYBOARD_NUMBER_ROWS.slice(0, -1).map((r) => r.length))).toBeLessThanOrEqual(columns);
    }
  });
});

describe('typeKey and deleteKey', () => {
  it('types letters and keeps one space between words', () => {
    let words = '';
    for (const key of [' ', 'm', 'a', 'c', ' ', ' ', 'n']) words = typeKey(words, key);
    expect(words).toBe('mac n');
  });

  it('deletes whole letters', () => {
    expect(deleteKey('crème')).toBe('crèm');
    expect(deleteKey('')).toBe('');
  });

  it('stops at a sensible length', () => {
    expect(typeKey('a'.repeat(60), 'b')).toHaveLength(60);
  });

  it('stops at the cap it is given, counting as people count', () => {
    expect(typeKey('a'.repeat(79), 'b', 80)).toHaveLength(80);
    expect(typeKey('a'.repeat(80), 'b', 80)).toHaveLength(80);
    expect(typeKey('a'.repeat(80), ' ', 80)).toHaveLength(80);
    const emoji = '\u{1F383}'.repeat(79);
    expect(typeKey(emoji, 'x', 80)).toBe(`${emoji}x`);
  });

  it('keeps marks and digits as typed', () => {
    let words = '';
    for (const key of [...'Batteries (AA)']) words = typeKey(words, key, 80);
    expect(words).toBe('Batteries (AA)');
  });
});

describe('startsSentence', () => {
  it('is true with nothing typed and after the end of a sentence', () => {
    expect(startsSentence('')).toBe(true);
    expect(startsSentence('   ')).toBe(true);
    expect(startsSentence('Milk. ')).toBe(true);
    expect(startsSentence('Done! ')).toBe(true);
    expect(startsSentence('Really? ')).toBe(true);
  });

  it('is false inside a sentence, and right after a mark before its space', () => {
    expect(startsSentence('Paper')).toBe(false);
    expect(startsSentence('Paper ')).toBe(false);
    expect(startsSentence('Milk.')).toBe(false);
    expect(startsSentence('Dr. Lee 3:30 ')).toBe(false);
  });
});

describe('shiftLetter', () => {
  it('gives the capital in the hub language', () => {
    expect(shiftLetter('a', 'en-US')).toBe('A');
    expect(shiftLetter('ü', 'de-DE')).toBe('Ü');
    expect(shiftLetter('ç', 'fr-FR')).toBe('Ç');
    expect(shiftLetter('æ', 'da-DK')).toBe('Æ');
  });

  it('keeps a letter whose capital is two letters', () => {
    expect(shiftLetter('ß', 'de-DE')).toBe('ß');
  });
});
