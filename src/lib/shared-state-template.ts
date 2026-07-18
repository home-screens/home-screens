/**
 * Shared-state token interpolation for text content: `{plugin:ha:sensor.temp}`
 * substitutes the live bus value of that key at render time.
 *
 * Token = a single-brace-wrapped shared-state key (SHARED_STATE_KEY_RE
 * charset), optionally followed by a filter pipe: `{key|round:1|default:n/a}`.
 * The lookbehind excludes double-brace tokens so the Text module's
 * existing `{{time}}`-style template variables are never mistaken for state
 * keys — `{{time}}` contains the single-brace token `{time}`, and without the
 * guard a literal (templateVariables off) `{{time}}` would half-resolve. The
 * inner token of any `{{...}}` is always preceded by `{`, so the lookbehind
 * alone covers it; a trailing-`}` lookahead would wrongly skip a legitimate
 * token followed by a literal brace (`{key}}`).
 *
 * Exactly two filters, applied left to right:
 *  - `round:N` — parse the value as a number and render it through the
 *    locale-aware `formatNumber` with `maximumFractionDigits: N`, so a de-DE
 *    display shows `72,5` like every native module. Non-numeric values pass
 *    through unchanged (never NaN on screen).
 *  - `default:TEXT` — replaces the placeholder for keys with no published
 *    value. An empty TEXT is legal and renders empty.
 * Anything unrecognized after a `|` renders the whole token literally, so a
 * typo is visible on screen instead of silently swallowed. Deliberately no
 * expression language beyond this closed pair: the producing plugin controls
 * the raw string.
 */

import type { SharedStateEntry } from '@/lib/shared-state-types';
import { formatNumber } from '@/i18n/formatters';

const TOKEN_RE = /(?<!\{)\{([a-z0-9_:.-]{1,128})((?:\|[^{}|]*)*)\}/g;

/** Rendered in place of a token whose key has no published value yet, so a
 *  cold display shows something sane before the producer's first publish. */
export const UNKNOWN_VALUE_PLACEHOLDER = '–';

/** Intl.NumberFormat rejects maximumFractionDigits above 100; anything past
 *  a handful of digits is a typo, so the grammar caps `round:N` here. */
const MAX_ROUND_DIGITS = 20;

type TokenFilter =
  | { name: 'round'; digits: number }
  | { name: 'default'; text: string };

/**
 * Parse the raw filter tail of a token (`''` or `'|round:1|default:n/a'`)
 * into an ordered filter list, or null when any segment is unrecognized —
 * the caller then renders the token literally so the typo stays visible.
 */
function parseFilters(raw: string): TokenFilter[] | null {
  if (raw === '') return [];
  const filters: TokenFilter[] = [];
  // The regex guarantees the tail is `(|segment)+` with no braces or pipes
  // inside a segment, so slicing off the leading pipe and splitting is exact.
  for (const segment of raw.slice(1).split('|')) {
    if (/^round:\d{1,2}$/.test(segment)) {
      const digits = Number(segment.slice('round:'.length));
      if (digits > MAX_ROUND_DIGITS) return null;
      filters.push({ name: 'round', digits });
    } else if (segment.startsWith('default:')) {
      filters.push({ name: 'default', text: segment.slice('default:'.length) });
    } else {
      return null;
    }
  }
  return filters;
}

/** Apply filters left to right; `undefined` in/out means "no published value"
 *  (only `default:` can convert it into text). */
function applyFilters(
  value: string | undefined,
  filters: readonly TokenFilter[],
  locale: string,
): string | undefined {
  for (const f of filters) {
    if (f.name === 'round') {
      if (value === undefined || value.trim() === '') continue;
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      value = formatNumber(n, { locale, maximumFractionDigits: f.digits });
    } else if (value === undefined) {
      value = f.text;
    }
  }
  return value;
}

/** All shared-state keys referenced by `{key}` tokens (filters stripped),
 *  deduped and sorted — demand computation and subscriptions see plain keys
 *  whether or not a token carries a filter pipe. */
export function extractSharedStateKeys(text: string): string[] {
  if (!text.includes('{')) return [];
  const keys = new Set<string>();
  for (const match of text.matchAll(TOKEN_RE)) {
    keys.add(match[1]);
  }
  return Array.from(keys).sort();
}

export interface ResolveTokenOptions {
  /** Rendered for unpublished keys with no `default:` filter. */
  placeholder?: string;
  /** BCP-47 tag driving `round:N` output (pass the formatting locale). */
  locale?: string;
}

/**
 * Substitute every `{key}` / `{key|filters}` token with its published value
 * from the given snapshot; unknown keys render the `default:` filter text
 * when present, the placeholder otherwise. Tokens with unrecognized filters
 * are left verbatim.
 */
export function resolveSharedStateTokens(
  text: string,
  states: ReadonlyMap<string, SharedStateEntry>,
  opts: ResolveTokenOptions = {},
): string {
  if (!text.includes('{')) return text;
  const placeholder = opts.placeholder ?? UNKNOWN_VALUE_PLACEHOLDER;
  const locale = opts.locale ?? 'en-US';
  return text.replace(TOKEN_RE, (full, key: string, rawFilters: string) => {
    const filters = parseFilters(rawFilters);
    if (filters === null) return full;
    return applyFilters(states.get(key)?.value, filters, locale) ?? placeholder;
  });
}
