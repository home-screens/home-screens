Generate user-friendly release notes for Home Screens version $ARGUMENTS.

## Steps

1. **Get commits since the last relevant tag:**
   Determine the base tag to diff from:
   - If `$ARGUMENTS` is a **pre-release** (contains `-rc`), use the most recent tag before HEAD (any tag, including other RCs).
   - If `$ARGUMENTS` is a **stable release** (no `-rc`), find the most recent **stable** tag (skip tags containing `-rc`, `-beta`, `-alpha`). Use: `git tag --sort=-v:refname | grep -v -e '-rc' -e '-beta' -e '-alpha' | head -1`
   Run `git log <base-tag>..HEAD` to get all commit messages. If there are no previous tags, get all commits on the branch.

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

4. **Group bullets into sections** (only include sections that have entries):
   - `## New` — new modules, pages, major capabilities
   - `## Improved` — enhancements to existing features, UI/UX polish, performance
   - `## Fixed` — bugs that were broken and are now resolved

5. **Write the file** to `RELEASE_NOTES/v$ARGUMENTS.md`. The content should contain ONLY the grouped bullet sections — no title heading, no version number, no preamble. The GitHub Release title already shows the version.

6. **Output** a one-line confirmation of what was written.

## Example Output

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
