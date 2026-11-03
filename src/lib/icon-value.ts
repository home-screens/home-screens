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
 * The household's own pictures are a third kind, stored as `custom:<id>`
 * (see `custom-icons.ts`).
 *
 * Anything that isn't a well-formed token is treated as text and rendered
 * verbatim — a hand-edited config shows the user exactly what they typed
 * instead of silently blanking.
 */
import type { FaIconKind } from '@/lib/font-awesome-icons';
import { parseCustomIconValue } from '@/lib/custom-icons';

export const FA_VALUE_PREFIX = 'fa:';

const FA_KINDS: readonly FaIconKind[] = ['solid', 'regular', 'brands'];

export type ParsedIconValue =
  | { type: 'fa'; name: string; kind: FaIconKind }
  | { type: 'custom'; id: string }
  | { type: 'text'; text: string };

function isFaKind(v: string): v is FaIconKind {
  return (FA_KINDS as readonly string[]).includes(v);
}

/** `null` for an empty/whitespace value — callers use that as "no icon". */
export function parseIconValue(value: string | null | undefined): ParsedIconValue | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const customId = parseCustomIconValue(trimmed);
  if (customId) return { type: 'custom', id: customId };
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

/**
 * A picker's emoji grid with the field's own value in front when the grid
 * does not carry it. An emoji chosen anywhere else (the editor's emoji search,
 * the default plate a new meal starts with, a meal saved long ago) then still
 * shows as the one chosen, instead of a grid with nothing marked that reads
 * as "no icon yet". A picture of the family's own is marked in its own
 * section, and an empty value or a Font Awesome token is not an emoji to
 * draw, so none of those is added.
 */
export function emojiGridWithChosen(grid: readonly string[], chosen: string | null | undefined): readonly string[] {
  const parsed = parseIconValue(chosen);
  if (parsed?.type !== 'text' || grid.includes(parsed.text)) return grid;
  return [parsed.text, ...grid];
}
