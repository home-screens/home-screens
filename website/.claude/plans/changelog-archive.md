# Changelog Archive Page

## Trigger

When `RELEASE_NOTES/` contains more than 10 stable release files (i.e. `getChangelog().length > RECENT_ENTRY_LIMIT`), the "Older releases" button on `/changelog` becomes visible but currently links to a page that doesn't exist. Ship this plan before that happens.

**Current state:** 3 stable releases (v0.23.0, v0.25.0, v1.0.0). At ~3 stable releases per month, the trigger fires around release 11 — roughly mid-July 2026.

## What already exists

- `website/src/lib/changelog.ts` exports `getChangelog()` (all stable entries, newest-first) and `RECENT_ENTRY_LIMIT = 10`
- `website/src/app/(marketing)/changelog/page.tsx` slices to `RECENT_ENTRY_LIMIT` and passes `hasArchive` to the `Changelog` component
- `website/src/components/Changelog.tsx` conditionally renders `<Button href="/changelog/archive">Older releases</Button>` when `hasArchive` is true
- Jump nav pill strip and anchor permalink icons are already wired up and will work on both pages without changes

## Steps

### 1. Create the archive page

File: `website/src/app/(marketing)/changelog/archive/page.tsx`

- Server component (same pattern as the main changelog page)
- Call `getChangelog()`, slice from `RECENT_ENTRY_LIMIT` onward: `allEntries.slice(RECENT_ENTRY_LIMIT)`
- Pass to `<Changelog entries={archivedEntries} hasArchive={false} />`
- Metadata:
  - `title: { absolute: 'Archived Releases — Home Screens' }`
  - `description`: mention the version range (e.g. "Releases v0.23.0 through v0.XX.0")
  - `alternates.canonical`: `https://homescreens.dev/changelog/archive`
  - OG + Twitter cards
- JSON-LD: `Article` schema with `datePublished` = oldest entry date, `dateModified` = last archived entry date
- Add a "Back to recent releases" link above the timeline (use `<Button href="/changelog" variant="outline">`)

### 2. Update the hero for the archive page

The `Changelog` component's hero currently says "What's new" — that's wrong for archived releases. Options:

- **Option A (minimal):** Add optional `title`/`subtitle` props to `<Changelog>` and override them from the archive page. Hero becomes "Older releases" / "Previous stable versions that are no longer shown on the main changelog."
- **Option B (extract hero):** Move the hero into each page file and make `<Changelog>` render only the timeline. More flexible but more churn.

Recommend **Option A** — it's a two-prop change and avoids restructuring. The hero's structure (badge, h1, subtitle, CTA buttons) stays identical; only the text content changes.

### 3. Add to sitemap

In `website/src/app/sitemap.ts`, add:

```ts
// Only include archive in sitemap when it has content
if (allEntries.length > RECENT_ENTRY_LIMIT) {
  const archivedEntries = allEntries.slice(RECENT_ENTRY_LIMIT);
  const lastArchived = archivedEntries[0]; // newest archived entry
  entries.push({
    url: `${baseUrl}/changelog/archive`,
    lastModified: lastArchived?.date ? new Date(lastArchived.date) : new Date(),
    changeFrequency: 'yearly',
    priority: 0.7,
  });
}
```

Note: `changeFrequency: 'yearly'` because archived content rarely changes (only when the boundary shifts to push another release into the archive).

### 4. Update footer

In `website/src/components/Footer.tsx`, no change needed — "Changelog" link already points to `/changelog`, which links onward to the archive. Don't add a separate archive link to the footer; it's a drill-down, not a top-level destination.

### 5. Verify

- `npm run build` succeeds with both `/changelog` and `/changelog/archive` in the route list
- `/changelog` shows newest 10, "Older releases" button visible and links to `/changelog/archive`
- `/changelog/archive` shows entries 11+, "Back to recent releases" button links to `/changelog`
- Jump nav and anchor icons work on both pages
- `sitemap.xml` includes `/changelog/archive` with correct `lastModified`
- JSON-LD `datePublished`/`dateModified` are correct on both pages

## What NOT to do

- Don't paginate further (e.g. `/changelog/archive/2`, `/changelog/archive/3`). If we ever have 20+ archived releases, revisit — but that's years away at the current pace.
- Don't add the archive page before the threshold is hit. An empty or near-empty archive page is thin content and a wasted crawl budget entry.
- Don't change `RECENT_ENTRY_LIMIT` without checking that the archive page exists — raising the limit without an archive means old releases silently disappear from the site.
