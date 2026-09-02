/**
 * One string field, two kinds of icon.
 *
 * Rule icons, day-badge icons and the text-module prefix have always stored a
 * literal glyph ("⚽"), and every config written before the picker existed
 * still does. Font Awesome picks are stored as a `fa:<style>:<name>` token
 * rather than a ready-made class string: the token survives a Font Awesome
 * upgrade that changes how classes are spelled, and it can never be confused
 * with an emoji, so plain values keep flowing through untouched.
 *
 * Anything that isn't a well-formed token is treated as text and rendered
 * verbatim — a hand-edited config shows the user exactly what they typed
 * instead of silently blanking.
 */
import { buildIconClass, type FaIconKind } from '@/lib/font-awesome-icons';

export const FA_VALUE_PREFIX = 'fa:';

const FA_KINDS: readonly FaIconKind[] = ['solid', 'regular', 'brands'];

export type ParsedIconValue =
  | { type: 'fa'; name: string; kind: FaIconKind }
  | { type: 'text'; text: string };

function isFaKind(v: string): v is FaIconKind {
  return (FA_KINDS as readonly string[]).includes(v);
}

/** `null` for an empty/whitespace value — callers use that as "no icon". */
export function parseIconValue(value: string | null | undefined): ParsedIconValue | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith(FA_VALUE_PREFIX)) return { type: 'text', text: trimmed };
  const rest = trimmed.slice(FA_VALUE_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep <= 0) return { type: 'text', text: trimmed };
  const kind = rest.slice(0, sep);
  const name = rest.slice(sep + 1);
  if (!name || !isFaKind(kind)) return { type: 'text', text: trimmed };
  return { type: 'fa', name, kind };
}

/** Build the stored value for a Font Awesome pick. */
export function faIconValue(name: string, kind: FaIconKind): string {
  return `${FA_VALUE_PREFIX}${kind}:${name}`;
}

export function isFaIconValue(value: string | null | undefined): boolean {
  return parseIconValue(value)?.type === 'fa';
}

/**
 * Font Awesome class string for a stored value, or `null` when the value is
 * text. Lets non-React callers (canvas measurement, tests) branch the same
 * way the `<Glyph>` component does.
 */
export function iconValueFaClass(value: string | null | undefined): string | null {
  const parsed = parseIconValue(value);
  return parsed?.type === 'fa' ? buildIconClass(parsed.name, parsed.kind) : null;
}
