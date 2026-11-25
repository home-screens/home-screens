Generate user-friendly release notes for Home Screens version $ARGUMENTS.

## Steps

1. **Determine tag ranges:**
   - Find the last **stable** tag (skip `-rc`, `-beta`, `-alpha` and the nightly `-dev` tags). This is the **full-range base**, covering everything in the potential release so far: `git tag --sort=-v:refname | grep -v -e '-rc' -e '-beta' -e '-alpha' -e '-dev' | head -1`
   - If `$ARGUMENTS` is a **pre-release** (contains `-rc` or `-beta`), also find the most recent tag before HEAD that is not a nightly (other RCs and betas count, `-dev` tags never do). This is the **delta-range base**.
     - If the delta-range base turns out to be the same as the full-range base (this is the first RC of the cycle), there's no meaningful delta. Treat this as a single-range case, same as a stable release.
   - If `$ARGUMENTS` is a **stable release**, or the RC has no distinct delta-range base, there is only one range, from the full-range base to HEAD.
   - Run `git log <full-range-base>..HEAD` to get the full commit list. If there are no previous tags, get all commits on the branch.
   - When a distinct delta-range base exists, also run `git log <delta-range-base>..HEAD` to get the subset of commits that are new since the last RC.

2. **Find everyone who contributed.** Do this over the **full range**, before any commit is dropped or merged into another bullet, so nobody is lost along the way. A stable release covers every RC and beta of its cycle, so its list is the whole cycle's.
   - Merged pull requests are the main source, because they carry the GitHub login: `gh pr list --state merged --base main --limit 200 --search "merged:>=<full-range base date, YYYY-MM-DD>" --json number,title,author,mergeCommit,mergedAt`, with the date from `git log -1 --format=%cs <full-range-base>`. Keep the ones whose merge commit is in the range (`git merge-base --is-ancestor <sha> HEAD` and not an ancestor of the base).
   - Then catch work that did not arrive as a pull request: `git log <full-range-base>..HEAD --format='%H %an <%ae>'` for authors, and `git log <full-range-base>..HEAD --format='%(trailers:key=Co-authored-by,valueonly)'` for co-authors.
   - Turn each person into a GitHub login, never a display name. A `12345+login@users.noreply.github.com` address holds it; otherwise ask GitHub: `gh api repos/home-screens/home-screens/commits/<sha> --jq '.author.login'`. If a login cannot be found, stop and say who is unresolved instead of guessing or leaving them out.
   - Leave out the owner (`agent462`) and bots (`dependabot[bot]`, `github-actions[bot]`).
   - Keep the result as a list of logins with what each person did (their pull request titles), in order of first contribution. It feeds the bullet credits in step 4 and the Thanks section in step 7, and step 9 checks against it.

3. **Skip non-user-facing commits.** A contributor whose only work is dropped here still gets thanked in step 7. Drop commits that are purely:
   - Release version bumps (`release v...`)
   - Lint/typecheck fixes with no behavior change
   - Test-only additions (unless they reveal a notable fix)
   - CI/workflow changes
   - Internal refactors with no visible impact

4. **Rewrite each remaining commit into a user-facing bullet:**
   - Lead with what changed from the USER's perspective, not the developer's
   - Remove technical jargon (file names, function names, CSS properties, React internals)
   - Use present tense ("Add", "Fix", "Improve")
   - Keep each bullet to 1-2 concise sentences. A headline feature gets the headline plus one clause on what it does, never a tour of every tab, toggle and sub-feature
   - Combine commits that are clearly part of the same feature into one bullet
   - A bullet built on a contributor's work ends with the credit as its own sentence, with the login written as an @-mention so GitHub links the person and shows them under the release: "Thanks to @login for the contribution." Two people on one bullet: "Thanks to @one and @two for the contribution."
   - When a distinct delta-range base exists, mark a bullet as "new in this RC" if any of its contributing commits fall within the delta-range commit list

5. **Collapse classes of fixes.** When several fixes belong to one class, write one bullet that names the class and lists the members in a clause each, instead of one bullet per fix:
   - Group by the thing that broke, not by commit: "Photo fixes: videos shown from the phone fill the wall, sideways photos report their upright size, and folder delete reports the right thing."
   - Typical classes: wall freshness, photo library, chores and rewards, calendar, weather, dates and times, editor canvas, plugins, iCloud, locale labels
   - Wording and layout polish is one bullet: "A batch of wording and layout tidy-ups across the editor, the phone and the wall." Do not itemize the tidy-ups
   - Several unrelated one-liners go under one "Small fixes:" bullet
   - A fix keeps its own bullet only when it is serious on its own (data loss, security, a crash, a whole surface not working)
   - A collapsed bullet keeps the credit of every contributor whose fix went into it

6. **House style.** Plain, friendly language a non-developer reads without effort. No em-dashes anywhere, use a comma, colon or a new sentence. No "admin", "permission", "enum", "backfill", node or Chromium jargon.

7. **Group bullets into sections** (only include sections that have entries):
   - If a distinct delta-range base exists, start with `## New in this RC` (or `## New in this beta` for a `-beta` tag), holding just the bullets marked new-since-last-RC, same style as the other sections
   - Then the full release scope, covering every bullet from the full-range base (including ones already listed under "New in this RC"):
     - `## New`: new modules, pages, major capabilities
     - `## Improved`: enhancements to existing features, UI/UX polish, performance
     - `## Fixed`: bugs that were broken and are now resolved
   - When step 2 found anyone, end with `## Thanks`: one line that @-mentions every contributor in the full range, whether or not their work kept a bullet of its own, for example "Thanks to @one, @two and @three for their contributions to this release." A pre-release gets it too. Leave the section out when the list is empty.

8. **Write the file** to `RELEASE_NOTES/v$ARGUMENTS.md`. The content should contain ONLY the grouped bullet sections: no title heading, no version number, no preamble. The GitHub Release title already shows the version.

9. **Check the credits.** Read the written file back and confirm every login from step 2 appears as an @-mention in the `## Thanks` line, and that no @-mention names someone who is not in the list. Fix the file before going on.

10. **Output** a one-line confirmation of what was written, noting whether a "New in this RC" section was included and listing the contributors that were tagged (or saying there were none).

## Example Output (stable release, or first RC of a cycle)

```markdown
## New

- Fullscreen chore chart module with weekly point tracking and star rewards. Thanks to @octocat for the contribution.
- Mobile chore management in the remote control page, so you can add, edit, and delete chores and members from your phone

## Improved

- Redesigned remote control page with card-based layout and bottom navigation
- Screen enable/disable toggle: disabled screens stay configurable but skip during rotation

## Fixed

- Display crash on Raspberry Pi when generating unique IDs over plain HTTP
- Chore chart preview in the editor not updating after saving changes

## Thanks

Thanks to @octocat and @hubot for their contributions to this release.
```

## Example Output (later RC in a cycle, e.g. v1.8.0-rc.2)

```markdown
## New in this RC

- Chore chart preview in the editor not updating after saving changes

## New

- Fullscreen chore chart module with weekly point tracking and star rewards
- Mobile chore management in the remote control page, so you can add, edit, and delete chores and members from your phone

## Improved

- Redesigned remote control page with card-based layout and bottom navigation
- Screen enable/disable toggle: disabled screens stay configurable but skip during rotation

## Fixed

- Display crash on Raspberry Pi when generating unique IDs over plain HTTP
- Chore chart preview in the editor not updating after saving changes
```
