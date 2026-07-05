/**
 * Shared-state token interpolation for text content: `{plugin:ha:sensor.temp}`
 * substitutes the live bus value of that key at render time.
 *
 * Token = a single-brace-wrapped shared-state key (SHARED_STATE_KEY_RE
 * charset). The lookbehind excludes double-brace tokens so the Text module's
 * existing `{{time}}`-style template variables are never mistaken for state
 * keys — `{{time}}` contains the single-brace token `{time}`, and without the
 * guard a literal (templateVariables off) `{{time}}` would half-resolve. The
 * inner token of any `{{...}}` is always preceded by `{`, so the lookbehind
 * alone covers it; a trailing-`}` lookahead would wrongly skip a legitimate
 * token followed by a literal brace (`{key}}`).
 *
 * Deliberately no expression language: plain value substitution only. The
 * producing plugin controls the raw string; formatting can layer on later.
 */

import type { SharedStateEntry } from '@/lib/shared-state-types';

const TOKEN_RE = /(?<!\{)\{([a-z0-9_:.-]{1,128})\}/g;

/** Rendered in place of a token whose key has no published value yet, so a
 *  cold display shows something sane before the producer's first publish. */
export const UNKNOWN_VALUE_PLACEHOLDER = '–';

/** All shared-state keys referenced by `{key}` tokens, deduped and sorted. */
export function extractSharedStateKeys(text: string): string[] {
  if (!text.includes('{')) return [];
  const keys = new Set<string>();
  for (const match of text.matchAll(TOKEN_RE)) {
    keys.add(match[1]);
  }
  return Array.from(keys).sort();
}

/**
 * Substitute every `{key}` token with its published value from the given
 * snapshot; unknown keys render the en-dash placeholder.
 */
export function resolveSharedStateTokens(
  text: string,
  states: ReadonlyMap<string, SharedStateEntry>,
  placeholder: string = UNKNOWN_VALUE_PLACEHOLDER,
): string {
  if (!text.includes('{')) return text;
  return text.replace(TOKEN_RE, (_full, key: string) => states.get(key)?.value ?? placeholder);
}
