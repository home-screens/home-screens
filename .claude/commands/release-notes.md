Generate user-friendly release notes for Home Screens version $ARGUMENTS.

## Steps

1. **Determine tag ranges:**
   - Find the last **stable** tag (skip `-rc`, `-beta`, `-alpha`) — this is the **full-range base**, covering everything in the potential release so far: `git tag --sort=-v:refname | grep -v -e '-rc' -e '-beta' -e '-alpha' | head -1`
   - If `$ARGUMENTS` is a **pre-release** (contains `-rc`), also find the most recent tag before HEAD of any kind (including other RCs) — this is the **delta-range base**.
     - If the delta-range base turns out to be the same as the full-range base (this is the first RC of the cycle), there's no meaningful delta — treat this as a single-range case, same as a stable release.
   - If `$ARGUMENTS` is a **stable release**, or the RC has no distinct delta-range base, there is only one range: full-range base → HEAD.
   - Run `git log <full-range-base>..HEAD` to get the full commit list. If there are no previous tags, get all commits on the branch.
   - When a distinct delta-range base exists, also run `git log <delta-range-base>..HEAD` to get the subset of commits that are new since the last RC.

2. **Skip non-user-facing commits** — drop commits that are purely:
   - Release version bumps (`release v...`)
   - Lint/typecheck fixes with no behavior change
   - Test-only additions (unless they reveal a notable fix)
   - CI/workflow changes
   - Internal refactors with no visible impact

3. **Rewrite each remaining commit into a user-facing bullet:**
   - Lead with what changed from the USER's perspective, not the developer's
   - Remove technical jargon (file names, function names, CSS properties, React internals)
   - Use present tense ("Add", "Fix", "Improve")
   - Keep each bullet to 1-2 concise sentences
   - Combine commits that are clearly part of the same feature into one bullet
   - When a distinct delta-range base exists, mark a bullet as "new in this RC" if any of its contributing commits fall within the delta-range commit list

4. **Group bullets into sections** (only include sections that have entries):
   - If a distinct delta-range base exists, start with `## New in this RC` — just the bullets marked new-since-last-RC, same style as the other sections
   - Then the full release scope, covering every bullet from the full-range base (including ones already listed under "New in this RC"):
     - `## New` — new modules, pages, major capabilities
     - `## Improved` — enhancements to existing features, UI/UX polish, performance
     - `## Fixed` — bugs that were broken and are now resolved

5. **Write the file** to `RELEASE_NOTES/v$ARGUMENTS.md`. The content should contain ONLY the grouped bullet sections — no title heading, no version number, no preamble. The GitHub Release title already shows the version.

6. **Output** a one-line confirmation of what was written, noting whether a "New in this RC" section was included.

## Example Output (stable release, or first RC of a cycle)

```markdown
## New

- Fullscreen chore chart module with weekly point tracking and star rewards
- Mobile chore management in the remote control page — add, edit, and delete chores and members from your phone

## Improved

- Redesigned remote control page with card-based layout and bottom navigation
- Screen enable/disable toggle — disabled screens stay configurable but skip during rotation

## Fixed

- Display crash on Raspberry Pi when generating unique IDs over plain HTTP
- Chore chart preview in the editor not updating after saving changes
```

## Example Output (later RC in a cycle, e.g. v1.8.0-rc.2)

```markdown
## New in this RC

- Chore chart preview in the editor not updating after saving changes

## New

- Fullscreen chore chart module with weekly point tracking and star rewards
- Mobile chore management in the remote control page — add, edit, and delete chores and members from your phone

## Improved

- Redesigned remote control page with card-based layout and bottom navigation
- Screen enable/disable toggle — disabled screens stay configurable but skip during rotation

## Fixed

- Display crash on Raspberry Pi when generating unique IDs over plain HTTP
- Chore chart preview in the editor not updating after saving changes
```
