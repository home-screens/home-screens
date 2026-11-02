import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LOCALES } from '../manifest';
import { pluralCategory } from '../plural';

/**
 * In some languages the `one` plural form is also the one zero takes (French
 * and Brazilian Portuguese: "0 recette", "0 receita"). A `one` string there
 * that writes a literal "1" instead of `{count}` says "1" when there are
 * none: "Pesquisar em 1 receita" with an empty library. Every `one` string in
 * those languages has to carry the number itself.
 */

const DIR = path.resolve(__dirname, '../../translations');
const LONE_ONE = /(?<![\d{])1(?![\d}])/;

function oneForms(node: unknown, at: string, out: Array<[string, string]>) {
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const where = at ? `${at}.${key}` : key;
    if (key === 'one' && typeof value === 'string') out.push([where, value]);
    else oneForms(value, where, out);
  }
}

const zeroIsOne = Object.keys(LOCALES).filter((tag) => pluralCategory(tag, 0) === 'one');

describe('plural forms that zero shares', () => {
  it('covers the languages it is about', () => {
    expect(zeroIsOne).toEqual(expect.arrayContaining(['fr-FR', 'pt-BR']));
  });

  for (const tag of zeroIsOne) {
    it(`${tag}: every "one" string says {count}, never a literal 1`, () => {
      const offenders: string[] = [];
      for (const file of readdirSync(path.join(DIR, tag)).filter((f) => f.endsWith('.json'))) {
        const forms: Array<[string, string]> = [];
        oneForms(JSON.parse(readFileSync(path.join(DIR, tag, file), 'utf8')), '', forms);
        for (const [key, text] of forms) {
          if (!text.includes('{count}') && LONE_ONE.test(text)) offenders.push(`${file}|${key}: ${text}`);
        }
      }
      expect(offenders, 'Write {count} in place of the 1: zero uses this form too').toEqual([]);
    });
  }
});
