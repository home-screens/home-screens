/**
 * The paintings a household has said "don't show again" to (`settings.artHidden`):
 * a short list of Wikidata ids the art source leaves out everywhere.
 */

export const ART_HIDDEN_MAX = 1000;
const WIKIDATA_ID = /^Q\d{1,12}$/;

/** The saved list as ids the source can use: no repeats, nothing that is not an id. */
export function normalizeArtHidden(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && WIKIDATA_ID.test(id)))].slice(-ART_HIDDEN_MAX);
}

/** The list with one painting hidden or shown again; undefined when nothing is left on it. */
export function withArtHidden(current: unknown, id: string, hidden: boolean): string[] | undefined {
  const rest = normalizeArtHidden(current).filter((other) => other !== id);
  const next = hidden ? [...rest, id].slice(-ART_HIDDEN_MAX) : rest;
  return next.length > 0 ? next : undefined;
}
