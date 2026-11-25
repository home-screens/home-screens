---
name: docs-audit
description: "Audit Home Screens documentation against the live codebase and patch anything that drifted since the last release tag. Triggers on: '/docs-audit', 'audit the docs', 'update docs since the last release', 'check docs for stale counts', 'sync documentation', 'are the docs still accurate'. Compares README.md, CLAUDE.md, and every website docs page against source-of-truth files (package.json, module-registry, weather providers, API routes, types). Keeps user-facing pages plain-spoken and friendly; routes developer-only details into the website Reference section. Read-only until the user approves a change list."
---

# Docs Audit

## Overview

Walk every piece of standing documentation in this repo, compare it against the actual code, and patch anything that drifted since the last release. This is **not** release-notes generation (use `/release-notes` for that). This skill keeps the *evergreen* docs accurate so a brand-new user reading the README, the marketing pages, or the docs site never sees a stale count or a removed feature.

**Core principle:** Source of truth wins. The repo's code is always right; docs are out-of-date until proven otherwise. Be loud about counts, names, and version-anchored claims; be gentle about prose.

**Audience rule:** User-facing surfaces (README features list, `/docs`, Introduction, Guides) stay friendly, plain-spoken, and free of internal jargon. Developer details (file paths, schema fields, registry mechanics, plugin ABIs) belong in the website **Reference** section (`/docs/development`, `/docs/api`, `/docs/configuration`, `/docs/module-reference`, `/docs/plugins`, `/docs/faq`). If you're tempted to put `editor-store.ts` in a Guide, you're in the wrong place.

**Announce at start:** "I'm using the docs-audit skill. I'll diff the docs against the codebase since the last release tag and propose updates before changing anything."

## When To Use

Use this skill when:
- The user invokes `/docs-audit` or asks to audit/update/sync docs
- A release just shipped and the docs need to catch up
- Module count, view count, weather provider count, or any other "N of these" claim needs verification

