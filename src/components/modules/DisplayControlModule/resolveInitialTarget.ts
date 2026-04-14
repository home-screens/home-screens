/**
 * Turn a configured defaultTarget into a concrete dispatch target.
 *
 * - 'self' → the display id we're rendered on (or undefined if unknown).
 * - 'all'  → 'all' (broadcast).
 * - '<id>' → the id if still present in availableDisplays, else fall back to
 *   the 'self' resolution (and then undefined if that's also unresolvable).
 *
 * IMPORTANT INVARIANT: this function never returns the literal string 'self'.
 * Consumers rely on the return value being a concrete dispatch target
 * ('all' | <slug> | undefined) — `dispatchDisplayCommand` will treat 'self'
 * as unresolved and silently route to the legacy queue, which would mask bugs.
 */
export function resolveInitialTarget(
  defaultTarget: string,
  renderDisplayId: string | undefined,
  availableDisplays: Array<{ id: string; name: string }>,
): string | undefined {
  if (defaultTarget === 'self') return renderDisplayId;
  if (defaultTarget === 'all') return 'all';
  const known = availableDisplays.some((d) => d.id === defaultTarget);
  if (known) return defaultTarget;
  return renderDisplayId;
}
