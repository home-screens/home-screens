import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shared translation-dictionary helpers for the locale ratchets.
 *
 * `locale-parity.test.ts` (orphan-key direction) and
 * `dictionary-completeness.test.ts` (missing-key direction) are two halves of
 * the same guarantee, and it only holds if both agree on what a "key" is.
 * Keeping `flatten`/`loadDict` here — rather than copy-pasted in each file —
 * makes that agreement structural instead of a comment someone has to honor.
 */

export const TRANSLATIONS_ROOT = join(process.cwd(), 'src/translations');
export const ALLOWED_PLURAL_BRANCHES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

/**
 * Flatten a nested dictionary to dotted-path keys. Plural-form objects (every
 * value a string, every key a CLDR plural category) are kept whole — they are
 * one logical entry at the call site, not a dotted sub-tree.
 */
export function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = v as Record<string, unknown>;
      const allStringValues = Object.values(inner).every((x) => typeof x === 'string');
      const allPluralKeys = Object.keys(inner).every((x) => ALLOWED_PLURAL_BRANCHES.has(x));
      if (allStringValues && allPluralKeys && Object.keys(inner).length > 0) {
        out[path] = inner;
      } else {
        Object.assign(out, flatten(inner, path));
      }
    } else {
      out[path] = v;
    }
  }
  return out;
}

export function loadDict(locale: string, namespace: string): Record<string, unknown> | null {
  const path = join(TRANSLATIONS_ROOT, locale, `${namespace}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}
