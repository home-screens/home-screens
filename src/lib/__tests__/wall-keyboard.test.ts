import { describe, expect, it } from 'vitest';
import { deleteKey, typeKey, wallKeyboardColumns, wallKeyboardLayout } from '../wall-keyboard';
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
});