Do not use this skill when:
- The user wants release notes (use the `/release-notes` slash command instead; they pair, but they're separate jobs)
- The user only wants to *write* a single new docs page (just write it directly)
- The repo has no `package.json` or no `website/` directory (this skill is repo-specific)

## The Process

### Step 1: Establish The Baseline

Find the last release tag and the current commit. Both are needed: the tag is "what was true when we last published" and HEAD is "what is true now."

```bash
# Latest stable release (skip RC/beta/alpha)
git tag --sort=-v:refname | grep -v -e '-rc' -e '-beta' -e '-alpha' | head -1

# Current package.json version (the "claim" the docs should match)
node -p "require('./package.json').version"

# What changed since the tag
git log <tag>..HEAD --oneline
```

If `package.json` version is **ahead of** the latest stable tag, treat the audit window as `<latest-stable-tag>..HEAD`; the in-flight changes still need their docs to land. If they're equal, the window is `<previous-stable-tag>..HEAD` (catch up the most recent shipped release). State which window you picked and why in one sentence to the user.

### Step 2: Capture Source-Of-Truth Values

Before reading a single doc, gather the live numbers from code. These are the facts the docs *must* agree with. Cache them in your working memory for the rest of the session.

| Claim | Where the truth lives | How to count |
|---|---|---|
| Built-in module count | `src/lib/module-registry.ts` | Count entries in the registered map; cross-check `ModuleType` union in `src/types/config.ts` |
| Module categories | `src/lib/module-registry.ts` | Distinct `category` values |
| Per-module view counts (e.g., clock 18, weather 8) | The module's own component or its config interface in `src/types/config.ts` | Count `view` enum members or switch arms |
| Weather provider count + names | `src/lib/weather/` | Count provider files / factory entries |
| Standings leagues | `src/components/modules/Standings*` and the standings provider config | Count league enum members |
| API route count | `src/app/api/**/route.ts` | `find src/app/api -name route.ts \| wc -l` |
| Display fields / multi-display schema | `src/types/config.ts` (`DisplayNode`, `ScreenConfiguration`) | Read the type |
| Schema version / migration version | `src/lib/config.ts` | Look for `SCHEMA_VERSION` or migration array |
| Current product version | `package.json` `"version"` | Direct read |
| Plugin ABI surface | `src/types/plugins.ts` and `window.__HS_SDK__` exports | Read both |
| Install script flags (`--display-only`, `--port`, `--version`, `--desktop`) | `scripts/install.sh` | Grep for `--<flag>` |

Anything else that the docs *count* is fair game. When in doubt, verify.

If a count in step 2 cannot be derived in roughly two tool calls, **don't guess and don't assert it in docs.** Either drop the claim from the doc or pose the question to the user. Inventing a number is the worst failure mode of this skill.

### Step 3: Inventory The Docs

The full set of standing docs to audit:

**Repo-root user surfaces:**
- `README.md`: public GitHub face. Tone: friendly, marketing-adjacent, scannable. Feature bullets, screenshots, install commands.
- `CLAUDE.md`: agent + contributor orientation. Tone: dense, technical, but accurate; no marketing copy.

**Website (`website/content/docs/<slug>.md`)**, grouped by `website/src/lib/docs-navigation.ts`. User-facing groups are plain-spoken, task-first, and free of code-internal jargon; Reference is where paths, types and endpoints live.

- **Start here** (user-facing): `index.md` (Overview, with the glossary), `what-to-buy.md`, `getting-started.md` (Install), `first-screen.md`, `remote-control.md` (On your phone)
- **Set up your content** (user-facing): `weather.md`, `calendars.md` (also holds the API keys table), `chores.md`, `meals.md`, `backgrounds.md` (Photos and backgrounds), `news.md`
- **Customize** (user-facing): `editor.md`, `modules.md`, `profiles.md`, `plugins.md` (installing and signing in, not authoring)
- **More displays** (user-facing): `multi-display.md`, `voice-control.md`
- **Help** (user-facing, editor-first answers): `troubleshooting.md`, `faq.md`
- **Reference** (developer-facing): `raspberry-pi.md` (Raspberry Pi internals), `networking.md`, `configuration.md`, `module-reference.md`, `api.md`, `plugin-development.md`, `development.md`

Every slug the app links to must keep resolving: `grep -rn "homescreens.dev/docs" src` lists them (the Defaults pages' Learn-more map is `src/components/editor/settings/useDefaultsPageHeader.ts`). Screenshots are renders from `npm run docs:shots` (`website/scripts/capture-docs-shots.mts`), placed with the `{% screenshot name="..." /%}` tag; re-run the script after any label or layout change rather than editing an image.

If `website/src/lib/docs-navigation.ts` has changed since the last release, treat the **navigation file itself** as a doc to audit: a new section there means a new page to verify.

**Generated reference tables.** Three Reference pages render their tables from the code, not from hand-written Markdown: every module's option table on `module-reference.md` (`{% module-reference %}`), every type table on `configuration.md` (`{% type-reference %}`), and the All endpoints table on `api.md` (`{% endpoint-list %}`). `npm run docs:schema` (`scripts/generate/extract-docs-schema.ts`) writes them to `website/content/generated/schema.json` from the module registry, the config types and the route files, and `src/lib/__tests__/docs-schema.test.ts` fails when that file is stale, a field has no description, or a description leaks an em-dash or a plan reference. A field's description is the first paragraph of its JSDoc (in `src/types/config.ts`, or the data-file type's own file); fix wording there, never in the page. What stays hand-written, and in scope for every pass: the prose in each `{% module %}` and `{% category %}` block, the Event and day rules, Module Styling and Settings every module shares sections, the Configuration page's prose (data files, validation rules, migrations, backups), and the API page's Access, Display Control, Chores, Meals, Timers and Backups sections.

Glob the docs first (`ls website/content/docs/*.md`) instead of trusting the list above blindly; pages may have been added or removed.

### Step 4: Find Drift

Run these passes in order. Stop and **record findings** as you go. Do not fix anything yet.

**Pass A, counted claims (highest signal, lowest effort):**

For each row in the Step 2 table, grep the docs for the claim and compare. Skip the generated tables (see Step 3): `npm test -- docs-schema` checks those. Common patterns:

```bash
# Module count drift
grep -rn -E "[0-9]+ (built-in )?module(s| types)" \
  README.md CLAUDE.md website/content/docs

# Weather provider count drift
grep -rn -E "[0-9]+ weather provider" README.md CLAUDE.md website/content/docs

# View counts (clock, weather, calendar, etc.)
grep -rn -E "(clock|weather|calendar|date|chore|meal|standings|affirmations|sunrise|sports) \([0-9]+ (view|league)" \
  README.md CLAUDE.md website/content/docs

# Category count
grep -rn -E "[0-9]+ categor" README.md CLAUDE.md website/content/docs

# API route count
grep -rn -E "[0-9]+ (route files?|API routes?)" README.md CLAUDE.md website/content/docs
```

Anything not matching the live count is drift. Note the file, line, the claimed number, and the real number.

**Pass B, named-feature claims:**

Claims like "9 weather providers: OpenWeatherMap, WeatherAPI, ..." must match the actual provider list. Same for "standings (12 leagues)", route group names, install flags, and module names. A correct *count* with a wrong *list* is still drift. Verify both.

**Pass C, schema, types, and code-shape claims:**

Walk every commit in the audit window (Step 1's `git log` output). For each commit, ask: did this change a fact a doc asserts? Common offenders:

- New module type: registry/category counts shift; its Module Reference table is generated (every config field needs a JSDoc description, then `npm run docs:schema`), so add a `{% module %}` block only for prose; the modules guide may want a mention
- New API route: the All endpoints table picks it up from `npm run docs:schema`; write prose only for a display-control, chores, meals, timers or backup endpoint
- Schema field added/removed: the Configuration and Module Reference tables are generated (JSDoc, then `npm run docs:schema`); check the pages' prose and the `CLAUDE.md` data flow section
- Install/CLI flag changes: README Quick Start, `docs/raspberry-pi/page.md`, `docs/getting-started/page.md`
- Plugin SDK additions: `docs/plugins/page.md`, `src/types/plugins.ts`-derived sections
- Removed/deprecated paths (e.g., `screenIds`, `profileIds`): grep both root docs and website for any remaining mentions

For each commit, do a quick "doc impact" judgment: most refactors and test commits are doc-irrelevant, so skip them. Behavior, surface area, counts, and names matter; internal restructuring usually doesn't.

**Pass E, settings paths:**

Every `Settings > A` and `Settings > A > B` phrase in `website/content/docs` must name a real page and tab. `node website/scripts/check-settings-paths.mjs` compares them against `settings.sidebar.navLabels` (and the tab labels) in `src/translations/en-US/editor.json` and prints the ones that do not match. `npx tsx website/scripts/check-docs-pages.mts` (after `cd website && npm run build`) then checks every page for sideways scroll on a phone, literal backticks, broken links and anchors, and unsized images.

**Pass D, tone and audience placement:**

Skim each user-facing page (Introduction, Guides) for things that shouldn't be there:

- File paths from `src/...` (move to Reference if useful, delete if not)
- Type names like `DisplayNode`, `ModuleInstance` (move to Reference)
- Internal store/registry names (`editor-store`, `module-registry`) (move to Reference)
- Words like "atomic", "IIFE", "polling cadence", "command queue" (rephrase or move)

Conversely, skim Reference pages for **missing** developer detail that users had to figure out from code. That's a doc gap to flag.

This pass is judgment-heavy; don't be aggressive. The bar is "would a non-developer reader bounce off this paragraph?" If yes, it belongs in Reference.

### Step 5: Categorize Findings

Group all findings into three buckets before showing the user:

1. **Mechanical**: pure number/name corrections. Low risk; one-line edits. Example: `"5 weather providers"` becomes `"9 weather providers"`.
2. **Surface area**: a feature shipped or got removed and a doc needs a new bullet, a new row, or a deletion. Medium risk; a few lines of writing.
3. **Restructuring**: content is in the wrong tier (dev jargon in a Guide, or a Reference page missing detail users would actually want). Higher risk; touches tone and may require moving text between files.

For each finding record: file, line range, claim/issue, proposed change, bucket. Aim for a tight list: one bullet per fix, not a paragraph.

### Step 6: Present The Plan, Get Approval

Show the user the full grouped plan **before** editing anything. Format:

```text
Audit window: <base-tag>..HEAD (<N> commits)
Source-of-truth snapshot: <K> modules, <W> weather providers, <R> API routes, schema v<S>

Mechanical (<count>):
  - README.md:19: "5 weather providers" becomes "9 weather providers"
  - CLAUDE.md:??: ...
  ...

Surface area (<count>):
  - docs/modules/page.md: add row for new "screen-level scheduling" capability shipped in <commit>
  - docs/module-reference/page.md: new options table for <module>

Restructuring (<count>):
  - docs/editor/page.md:120-145: file paths from src/components/... should move to docs/development/page.md (or be deleted)

Skipping (<count>):
  - <commit-sha> introduced an internal refactor with no public surface, no doc change needed
```

Then ask one question (use `AskUserQuestion` if available): **"Apply all, apply selectively, or stop here?"**

Do not start editing until the user answers.

### Step 7: Apply Edits Carefully

When applying:

- One logical change per `Edit` call. Big multi-edit blocks make review harder and increase the chance of a mismatched `old_string`.
- For counts that appear in many files (e.g., the module count), edit them in a deliberate sweep and report how many files changed.
- Match the surrounding tone. If the README bullet is plain English, keep it plain English; if the Reference page is a tight options table, match the table style.
- Preserve frontmatter. The website pages have YAML frontmatter at the top with `title`, `nextjs.metadata.description`, etc. The `description` strings often *also* contain a count. Check it.
- Never invent a release date or a version number you didn't read from `package.json` or a tag.

### Step 8: Verify

After edits:

```bash
# Re-run the same greps from Pass A; every reported drift should now be zero
grep -rn -E "[0-9]+ (built-in )?module(s| types)" README.md CLAUDE.md website/content/docs
grep -rn -E "[0-9]+ weather provider" README.md CLAUDE.md website/content/docs

# Build the website to catch broken Markdoc syntax (use --webpack; Markdoc is not Turbopack-compatible)
cd website && npm run build -- --webpack
```

If the website build fails, fix the Markdoc syntax before reporting done. If a grep still surfaces an old number, you missed a file. Go back to Step 7.

Report back to the user with a one-paragraph summary: window covered, files touched, count changes made, and anything you flagged but did not change (e.g., "left the modules guide tone restructure as a follow-up, wanted your opinion before rewriting").

## What Not To Touch

- `RELEASE_NOTES/v*.md`: these are immutable historical records. Use `/release-notes` to write a new one; never edit an existing one.
- `package.json` `version`: that's a release-script job, not a docs-audit job.
- Generated files (`.next/`, build artifacts).
- Inline code comments: those are governed by the repo's no-comments style; don't add them as a side effect of doc work.
- Plans/specs under `.claude/plans/` and `.claude/specs/`: working docs, intentionally uncommitted, out of scope.

## Behavior Notes

- **Ground truth wins, always.** If a commit message implies one thing but the code says another, trust the code.
- **Friendly ≠ vague.** A user-facing bullet should still have the right number; "39 built-in modules" is friendly *and* accurate. Don't soften the number to "lots of modules" to avoid maintaining it.
- **Reference is dense, not lazy.** When you push dev detail out of a Guide and into a Reference page, write it well: file path, what it's for, why it matters. A bare path with no context is worse than no entry.
- **Counts grow; never round.** Report the exact module count, not a "40+" approximation. A round number invites further drift.
- **Don't restructure on autopilot.** Pass D's audience moves should be proposed in Step 6 and only applied if the user approves; tone changes are easy to over-do.
- **Read-only until approval.** Steps 1 to 5 do not edit any docs. The first edit happens after Step 6's approval.

## Integration

Pairs with: `/release-notes` (release notes summarize *what changed*; this skill ensures the standing docs *match*).
Adjacent skill: `commit` (use after edits to land them).
