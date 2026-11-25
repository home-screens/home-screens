import { describe, expect, it } from 'vitest';
import {
  WALL_KEYBOARD_NUMBER_ROWS,
  deleteKey,
  shiftLetter,
  startsSentence,
  typeKey,
  wallKeyboardAccents,
  wallKeyboardColumns,
  wallKeyboardLayout,
} from '../wall-keyboard';
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

describe('the accent row', () => {
  /** Every character a `text` keyboard in this language can put in the box. */
  function typeable(tag: string): Set<string> {
    const layout = wallKeyboardLayout(tag);
    const letters = [...layout.rows.join(''), ...wallKeyboardAccents(layout, 'text')];
    return new Set([...letters, ...letters.map((l) => shiftLetter(l, tag)), ...WALL_KEYBOARD_NUMBER_ROWS.join(''), ' ']);
  }

  // Things a family writes on a shopping list or a calendar, as they spell them.
  const WORDS: Record<string, string[]> = {
    'en-US': ['Milk', 'Paper towels', "Mom's birthday"],
    'de-DE': ['Brötchen', 'Käse', 'Süßkartoffeln', 'Äpfel', 'Öl'],
    'fr-FR': ['pâtes', 'gâteau', 'bœuf', 'Œufs', 'crème fraîche', 'août', 'Noël', 'maïs', 'forêt', 'où', 'sûr', 'côte', 'Pâques', 'Été', 'ça'],
    'es-ES': ['jamón', 'atún', 'plátanos', 'azúcar', 'café', 'maíz', 'pingüino', 'niño', 'Árbol'],
    'pt-BR': ['pão', 'feijão', 'açúcar', 'maçã', 'limão', 'café', 'você', 'avô', 'à noite', 'pêssego', 'salsão', 'aniversários', 'baú', 'botões', 'família', 'Água', 'Óleo'],
    'nl-NL': ['één', 'crème', 'reëel', 'patiënt', 'paté', 'coördinatie', 'ruïne', 'reünie', 'Eén', 'crème fraîche', 'crêpes'],
    'da-DK': ['rødkål', 'æg', 'smør', 'Øl', 'Æbler', 'Århus'],
  };

  it('has words to spell for every shipped locale', () => {
    expect(Object.keys(WORDS).sort()).toEqual(Object.keys(LOCALES).sort());
  });

  for (const [tag, words] of Object.entries(WORDS)) {
    it(`lets a ${tag} wall spell its everyday words`, () => {
      const keys = typeable(tag);
      for (const word of words) {
        const missing = [...word].filter((ch) => !keys.has(ch));
        expect(missing, `${word} (${tag})`).toEqual([]);
      }
    });
  }

  it('gives a Dutch wall ê and î for the French words on its shopping lists', () => {
    expect(wallKeyboardAccents(wallKeyboardLayout('nl-NL'), 'text')).toBe('ëéèêïîöü');
  });

  it('holds small letters only, none of them already on the letter rows', () => {
    for (const tag of Object.keys(LOCALES)) {
      const layout = wallKeyboardLayout(tag);
      const accents = wallKeyboardAccents(layout, 'text');
      if (accents === '') continue;
      expect(accents).toMatch(/^\p{Ll}+$/u);
      const all = [...layout.rows.join(''), ...accents];
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('gives a capital for every accented letter, so Shift works on the row', () => {
    for (const tag of Object.keys(LOCALES)) {
      for (const letter of wallKeyboardAccents(wallKeyboardLayout(tag), 'text')) {
        expect(shiftLetter(letter, tag), `${letter} (${tag})`).not.toBe(letter);
      }
    }
  });

  it('is left off the recipe search, whose keys stay as they were', () => {
    for (const tag of Object.keys(LOCALES)) {
      expect(wallKeyboardAccents(wallKeyboardLayout(tag), 'search')).toBe('');
    }
    expect(wallKeyboardColumns(wallKeyboardLayout('pt-BR'))).toBe(10);
    expect(wallKeyboardColumns(wallKeyboardLayout('es-ES'))).toBe(10);
    expect(wallKeyboardColumns(wallKeyboardLayout('nl-NL'))).toBe(10);
    expect(wallKeyboardColumns(wallKeyboardLayout('fr-FR'))).toBe(12);
  });

  it('never makes a key narrower than the widest keyboard already shipped (French, 13 across)', () => {
    for (const tag of Object.keys(LOCALES)) {
      expect(wallKeyboardColumns(wallKeyboardLayout(tag), 'text')).toBeLessThanOrEqual(13);
    }
    // The longest row, Portuguese, sets that keyboard's width; the others fit inside their letters.
    expect(wallKeyboardColumns(wallKeyboardLayout('pt-BR'), 'text')).toBe(11);
    expect(wallKeyboardColumns(wallKeyboardLayout('es-ES'), 'text')).toBe(10);
    expect(wallKeyboardColumns(wallKeyboardLayout('nl-NL'), 'text')).toBe(10);
    expect(wallKeyboardColumns(wallKeyboardLayout('fr-FR'), 'text')).toBe(13);
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
