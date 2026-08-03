/**
 * Resolve a `goto-screen` command target against a display's resolved screen
 * list (the rotation order, after profile/schedule filtering — indices feed
 * ScreenRotator's goToScreen directly).
 *
 * Voice callers say screen *names* ("show the calendar"), scripted callers may
 * send ids, so both are accepted: an exact id match wins (ids are unique;
 * names may not be), then a case-insensitive whitespace-trimmed name match
 * takes the first hit in rotation order. Returns -1 when nothing matches —
 * callers warn and ignore, since the hub can't validate targets it never sees.
 */
export function resolveScreenTargetIndex(
  screens: ReadonlyArray<{ id: string; name: string }>,
  target: string,
): number {
  const trimmed = target.trim();
  if (trimmed.length === 0) return -1;

  const byId = screens.findIndex((s) => s.id === trimmed);
  if (byId !== -1) return byId;

  const lowered = trimmed.toLowerCase();
  return screens.findIndex((s) => s.name.trim().toLowerCase() === lowered);
}
