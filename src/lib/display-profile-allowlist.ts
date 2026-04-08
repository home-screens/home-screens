/**
 * Collapse an allowlist toggle into the canonical `profileIds` value we
 * want to persist to disk. Two collapse rules, both of which restore the
 * "no allowlist" shape (`undefined`, meaning "every shared profile is
 * allowed"):
 *
 *   1. The user toggled every profile ON — `next.length === poolLength`.
 *      Storing an allowlist that contains every profile is redundant with
 *      "no allowlist," so we prefer `undefined` to keep the on-disk JSON
 *      clean and the merge contract unambiguous.
 *
 *   2. The user toggled every profile OFF — `next.length === 0`. An empty
 *      allowlist means "no profiles allowed," which softlocks the display:
 *      `getDisplayProfiles` in `display-filter.ts` would return an empty
 *      array and the display would have nothing to pick from. Treat the
 *      empty case as "reset to no allowlist" so the user can't accidentally
 *      trap themselves.
 *
 * Pure function, no React or store deps, so the unit test in
 * `display-profile-allowlist.test.ts` can pin both collapse paths without
 * spinning up a component.
 */
export function collapseAllowlist(next: readonly string[], poolLength: number): string[] | undefined {
  if (next.length === 0) return undefined;
  if (next.length === poolLength) return undefined;
  return [...next];
}
